/**
 * gitmoru 도메인 타입.
 *
 * 이 파일은 UI / MCP / CLI 가 공유하는 유일한 계약이다.
 * 핵심 원칙: 모든 화면과 동작은 CaseFile 하나만 바라본다.
 *
 * 주의 - CaseFile 에는 페이로드 원문을 넣지 않는다 (SAFETY.md 7번).
 * 케이스 파일이 악성코드 운반체가 되면 안 되므로 해시, 크기, 경로, 근거만 담는다.
 */

// ─────────────────────────────────────────────────────────────
// 기본
// ─────────────────────────────────────────────────────────────

/** 신호의 주목도. "얼마나 먼저 봐야 하는가"이지 "얼마나 위험한가"가 아니다. */
export type Attention = 'first' | 'soon' | 'later'

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
  /** 사용자가 입력한 기준 시간대. 표시용. */
  /** 사람이 넣은 시각을 어느 시간대로 읽었는지 (IANA 이름). 요약문에 그대로 쓴다. */
  displayTz: string
}

// ─────────────────────────────────────────────────────────────
// 근거 (Evidence)
// ─────────────────────────────────────────────────────────────

/**
 * 사람이 "왜 이게 의심스러운지" 한눈에 보는 단위.
 * label 은 화면에 그대로 뜨므로 숫자를 포함해 구체적으로 쓴다.
 * 예: "정상 926B → 현재 10,148B"
 */
export interface Evidence {
  label: string
  detail?: string
  /** GitHub 웹 링크. 우리 도메인 밖 URL 은 여기에만 허용한다 (사용자가 눌러서 확인). */
  href?: string
}

// ─────────────────────────────────────────────────────────────
// 탐지 결과 (Finding)
// ─────────────────────────────────────────────────────────────

/**
 * 탐지 신호.
 *
 * **판정이 아니라 형광펜이다.** "이건 악성이다"가 아니라
 * "이건 먼저 읽어볼 만하다"를 뜻한다. 최종 판단은 diff 를 읽는 쪽이 한다.
 *
 * 그래서 이름이 Finding 이어도 화면에는 "신호"로 표시하고,
 * 신호가 없다고 해서 안전하다는 뜻이 되지 않게 문구를 쓴다.
 */
export interface Finding {
  id: string
  /** 어느 탐지기가 올렸는지 */
  detectorId: string
  /** 얼마나 먼저 봐야 하는가 */
  attention: Attention
  /** 이 신호가 얼마나 확실한가. 낮다고 무시하라는 뜻은 아니다. */
  confidence: 'high' | 'medium' | 'low'
  repo: string
  branch?: string
  path?: string
  sha?: string
  /** 짧은 제목. 예: "설정 파일 크기가 11배 늘었습니다" */
  title: string
  /** 한 문장 설명 */
  summary: string
  evidence: Evidence[]
  /**
   * 페이로드 원문은 여기 담지 않는다. 필요할 때 API 로 다시 가져온다.
   * 대신 어디서 가져올지만 기록한다.
   */
  sampleRef?: SampleRef
}

// ─────────────────────────────────────────────────────────────
// 변경 내역 - 이 도구의 1차 산출물
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// 탐지기 (Detector) - 플러그인
// ─────────────────────────────────────────────────────────────

/** UI 에서 사용자가 조정할 수 있는 설정 항목 */
export interface DetectorOption {
  key: string
  label: string
  help?: string
  type: 'number' | 'boolean' | 'stringList'
  default: number | boolean | string[]
}

export interface DetectorContext {
  window: TimeWindow
  actor?: string
  /** 스캔 대상 저장소 */
  repos: RepoRef[]
  /** 시간대 안에서 수집한 푸시 이벤트 */
  events: PushEvent[]
  /** 현재 브랜치 상태 (SHA 포함) */
  branches: BranchRef[]
  /**
   * 이미 수집해둔 변경 내역.
   *
   * 탐지기는 **이걸 먼저 본다.** 여기에 파일 경로, 전후 크기, blob 해시가 다 들어 있어서
   * 대부분의 규칙은 API 를 한 번도 안 불러도 된다.
   * 트리를 다시 받으면 브랜치 수만큼 같은 일을 반복하게 된다.
   */
  changes: BranchChanges[]
  /** GitHub 읽기 전용 접근자. 프록시를 통해서만 나간다. */
  gh: GitHubReader
  /** 이 탐지기의 사용자 설정값 */
  options: Record<string, number | boolean | string[]>
  /** 검사 실패를 보고하는 통로. 삼키지 말고 반드시 여기로 올린다. */
  reportFailure: (target: string, reason: string) => void
  /** 오래 걸리는 규칙이 "아직 살아있다"고 알리는 통로. 조용하면 멈춘 줄 안다. */
  reportProgress?: (message: string) => void
}

export interface Detector {
  id: string
  /** 화면에 뜨는 이름 */
  name: string
  /** 이 탐지기가 무엇을 근거로 눈에 띄게 하는지 한 문장 */
  rationale: string
  /** 이 신호를 얼마나 위로 올릴지 */
  defaultAttention: Attention
  /** 기본 활성화 여부 */
  enabledByDefault: boolean
  options?: DetectorOption[]
  run(ctx: DetectorContext): Promise<Finding[]>
}

