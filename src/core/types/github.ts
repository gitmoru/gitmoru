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
