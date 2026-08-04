import { tr } from '../i18n'
import type { GitHubClient } from './github'
import type { CaseFile, RestoreEntry, RestorePlan, RestoreRecord } from './types'

/**
 * 되돌리기.
 *
 * 이 파일만 저장소를 **바꾼다.** 나머지는 전부 읽기만 한다.
 * 그래서 안전장치를 여기 몰아뒀다 (SAFETY.md 9번).
 *
 *   1. 계획을 먼저 만들고, 사람이 승인해야 실행한다
 *   2. 실행 직전 상태를 백업으로 남긴다 - 되돌리기를 되돌릴 수 있어야 한다
 *   3. 대상을 좁히는 근거(의심 계정 또는 신호)가 없으면 **거부한다**
 *   4. 보호 규칙이 걸린 브랜치는 미리 알려주고, 규칙을 우리가 바꾸지 않는다
 *
 * 4번이 특히 중요하다. 보호 규칙을 코드가 임의로 풀면 그게 곧 백도어다.
 * 막히면 막혔다고 말하고, 푸는 건 사람이 GitHub 에서 직접 하게 둔다.
 */

export interface PlanCheck {
  ok: boolean
  reason?: string
}

/**
 * 되돌려도 되는 상황인지 본다.
 *
 * 시간대만 잡고 전부 되돌리면 그 시간대의 정상 작업까지 날아간다.
 * 의심 계정을 지정했거나 눈에 띄는 신호가 있어야 대상이 좁혀진다.
 */
export function canRestore(c: CaseFile): PlanCheck {
  const targets = c.branches.filter((b) => b.status === 'changed' && b.restoreTarget)
  if (targets.length === 0) {
    return { ok: false, reason: tr().reasons.nothingToRestore }
  }
  if (!c.actor && c.findings.length === 0) {
    return {
      ok: false,
      reason:
        tr().reasons.needsFilter,
    }
  }
  return { ok: true }
}

/** 되돌릴 목록을 만든다. 아직 아무것도 바꾸지 않는다. */
export function buildPlan(c: CaseFile): RestorePlan {
  const entries = c.branches
    .filter((b) => b.status === 'changed' && b.restoreTarget && b.currentSha)
    .map((b) => ({
      repo: b.repo,
      branch: b.branch,
      from: b.currentSha!,
      to: b.restoreTarget!,
      isProtected: false,
    }))

  return {
    id: `plan-${Date.now().toString(36)}`,
    caseId: c.id,
    createdAt: new Date().toISOString(),
    entries,
  }
}

/**
 * 보호 규칙이 걸린 브랜치를 미리 찾아둔다.
 *
 * 실행하다 막히는 것보다 시작 전에 아는 게 낫다.
 * 저장소별로 기본 브랜치만 확인해도 대부분 걸러진다 - 전수로 물으면 호출이 폭증한다.
 */
export async function markProtected(
  gh: GitHubClient,
  plan: RestorePlan,
  onProgress?: (done: number, total: number) => void,
): Promise<RestorePlan> {
  const entries = [...plan.entries]
  const looksProtected = /^(main|master|develop|dev|release.*)$/

  const candidates = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => looksProtected.test(e.branch))

  for (const [n, { e, i }] of candidates.entries()) {
    onProgress?.(n + 1, candidates.length)
    try {
      entries[i] = { ...e, isProtected: await gh.isProtected(e.repo, e.branch) }
    } catch {
      // 확인 실패는 '보호됨'으로 본다. 모르면 조심하는 쪽으로.
      entries[i] = { ...e, isProtected: true }
    }
  }

  return { ...plan, entries }
}

/** 백업 파일 내용. 실행 전에 만들어 사용자가 받게 한다. */
export function backupText(plan: RestorePlan): string {
  const rows = [
    ['repo', 'branch', 'from', 'to'].join('\t'),
    ...plan.entries.map((e) => [e.repo, e.branch, e.from, e.to].join('\t')),
  ]
  return rows.join('\n')
}

export interface RestoreProgress {
  done: number
  total: number
  current: string
}

/**
 * 실제로 되돌린다.
 *
 * 한 건 실패해도 멈추지 않는다 - 나머지는 되돌려야 하고,
 * 실패한 것은 기록에 남겨 사람이 따로 처리하게 한다.
 */
export async function executePlan(
  gh: GitHubClient,
  plan: RestorePlan,
  onProgress?: (p: RestoreProgress) => void,
): Promise<RestoreRecord> {
  const startedAt = new Date().toISOString()
  const entries: RestoreEntry[] = []

  for (const [i, e] of plan.entries.entries()) {
    onProgress?.({ done: i + 1, total: plan.entries.length, current: `${e.repo} / ${e.branch}` })

    if (e.from === e.to) {
      entries.push({
        repo: e.repo,
        branch: e.branch,
        previousSha: e.from,
        restoredTo: e.to,
        outcome: 'already',
        at: new Date().toISOString(),
      })
      continue
    }

    try {
      const sha = await gh.updateRef(e.repo, e.branch, e.to)
      entries.push({
        repo: e.repo,
        branch: e.branch,
        previousSha: e.from,
        restoredTo: sha,
        outcome: sha === e.to ? 'ok' : 'failed',
        error: sha === e.to ? undefined : tr().reasons.unexpectedSha,
        at: new Date().toISOString(),
      })
    } catch (err) {
      entries.push({
        repo: e.repo,
        branch: e.branch,
        previousSha: e.from,
        restoredTo: e.to,
        outcome: 'failed',
        error: describeFailure(err),
        at: new Date().toISOString(),
      })
    }
  }

  return { planId: plan.id, startedAt, finishedAt: new Date().toISOString(), entries }
}

/** 실패 이유를 사람 말로 */
function describeFailure(err: unknown): string {
  const msg = String((err as Error)?.message ?? err)
  if (msg.includes('422') || msg.includes('protected')) {
    return tr().reasons.protectedBranch
  }
  if (msg.includes('403')) return tr().reasons.forbidden
  if (msg.includes('404')) return tr().reasons.branchNotFound
  return msg
}

/** 결과 요약 */
export function summarizeRestore(r: RestoreRecord) {
  const by = (o: RestoreEntry['outcome']) => r.entries.filter((e) => e.outcome === o).length
  return {
    ok: by('ok'),
    already: by('already'),
    failed: by('failed'),
    total: r.entries.length,
  }
}