// ─────────────────────────────────────────────────────────────
// GitHub 원시 데이터
// ─────────────────────────────────────────────────────────────

export interface RepoRef {
  owner: string
  name: string
  /** `owner/name` */
  fullName: string
  defaultBranch: string
  /**
   * 아래 셋은 저장소 목록 응답에 이미 들어 있다. 따로 물어볼 필요가 없다.
   * 문단속에서 볼 대상을 추릴 때 쓴다.
   */
  isAdmin?: boolean
  archived?: boolean
  fork?: boolean
}

/** 저장소로 들어오는 문. 브랜치를 안 건드리고도 열 수 있는 것들이다. */
export type AccessKind = 'deployKey' | 'webhook' | 'invitation'

export interface AccessItem {
  kind: AccessKind
  repo: string
  /** 사람이 알아볼 이름. 키 제목, 웹훅 주소, 초대받은 사람 */
  label: string
  createdAt: string
  /** 웹훅이면 어디로 보내는지. 페이로드라 화면에 그릴 때 무력화한다. */
  target?: string
  /** 읽기 전용 배포 키인지 */
  readOnly?: boolean
  /** GitHub 에서 열어볼 주소 */
  href?: string
}

/** 못 본 이유. 권한이 없는 것과 실패한 것은 다르다. */
export type AccessGap = 'notAdmin' | 'needsScope' | 'failed'

export interface AccessReport {
  /** 기준 시각. 이보다 뒤에 생긴 것을 '최근' 으로 본다. */
  since: string
  /** 기준 시각 뒤에 생긴 것 */
  recent: AccessItem[]
  /** 그 밖에 이미 있던 것. 개수만 센다. */
  existing: Record<AccessKind, number>
  /** 본 저장소 수 */
  checked: number
  /** 못 본 것. 이유별로 나눈다. */
  gaps: Array<{ target: string; why: AccessGap; detail?: string }>
}

export interface BranchRef {
  repo: string
  branch: string
  sha: string
  isProtected?: boolean
}

export interface PushEvent {
  repo: string
  branch: string
  actor: string
  createdAt: string
  /** 푸시 직전에 브랜치가 가리키던 커밋. 복구 타겟의 근거가 된다. */
  before: string
  head: string
  /** 이 푸시가 기록을 덮어썼는지. 확인하기 전에는 비어 있다. */
  push?: PushShape
}

/**
 * 푸시가 어떤 모양이었는지.
 *
 * GitHub 이벤트에는 강제 푸시 여부가 안 들어 있다. 그래서 직접 확인한다.
 * 푸시 전후 커밋을 비교했을 때 **전에 있던 커밋이 지금은 없으면** 기록이 덮어써진 것이다.
 *
 * 이건 판정이 아니라 사실이다. 강제 푸시 자체는 정상 작업에서도 한다.
 * 다만 **남의 브랜치에 강제 푸시가 무더기로 일어났다면** 그건 사람이 봐야 한다.
 */
export interface PushShape {
  /**
   * `fast-forward` - 앞으로만 갔다. 평범한 푸시다
   * `forced`       - 기록을 덮어썼고, 사라진 커밋을 셀 수 있었다
   * `unrelated`    - **이어지지 않는 새 기록으로 통째로 갈아치웠다.** 공통 조상이 없다
   * `unknown`      - 확인하지 못했다
   */
  kind: 'forced' | 'unrelated' | 'fast-forward' | 'unknown'
  /** 이 푸시로 사라진 커밋 수. `unrelated` 면 셀 수 없어서 0 이다. */
  droppedCommits: number
  /** 이 푸시로 올라온 커밋 수 */
  addedCommits: number
  /** kind 가 unknown 일 때 그 이유 */
  reason?: string
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export interface CommitMeta {
  sha: string
  message: string
  authorName: string
  authorDate: string
  committerName: string
  committerDate: string
  parents: string[]
  treeSha: string
}

/**
 * 탐지기가 쓸 수 있는 읽기 전용 GitHub 접근자.
 * 쓰기 메서드를 여기에 추가하지 않는다 - 탐지 단계는 절대 변경하지 않는다.
 */
export interface GitHubReader {
  listBranches(repo: string): Promise<BranchRef[]>
  listTags(repo: string): Promise<BranchRef[]>
  getTree(repo: string, sha: string): Promise<TreeEntry[]>
  getCommit(repo: string, sha: string): Promise<CommitMeta>
  /** 텍스트 파일 내용. 상한을 넘으면 잘라서 준다. 실행하지 않고 문자열로만 다룬다. */
  getTextFile(repo: string, path: string, ref: string): Promise<string | null>
  compare(repo: string, base: string, head: string): Promise<CompareResult>
}

export interface CompareResult {
  status: 'ahead' | 'behind' | 'identical' | 'diverged'
  aheadBy: number
  behindBy: number
}

// ─────────────────────────────────────────────────────────────
// 브랜치 상태 + 복구 계획
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// 케이스 파일 - 모든 것의 중심
// ─────────────────────────────────────────────────────────────

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
