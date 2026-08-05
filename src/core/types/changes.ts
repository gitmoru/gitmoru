/**
 * 무엇이 바뀌었는지.
 *
 * 이 도구의 **1차 산출물**이다. 탐지 규칙과 무관하게 모으고,
 * 규칙이 못 알아본 공격도 여기에는 남는다 (ADR 0002).
 */

export type ChangeKind = 'added' | 'modified' | 'removed'

/**
 * 의심 시간대에 실제로 바뀐 파일 하나.
 *
 * 탐지 규칙과 무관하게 **무조건** 수집한다.
 * 우리 규칙이 못 알아본 공격도 여기에는 반드시 나타난다.
 */
export interface FileChange {
  path: string
  kind: ChangeKind
  /** 공격 직전 크기 (added 면 없음) */
  sizeBefore?: number
  /** 현재 크기 (removed 면 없음) */
  sizeAfter?: number
  blobBefore?: string
  blobAfter?: string
  /** 이 파일에 붙은 신호 id. 비어 있어도 안전하다는 뜻이 아니다. */
  signalIds: string[]
}

export interface BranchChanges {
  repo: string
  branch: string
  /** 비교 기준: 공격 직전 커밋 */
  baseSha: string
  /** 비교 대상: 현재 커밋 */
  headSha: string
  files: FileChange[]
  /** 트리가 잘려서 일부만 비교했는지. true 면 목록이 완전하지 않다. */
  partial: boolean
}

/**
 * 화면에서 파일 하나를 열 때 넘기는 좌표.
 *
 * 신호가 붙지 않은 파일도 열 수 있어야 한다. 규칙이 못 잡은 공격이 거기 있을 수 있고,
 * 신호가 있는 것만 열리면 화면이 "신호 없는 건 볼 필요 없다" 고 말하는 셈이 된다 (ADR 0002).
 */
export interface FileTarget {
  repo: string
  branch: string
  path: string
  kind: FileChange['kind']
  baseSha: string
  headSha: string
  sizeAfter?: number
}

/** 의심 파일을 나중에 다시 읽어오기 위한 좌표. 내용은 담지 않는다. */
export interface SampleRef {
  repo: string
  path: string
  ref: string
  sizeBytes: number
  blobSha: string
}
