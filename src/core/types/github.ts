/**
 * GitHub 에서 읽어오는 것들.
 *
 * 저장소, 브랜치, 커밋, 푸시처럼 우리가 만들지 않고 받아오는 모양이다.
 * `GitHubReader` 에 쓰기 메서드를 추가하지 않는다 - 탐지 단계는 절대 변경하지 않는다.
 */

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
  /**
   * 이 푸시로 들어온 커밋들의 서명 상태.
   *
   * 비교할 때 같이 딸려온다. 확인 못 했으면 비어 있고, 비어 있는 것은
   * "서명이 다 돼 있었다" 가 아니라 "모른다" 다.
   */
  signing?: CompareSigning
}

/**
 * 비공개였던 저장소가 공개로 바뀐 일.
 *
 * GitHub 이 `PublicEvent` 로 알려준다. 뜻이 하나뿐이라 해석할 게 없다.
 * **비공개였던 것이 지금 인터넷에 있다.** 새로 공개로 만든 저장소는 여기 안 걸린다.
 *
 * 이걸 따로 두는 이유는, 이 일이 푸시 없이도 일어나기 때문이다.
 * 푸시만 세면 그런 시간대는 "활동 없음" 으로 뜬다. 그 화면이 제일 위험하다.
 *
 * 이름으로 잡지 않는다. 지금 도는 웜은 특정 이름을 쓰지만 다음 판은 안 그럴 것이고,
 * 이름을 보는 순간 못 알아본 것이 0건으로 표시된다 ([ADR 0008](../../../docs/decisions/0008-detectors-never-judge-by-filename.md)).
 */
export interface RepoExposure {
  repo: string
  /** 공개로 바뀐 시각 (ISO 8601, UTC) */
  at: string
  /** 그 일을 한 계정 */
  actor: string
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

/**
 * 훑는 데 얼마나 들었는지.
 *
 * 도구가 자기 비용을 말하지 않으면 왜 느린지 아무도 못 센다. 밖에서 재는 것도 안 된다.
 * 답은 우리가 이미 받아놓고 안 읽던 헤더 안에 있었다.
 */
export interface ApiUsage {
  /** 실제로 GitHub 까지 나간 요청 수 */
  calls: number
  /** 캐시가 막아준 요청 수. 안 나간 것도 세야 캐시가 값을 하는지 보인다. */
  saved: number
  /** 마지막 응답이 알려준 남은 요청 수. 못 읽었으면 비어 있다. */
  remaining?: number
  /** 그 한도가 다시 차는 시각 (ISO 8601) */
  resetAt?: string
}

export interface CompareResult {
  status: 'ahead' | 'behind' | 'identical' | 'diverged'
  aheadBy: number
  behindBy: number
  /**
   * 이 비교로 드러난 커밋들의 서명 상태.
   *
   * 비교 응답에 원래 들어 있던 것이다. 예전에는 위 세 개만 읽고 버렸다.
   */
  signing?: CompareSigning
}

/**
 * 서명이 어떤 모양이었는지.
 *
 * 서명이 없다는 것 자체는 아무 뜻도 아니다. 키 없는 컴퓨터에서 올리는 일은 흔하다.
 * 뜻이 생기는 건 **하던 것을 안 하게 됐을 때**다. 그래서 기준점을 같이 담는다.
 */
export interface CompareSigning {
  /** 푸시 직전 커밋이 서명돼 있었나. 응답에 없었으면 비어 있다. */
  baseSigned?: boolean
  /** 이 푸시로 드러난 커밋 수. 우리가 실제로 본 만큼이다. */
  seen: number
  /** 그중 서명이 아예 없는 것 */
  unsigned: number
  /**
   * 서명은 붙어 있는데 검증이 안 되는 것.
   *
   * `unsigned` 와 한 칸에 담으면 안 된다. 서명이 없는 건 평범하고,
   * **붙어 있는데 안 맞는 건 평범하지 않다.**
   */
  badSignature: number
  /** GitHub 이 세어준 전체 커밋 수. 250개를 넘으면 우리가 본 것보다 크다. */
  total: number
}
