/**
 * 되돌리기.
 *
 * 이 도구에서 유일하게 저장소를 바꾸는 동작이다.
 * 계획을 먼저 만들고, 사람이 잠금을 풀어야 실행된다 (SAFETY.md 10번).
 */

export type RestoreOutcome = 'ok' | 'failed' | 'skipped' | 'already'

export interface RestoreEntry {
  repo: string
  branch: string
  /** 실행 직전의 SHA. 되돌릴 때 쓴다. */
  previousSha: string
  restoredTo: string
  outcome: RestoreOutcome
  error?: string
  at: string
}

export interface RestorePlan {
  id: string
  caseId: string
  createdAt: string
  /** 사람이 승인했는지. 승인 없이는 실행 단계로 못 간다. */
  approvedAt?: string
  entries: Array<{
    repo: string
    branch: string
    from: string
    to: string
    isProtected: boolean
  }>
}

export interface RestoreRecord {
  planId: string
  startedAt: string
  finishedAt?: string
  entries: RestoreEntry[]
}
