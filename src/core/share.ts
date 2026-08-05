import { tr } from '../i18n'
import { utcToZoned, zoneLabel } from './time'
import { summarize } from './scan'
import type { CaseFile } from './types'

/**
 * 결과를 남한테 옮길 수 있는 글로 바꾼다.
 *
 * 사고를 확인한 다음 실제로 하는 일은 **누군가에게 알리는 것**이다.
 * 팀 채널에 붙여넣을 수 있는 형태가 아니면 도구가 거기서 끊긴다.
 *
 * **화면 말투를 그대로 쓰지 않는다.** 화면에서는 모루가 친근하게 말해도,
 * 이건 팀에 보내는 글이라 담담한 문체여야 한다.
 * `못 판 곳` 같은 우리끼리 쓰는 말도 `확인 실패` 로 바꿔 적는다.
 *
 * 다만 원칙은 그대로다.
 *   - "안전합니다" 라고 쓰지 않는다
 *   - 확인 못 한 게 있으면 **맨 끝이 아니라 눈에 띄는 자리**에 적는다
 *   - 규칙에 안 걸린 것도 사람이 봐야 할 몫으로 숫자를 남긴다
 */

// 시각은 훑을 때 쓴 시간대로 되돌려 적는다. 읽는 사람이 넣은 숫자와 같아야 한다.

export function shareText(c: CaseFile): string {
  const s = summarize(c)
  const t = tr().share
  const lines: string[] = []

  lines.push(`[${c.title}]`)

  const scope = c.scope.repos.length
    ? c.scope.repos.join(', ')
    : c.scope.orgs.join(', ') || t.scopeNone
  lines.push(t.scope(scope))
  lines.push(
    t.window(
      utcToZoned(c.window.since, c.window.displayTz),
      utcToZoned(c.window.until, c.window.displayTz),
      zoneLabel(c.window.displayTz),
    ),
  )
  if (c.actor) lines.push(t.actor(c.actor))
  lines.push('')

  lines.push(t.counted(c.stats.reposScanned, s.total))
  lines.push(t.breakdown(s.changed, s.reverted, s.untouched, s.unknown))
  if (s.forcedBranches > 0) lines.push(t.forced(s.forcedBranches, s.droppedCommits))
  if (s.rewrittenBranches > 0) lines.push(t.rewritten(s.rewrittenBranches))
  if (s.autoRun.workflow > 0) lines.push(t.workflow(s.autoRun.workflow))

  // 확인 못 한 게 있으면 여기서 바로 말한다. 맨 끝에 두면 안 읽힌다.
  if (s.unknown > 0 || s.failures > 0) {
    lines.push('')
    lines.push(t.incomplete(s.unknown, s.failures))
  }

  // 조직을 통째로 판 경우, 어느 저장소가 얼마나 당했는지가 제일 먼저 궁금하다
  const byRepo = new Map<string, { changed: number; unknown: number; total: number }>()
  for (const b of c.branches) {
    const cur = byRepo.get(b.repo) ?? { changed: 0, unknown: 0, total: 0 }
    cur.total++
    if (b.status === 'changed') cur.changed++
    if (b.status === 'unknown') cur.unknown++
    byRepo.set(b.repo, cur)
  }

  const notable = [...byRepo.entries()]
    .filter(([, v]) => v.changed > 0 || v.unknown > 0)
    .sort((a, b) => b[1].unknown * 2 + b[1].changed - (a[1].unknown * 2 + a[1].changed))

  if (byRepo.size > 1 && notable.length > 0) {
    lines.push('')
    lines.push(t.byRepo)
    for (const [repo, v] of notable) {
      const bits = [
        v.changed > 0 ? t.repoChanged(v.changed) : null,
        v.unknown > 0 ? t.repoUnknown(v.unknown) : null,
      ].filter(Boolean)
      lines.push(`- ${repo}: ${bits.join(', ')} (${t.repoTotal(v.total)})`)
    }
    const quiet = byRepo.size - notable.length
    if (quiet > 0) lines.push(t.quietRest(quiet))
  }

  const first = c.findings.filter((f) => f.attention === 'first')
  if (first.length > 0) {
    lines.push('')
    lines.push(t.needsReview)
    for (const f of first.slice(0, 12)) {
      const where = f.branch ? `${f.repo} / ${f.branch}` : f.repo
      lines.push(`- ${where}: ${f.summary}`)
    }
    if (first.length > 12) lines.push(t.andMore(first.length - 12))
  }

  lines.push('')
  if (s.changedFiles > 0) {
    lines.push(t.unreviewedNote(s.changedFiles, s.unreviewed))
  } else if (s.unknown === 0) {
    // 안 나왔다고 없다는 뜻이 아니다
    lines.push(t.noChanges)
  }

  return lines.join('\n')
}

/** 한 줄 요약 - 버튼에 미리 보여주는 용도 */
export function shareHeadline(c: CaseFile): string {
  const s = summarize(c)
  const t = tr().share
  if (s.unknown > 0) return t.headlineUnknown(s.unknown, s.changed)
  if (s.changed > 0) return t.headlineChanged(c.stats.reposScanned, s.changed)
  return t.headlineQuiet(c.stats.reposScanned)
}
