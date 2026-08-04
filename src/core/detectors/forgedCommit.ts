import { tr } from '../../i18n'
import type { Detector, Finding } from '../types'

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

    // 공격 시간대에 푸시된 head 커밋만 검사한다. 저장소 전체를 훑지 않는다.
    const heads = new Map<string, { repo: string; branch: string; sha: string }>()
    for (const ev of ctx.events) {
      if (!ev.head) continue
      const key = `${ev.repo}@${ev.head}`
      if (!heads.has(key)) heads.set(key, { repo: ev.repo, branch: ev.branch, sha: ev.head })
    }

    const all = [...heads.values()]
    let done = 0

    for (const { repo, branch, sha } of all) {
      done++
      // 몇 개 남았는지 알려준다. 조용하면 멈춘 줄 안다.
      if (done % 10 === 0)
        ctx.reportProgress?.(tr().detectors.forgedCommit.progress(done, all.length))

      let commit
      try {
        commit = await ctx.gh.getCommit(repo, sha)
      } catch (err) {
        ctx.reportFailure(
          `${repo}@${sha.slice(0, 8)}`,
          tr().detectors.forgedCommit.commitFailed(String(err)),
        )
        continue
      }

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
      const t = tr().detectors.forgedCommit

      findings.push({
        id: `forged-commit:${repo}:${sha.slice(0, 12)}`,
        detectorId: 'forged-commit',
        attention: 'soon',
        confidence: 'medium',
        repo,
        branch,
        sha,
        title: t.title,
        summary: t.summary(
          commit.authorName,
          commit.authorDate.slice(0, 10),
          commit.committerDate.slice(0, 16).replace('T', ' '),
          days,
        ),
        evidence: [
          { label: `author: ${commit.authorName} / ${commit.authorDate.slice(0, 19).replace('T', ' ')}` },
          {
            label: `committer: ${commit.committerName} / ${commit.committerDate.slice(0, 19).replace('T', ' ')}`,
          },
          { label: t.gapLabelShort(days), detail: t.gapDetail },
          {
            label: t.openCommit,
            href: `https://github.com/${repo}/commit/${sha}`,
          },
        ],
      })
    }

    return findings
  },
}
