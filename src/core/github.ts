import { ghCall } from '../platform/bridge'
import type {
  BranchRef,
  CommitMeta,
  CompareResult,
  GitHubReader,
  PushEvent,
  RepoRef,
  TreeEntry,
} from './types'

/**
 * GitHub 접근자.
 *
 * 화면은 api.github.com 으로 직접 나가지 않는다 (SAFETY.md 3번).
 * 앱 모드면 Electron 메인 프로세스가, 웹 모드면 로컬 프록시가 대신 호출한다.
 * 어느 쪽이든 토큰은 반대편에만 있어서 이 파일에는 토큰이 등장하지 않는다.
 */

/**
 * GitHub 이 준 base64 를 글자로 되돌린다.
 *
 * `atob` 만 쓰면 안 된다. 그건 바이트 하나를 글자 하나로 놓기 때문에
 * 한 글자가 3바이트인 한글은 세 글자로 흩어져서 깨진다.
 * 바이트로 되돌린 다음 UTF-8 로 읽어야 한다.
 *
 * 여기 들어오는 것은 공격자가 쓴 파일일 수 있다. 그래도 하는 일은 문자열 변환뿐이고,
 * 실행하거나 디스크에 쓰지 않는다 (SAFETY.md 2, 3번).
 */
function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** 저장소 목록 응답에서 우리가 쓰는 부분 */
interface RepoPayload {
  name: string
  full_name: string
  default_branch: string
  archived?: boolean
  fork?: boolean
  permissions?: { admin?: boolean }
}

/**
 * 목록 응답을 우리 모양으로.
 *
 * `admin`, `archived`, `fork` 가 여기 이미 들어 있다. 문단속에서 볼 대상을 추릴 때
 * 저장소마다 다시 물어볼 필요가 없다는 뜻이다.
 */
