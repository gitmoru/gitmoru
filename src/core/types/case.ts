/**
 * 사건 하나.
 *
 * `CaseFile` 이 이 도구의 중심이다. 화면도 MCP 도 결국 이걸 읽는다.
 * 페이로드 원문은 절대 담지 않는다 (SAFETY.md 8번).
 */

import type { BranchChanges } from './changes'
import type { Finding } from './finding'
import type { PushShape } from './github'
import type { RestoreRecord } from './restore'

/**
 * 브랜치 상태 - **사실만 적는다. 판정하지 않는다.**
 *
 * 이 도구는 "감염됐다/안 됐다"를 말하지 않는다. 규칙이 못 잡은 공격을
 * "이상 없음"으로 칠하는 순간 도구가 거짓말을 하게 되기 때문이다.
 * 판단은 diff 를 읽는 사람이나 에이전트가 한다.
 */
export type BranchStatus =
  | 'changed' // 그 시간대에 내용이 바뀌었고, 아직 그 상태다
  | 'reverted' // 바뀌었다가 공격 직전 커밋으로 되돌아왔다
  | 'untouched' // 시간대 안에 푸시는 있었지만 내용 변화가 없다
  | 'unknown' // 확인하지 못했다 (조회 실패, 기록 잘림). 절대 다른 값으로 접지 않는다

export interface TimeWindow {
  /** ISO 8601. 내부는 항상 UTC 로 보관하고 표시할 때만 변환한다. */
  since: string
  until: string
  /** 사람이 넣은 시각을 어느 시간대로 읽었는지 (IANA 이름). 요약문에 그대로 쓴다. */
  displayTz: string
}

export interface BranchState {
  repo: string
  branch: string
  status: BranchStatus
  currentSha: string | null
  /** 공격 직전 커밋. 복구 대상. */
  restoreTarget?: string
  isProtected: boolean
  /** 이 브랜치에 붙은 신호 id 목록. 비어 있어도 안전하다는 뜻이 아니다. */
  findingIds: string[]
  /** 바뀐 파일 수. 신호가 0이어도 이 값이 크면 사람이 읽어야 한다. */
  changedFiles: number
  /** status 가 unknown 일 때 그 이유 */
  unknownReason?: string
  /**
   * 이 브랜치에 일어난 강제 푸시.
   *
   * 없으면 빈 배열이다. 확인하지 못했으면 `kind: 'unknown'` 이 들어 있다.
   * 비어 있다는 게 "강제 푸시가 없었다" 는 뜻은 아니다 - 기록이 안 남은 것일 수도 있다.
   */
  forcedPushes: PushShape[]
  /** 이 브랜치에서 사라진 커밋 수의 합 */
  droppedCommits: number
}

export interface ScanStats {
  reposScanned: number
  branchesScanned: number
  treesFetched: number
  /** 검사 실패 건수. 0 이 아니면 화면에서 "확인 불가" 를 반드시 노출한다. */
  failures: number
}

export interface ScanFailure {
  target: string
  reason: string
  at: string
}

export interface TimelineEntry {
  at: string
  repo: string
  branch: string
  actor: string
  kind: 'push' | 'restore' | 'note'
}

/**
 * 목록에 뜨는 한 줄.
 *
 * 사건 전체를 읽지 않고도 "언제 뭘 훑었는지" 를 고를 수 있어야 한다.
 * 실패 건수를 여기 넣는 이유는, 목록에서부터 **완전하지 않은 조사**가 보여야 하기 때문이다.
 */
export interface CaseSummary {
  id: string
  title: string
  createdAt: string
  window: TimeWindow
  scope: { orgs: string[]; repos: string[] }
  branches: number
  changedFiles: number
  findings: number
  failures: number
}

/** 보관된 목록. 못 읽은 파일도 같이 돌려준다 (SAFETY.md 11번). */
export interface CaseListing {
  cases: CaseSummary[]
  /** 깨졌거나 우리 모양이 아닌 파일 이름. 조용히 빼지 않는다. */
  unreadable: string[]
}

export interface CaseFile {
  version: 1
  id: string
  /** 사용자가 붙이는 이름. 나중에 기록을 찾을 때 쓴다. */
  title: string
  createdAt: string
  scope: {
    orgs: string[]
    repos: string[]
  }
  window: TimeWindow
  actor?: string
  /** 어떤 탐지기를 어떤 설정으로 돌렸는지. 재현 가능하게 남긴다. */
  detectorConfig: Record<string, { enabled: boolean; options: Record<string, unknown> }>
  stats: ScanStats
  failures: ScanFailure[]
  timeline: TimelineEntry[]
  branches: BranchState[]
  /**
   * 시간대 안에 실제로 바뀐 파일 목록.
   * 이게 이 도구의 1차 산출물이고, 신호(findings)는 이걸 정렬하기 위한 보조다.
   */
  changes: BranchChanges[]
  /** 탐지 신호. 없다고 해서 안전하다는 뜻이 아니다. */
  findings: Finding[]
  restore?: RestoreRecord
}
