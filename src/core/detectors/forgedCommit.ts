import { tr } from '../../i18n'
import type { CommitFacts, Detector, Finding } from '../types'

/**
 * 커밋 메타데이터 위조 탐지.
 *
 * 공격자는 커밋을 새로 만들면서 author 이름, 날짜를 기존 팀원 것으로 위조한다.
 * 하지만 committer 날짜는 실제로 커밋이 만들어진 시각이라 위조 흔적이 남는다.
 *
 * 실제로 겪은 사고에서 나온 모양:
 *   author=7월 29일  committer=8월 3일 18:32  → 닷새 차이
 *   author=작년 6월   이름은 기존 팀원          → 1년 차이
 *
 * 침투 파일이 무엇이든(.vscode, eslint.config.js, postcss.config.js) 이 규칙에는 걸린다.
 * 그래서 파일명 기반 규칙보다 우선한다.
 */
export const forgedCommitDetector: Detector = {
  id: 'forged-commit',
  // 말은 화면에 보일 때 고른다. 언어를 바꾸면 이 자리도 같이 바뀌어야 한다.
  get name() {
    return tr().detectors.forgedCommit.name
  },
  get rationale() {
    return tr().detectors.forgedCommit.rationale
  },
  defaultAttention: 'soon',
  enabledByDefault: true,
  get options() {
    const t = tr().detectors.forgedCommit
    return [
      {
        key: 'minGapHours',
        label: t.gapLabel,
        help: t.gapHelp,
        type: 'number' as const,
        default: 24,
      },
    ]
  },

  async run(ctx): Promise<Finding[]> {
    const minGapMs = Number(ctx.options.minGapHours ?? 24) * 60 * 60 * 1000
    const findings: Finding[] = []

    /*
      비교가 이미 알려준 커밋을 먼저 쓴다.

      예전에는 head 커밋마다 따로 받으러 갔다. 실제 조직을 재보니 그게 전체 요청의 44%
      (996회 중 437회) 였고, 그동안 같은 값이 비교 응답 안에 들어 있었다.

      덤으로 보는 범위가 넓어진다. 예전에는 푸시의 맨 끝 커밋만 봤는데,
      비교는 그 푸시가 들고 온 커밋을 전부 준다.
    */
    const seen = new Set<string>()
    const known: Array<{ repo: string; branch: string; commit: CommitFacts }> = []

    // 비교가 안 된 푸시만 따로 받아온다. 이어지지 않는 기록이 그렇다.
    const heads = new Map<string, { repo: string; branch: string; sha: string }>()

    for (const ev of ctx.events) {
      if (ev.commits) {
        for (const commit of ev.commits) {
          const key = `${ev.repo}@${commit.sha}`
          if (seen.has(key)) continue
          seen.add(key)
          known.push({ repo: ev.repo, branch: ev.branch, commit })
        }
        continue
      }

      /*
        비교가 실패한 푸시다. 여기서 손을 놓으면 **기록이 통째로 갈아치워진 브랜치에서만**
        이 탐지기가 조용해진다. 하필 제일 수상한 자리다.
      */
      if (!ev.head) continue
      const key = `${ev.repo}@${ev.head}`
      if (seen.has(key) || heads.has(key)) continue
      heads.set(key, { repo: ev.repo, branch: ev.branch, sha: ev.head })
    }

    const missing = [...heads.values()]
    let done = 0

    for (const { repo, branch, sha } of missing) {
      done++
      // 몇 개 남았는지 알려준다. 조용하면 멈춘 줄 안다.
      if (done % 10 === 0)
        ctx.reportProgress?.(tr().detectors.forgedCommit.progress(done, missing.length))

      try {
        known.push({ repo, branch, commit: await ctx.gh.getCommit(repo, sha) })
      } catch (err) {
        ctx.reportFailure(
          `${repo}@${sha.slice(0, 8)}`,
          tr().detectors.forgedCommit.commitFailed(String(err)),
        )
      }
    }

    for (const { repo, branch, commit } of known) {
      const sha = commit.sha
      const authored = Date.parse(commit.authorDate)
      const committed = Date.parse(commit.committerDate)
      if (!Number.isFinite(authored) || !Number.isFinite(committed)) continue

      const gap = committed - authored
      if (gap < minGapMs) continue

      // committer 날짜가 우리가 보는 공격 시간대 안에 있어야 의미가 있다.
      const inWindow =
        committed >= Date.parse(ctx.window.since) && committed <= Date.parse(ctx.window.until)
      if (!inWindow) continue

      const days = Math.round(gap / (24 * 60 * 60 * 1000))
      findings.push({
        id: `forged-commit:${repo}:${sha.slice(0, 12)}`,
        detectorId: 'forged-commit',
        attention: 'soon',
        confidence: 'medium',
        repo,
        branch,
        sha,
        facts: {
          kind: 'forged-commit',
          authorName: commit.authorName,
          authorDate: commit.authorDate,
          committerName: commit.committerName,
          committerDate: commit.committerDate,
          gapDays: days,
          commitHref: `https://github.com/${repo}/commit/${sha}`,
        },
      })
    }

    return findings
  },
}