function toRepoRef(raw: RepoPayload, owner: string): RepoRef {
  return {
    owner,
    name: raw.name,
    fullName: raw.full_name,
    defaultBranch: raw.default_branch,
    isAdmin: raw.permissions?.admin ?? false,
    archived: raw.archived ?? false,
    fork: raw.fork ?? false,
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 동시 요청 수 제한. GitHub 2차 제한(secondary rate limit)에 걸리지 않게 한다. */
class Semaphore {
  private active = 0
  private queue: Array<() => void> = []
  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}

export interface GitHubClientOptions {
  concurrency?: number
  onRateLimit?: (remaining: number, resetAt: Date) => void
}

export class GitHubClient implements GitHubReader {
  private readonly sem: Semaphore
  private readonly treeCache = new Map<string, TreeEntry[]>()
  private readonly commitCache = new Map<string, CommitMeta>()

  constructor(private readonly opts: GitHubClientOptions = {}) {
    this.sem = new Semaphore(opts.concurrency ?? 6)
  }

  // ── 저수준 ────────────────────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    return this.sem.run(async () => {
      const res = await ghCall(path)

      if (res.rateRemaining && res.rateReset && this.opts.onRateLimit) {
        this.opts.onRateLimit(Number(res.rateRemaining), new Date(Number(res.rateReset) * 1000))
      }

      if (!res.ok) {
        throw new ApiError(`${res.status} ${res.body.slice(0, 200)}`, res.status, path)
      }
      return JSON.parse(res.body) as T
    })
  }

  /** 페이지를 끝까지 따라간다. maxPages 로 폭주를 막는다. */
  private async paginate<T>(path: string, maxPages = 10): Promise<T[]> {
    const out: T[] = []
    const joiner = path.includes('?') ? '&' : '?'
    for (let page = 1; page <= maxPages; page++) {
      const chunk = await this.request<T[]>(`${path}${joiner}per_page=100&page=${page}`)
      if (!Array.isArray(chunk)) break
      out.push(...chunk)
      if (chunk.length < 100) break
    }
    return out
  }

  // ── 스캔 대상 수집 ────────────────────────────────────────

  async listOrgRepos(org: string): Promise<RepoRef[]> {
    const raw = await this.paginate<RepoPayload>(`orgs/${org}/repos`)
    return raw.map((r) => toRepoRef(r, org))
  }

  /**
   * 로그인한 계정이 접근할 수 있는 저장소 전부.
   *
   * 조직 저장소뿐 아니라 **개인 저장소도 포함된다.**
   * 조직 목록만 쓰면 `내계정/무언가` 같은 개인 저장소를 아예 못 고른다.
   */
  async listAccessibleRepos(maxPages = 5): Promise<RepoRef[]> {
    const raw = await this.paginate<RepoPayload & { owner: { login: string } }>(
      'user/repos?affiliation=owner,organization_member,collaborator&sort=pushed',
      maxPages,
    )
    return raw.map((r) => toRepoRef(r, r.owner.login))
  }

  // ── 문단속: 브랜치를 안 건드리고 들어오는 문 ──────────────

  /**
   * 배포 키.
   *
   * 저장소에 붙는 SSH 키다. 계정이 막혀도 이 키가 살아 있으면 계속 들어올 수 있다.
   * 관리자 권한이 있어야 볼 수 있어서, 없으면 403 이 온다.
   */
  async listDeployKeys(repo: string) {
    return this.paginate<{
      id: number
      title: string
      created_at: string
      read_only: boolean
      url: string
    }>(`repos/${repo}/keys`, 2)
  }

  /**
   * 웹훅.
   *
   * 커밋마다 저장소 내용이 여기 적힌 주소로 나간다. 공격자가 심었다면 그게 곧 유출 경로고,
   * 잊힌 웹훅이 외부 서비스로 계속 흘리고 있는 경우도 흔하다.
   */
  async listWebhooks(repo: string) {
    return this.paginate<{
      id: number
      name: string
      active: boolean
      created_at: string
      config: { url?: string }
    }>(`repos/${repo}/hooks`, 2)
  }

  /** 저장소에 보낸 초대. 아직 수락 전이라 이건 막을 수 있다. */
  async listRepoInvitations(repo: string) {
    return this.paginate<{
      id: number
      created_at: string
      permissions: string
      invitee: { login: string } | null
      html_url: string
    }>(`repos/${repo}/invitations`, 2)
  }

  /** 조직에 보낸 초대. 저장소마다 안 물어도 되고 한 번이면 된다. */
  async listOrgInvitations(org: string) {
    return this.paginate<{
      id: number
      created_at: string
      login: string | null
      email: string | null
      role: string
    }>(`orgs/${org}/invitations`, 2)
  }

  /** 조직 사람들. 의심 계정을 칠 때 골라 쓰게 한다. */
  async listOrgMembers(org: string): Promise<string[]> {
    const raw = await this.paginate<{ login: string }>(`orgs/${org}/members`, 3)
    return raw.map((m) => m.login)
  }

  async listMyOrgs(): Promise<string[]> {
    const raw = await this.paginate<{ login: string }>('user/orgs')
    return raw.map((o) => o.login)
  }

  /**
   * 저장소의 최근 이벤트에서 푸시만 골라낸다.
   *
   * 주의 - GitHub 이벤트 API 는 최근 90일, 저장소당 300건 정도만 보관한다.
   * 오래된 사고는 여기서 안 잡힐 수 있고, 그 경우 개발자 로컬의 reflog 가 유일한 복구원이다.
   */
  async listPushEvents(repo: string, since: string, until: string): Promise<PushEvent[]> {
    const raw = await this.paginate<{
      type: string
      created_at: string
      actor: { login: string }
      payload: { ref?: string; before?: string; head?: string }
    }>(`repos/${repo}/events`, 3)

    return raw
      .filter(
        (e) =>
          e.type === 'PushEvent' &&
          e.created_at >= since &&
          e.created_at <= until &&
          typeof e.payload.ref === 'string',
      )
      .map((e) => ({
        repo,
        branch: e.payload.ref!.replace(/^refs\/heads\//, ''),
        actor: e.actor.login,
        createdAt: e.created_at,
        before: e.payload.before ?? '',
        head: e.payload.head ?? '',
      }))
  }

  // ── GitHubReader 구현 ─────────────────────────────────────

  async listBranches(repo: string): Promise<BranchRef[]> {
    const raw = await this.paginate<{ ref: string; object: { sha: string } }>(
      `repos/${repo}/git/refs/heads`,
    )
    return raw.map((r) => ({
      repo,
      branch: r.ref.replace(/^refs\/heads\//, ''),
      sha: r.object.sha,
    }))
  }

  async listTags(repo: string): Promise<BranchRef[]> {
    const raw = await this.paginate<{ ref: string; object: { sha: string } }>(
      `repos/${repo}/git/refs/tags`,
    )
    return raw.map((r) => ({
      repo,
      branch: r.ref.replace(/^refs\/tags\//, ''),
      sha: r.object.sha,
    }))
  }

  async getTree(repo: string, sha: string): Promise<TreeEntry[]> {
    const key = `${repo}@${sha}`
    const hit = this.treeCache.get(key)
    if (hit) return hit

    const raw = await this.request<{
      truncated: boolean
      tree: Array<{ path: string; type: string; sha: string; size?: number }>
    }>(`repos/${repo}/git/trees/${sha}?recursive=1`)

    const entries: TreeEntry[] = raw.tree.map((t) => ({
      path: t.path,
      type: t.type as TreeEntry['type'],
      sha: t.sha,
      size: t.size,
    }))

    // 트리가 잘렸으면 그 사실을 감춰선 안 된다. 빈 결과를 clean 으로 오해하면 안 되므로 던진다.
    if (raw.truncated) {
      // 이 메시지는 화면에 그대로 뜨지 않는다. changes.ts 가 'truncated' 를 보고 사람 말로 바꾼다.
      throw new ApiError('tree truncated', 200, `trees/${sha}`)
    }

    this.treeCache.set(key, entries)
    return entries
  }

  async getCommit(repo: string, sha: string): Promise<CommitMeta> {
    const key = `${repo}@${sha}`
    const hit = this.commitCache.get(key)
    if (hit) return hit

    const raw = await this.request<{
      sha: string
      commit: {
        message: string
        tree: { sha: string }
        author: { name: string; date: string }
        committer: { name: string; date: string }
      }
      parents: Array<{ sha: string }>
    }>(`repos/${repo}/commits/${sha}`)

    const meta: CommitMeta = {
      sha: raw.sha,
      message: raw.commit.message,
      authorName: raw.commit.author.name,
      authorDate: raw.commit.author.date,
      committerName: raw.commit.committer.name,
      committerDate: raw.commit.committer.date,
      parents: raw.parents.map((p) => p.sha),
      treeSha: raw.commit.tree.sha,
    }
    this.commitCache.set(key, meta)
    return meta
  }

  /**
   * 텍스트 파일 내용.
   *
   * 문자열로만 다룬다. 절대 eval/실행하지 않고, 디스크에 쓰지 않는다 (SAFETY.md 1, 2번).
   */
  async getTextFile(repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const raw = await this.request<{ content?: string; encoding?: string; size: number }>(
        `repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      )
      if (!raw.content || raw.encoding !== 'base64') return null
      return decodeBase64Utf8(raw.content)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  }

  /**
   * 두 커밋을 맞대본다.
   *
   * 강제 푸시를 알아내는 유일한 길이다. GitHub 이벤트에는 그 정보가 없어서,
   * 푸시 전 커밋(base)과 푸시 후 커밋(head)을 비교한다.
   *
   *   status 'ahead'    - 앞으로만 갔다. 평범한 푸시다
   *   status 'diverged' - 갈라졌다. base 에 있던 커밋이 지금은 없다
   *   behindBy          - 그렇게 사라진 커밋 수
   *
   * base 커밋이 이미 정리됐으면 404 가 온다. 그때는 모른다고 답해야 한다.
   */
  async compare(repo: string, base: string, head: string): Promise<CompareResult> {
    const raw = await this.request<{
      status: CompareResult['status']
      ahead_by: number
      behind_by: number
    }>(`repos/${repo}/compare/${base}...${head}`)
    return { status: raw.status, aheadBy: raw.ahead_by, behindBy: raw.behind_by }
  }

  // ── 쓰기 ──────────────────────────────────────────────────

  /**
   * 브랜치를 다른 커밋으로 옮긴다 (force).
   *
   * **이 클래스에서 유일하게 저장소를 바꾸는 메서드다.**
   * 프록시도 이 경로만 쓰기를 허용하고, `intent: write` 가 없으면 거부한다.
   * 새 쓰기 동작을 추가할 때는 프록시 화이트리스트도 같이 늘려야 한다.
   */
  async updateRef(repo: string, branch: string, sha: string): Promise<string> {
    const res = await ghCall(`repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha, force: true }),
      intent: 'write',
    })
    if (!res.ok) {
      throw new ApiError(`${res.status} ${res.body.slice(0, 200)}`, res.status, `refs/${branch}`)
    }
    const parsed = JSON.parse(res.body) as { object?: { sha?: string } }
    return parsed.object?.sha ?? ''
  }

  // ── 보호 규칙 ─────────────────────────────────────────────

  /** 복구가 막힐 브랜치를 미리 알려주기 위해 확인한다 (SAFETY.md 9번). */
  async isProtected(repo: string, branch: string): Promise<boolean> {
    try {
      await this.request(`repos/${repo}/branches/${branch}/protection`)
      return true
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return false
      throw err
    }
  }
}
