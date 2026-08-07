import { ghCall } from '../platform/bridge'
import type {
  ApiUsage,
  BranchRef,
  CommitMeta,
  CompareResult,
  CompareSigning,
  GitHubReader,
  PushEvent,
  RepoExposure,
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

  /**
   * 이번 훑기에 든 비용.
   *
   * `request` 한 군데만 지나가면 되도록 여기서 센다. 부르는 쪽이 안 세도 된다.
   */
  private readonly meter = { calls: 0, saved: 0 } as {
    calls: number
    saved: number
    remaining?: number
    resetAt?: string
  }

  /** 훑기 시작할 때 0 으로. 지난 훑기 것을 이번 것으로 세지 않는다. */
  resetUsage() {
    this.meter.calls = 0
    this.meter.saved = 0
  }

  /** 지금까지 든 비용. 남은 한도는 마지막 응답이 알려준 값이다. */
  usage(): ApiUsage {
    return { ...this.meter }
  }

  /** 파일 내용. 무거워서 개수를 묶어둔다. */
  private readonly textCache = new Map<string, string | null>()
  private static readonly TEXT_CACHE_MAX = 300

  /**
   * 한도에서 잘린 목록들.
   *
   * 조회는 성공했는데 다 못 봤다. 이건 성공도 실패도 아니라서 예외로 던지지 않는다
   * ([ADR 0009](../../docs/decisions/0009-failure-is-its-own-state.md)).
   * 여기 쌓아두고 훑기가 끝날 때 `runScan` 이 가져가서 "확인 못 함" 으로 올린다.
   */
  private readonly truncations: Array<{ path: string; got: number }> = []

  /** 가장 오래된 것부터 버리면서 담는다 */
  private remember(key: string, text: string | null) {
    if (this.textCache.size >= GitHubClient.TEXT_CACHE_MAX) {
      const oldest = this.textCache.keys().next().value
      if (oldest !== undefined) this.textCache.delete(oldest)
    }
    this.textCache.set(key, text)
  }

  /** 쌓인 것을 가져가고 비운다. 한 번 훑을 때마다 새로 센다. */
  takeTruncations(): Array<{ path: string; got: number }> {
    return this.truncations.splice(0)
  }

  constructor(private readonly opts: GitHubClientOptions = {}) {
    this.sem = new Semaphore(opts.concurrency ?? 6)
  }

  // ── 저수준 ────────────────────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    return this.sem.run(async () => {
      this.meter.calls++
      const res = await ghCall(path)

      /*
        남은 한도는 응답마다 딸려온다. 프록시가 헤더를 여기까지 실어오는데
        받는 사람이 없어서 그냥 버려지고 있었다.

        시간당 5,000회고, 사고가 나면 사람들은 한 번만 훑지 않는다. 한도에 걸리면
        지금은 "확인 못 함" 이 무더기로 뜨는데, 그게 권한 문제인지 한도 문제인지
        화면만 봐서는 구별이 안 된다.
      */
      if (res.rateRemaining) this.meter.remaining = Number(res.rateRemaining)
      if (res.rateReset) this.meter.resetAt = new Date(Number(res.rateReset) * 1000).toISOString()

      if (res.rateRemaining && res.rateReset && this.opts.onRateLimit) {
        this.opts.onRateLimit(Number(res.rateRemaining), new Date(Number(res.rateReset) * 1000))
      }

      if (!res.ok) {
        throw new ApiError(`${res.status} ${res.body.slice(0, 200)}`, res.status, path)
      }
      return JSON.parse(res.body) as T
    })
  }

  /**
   * 페이지를 따라가되, 한도에서 끊겼는지도 같이 돌려준다.
   *
   * 마지막으로 받은 페이지가 꽉 차 있었다면 뒤에 더 있다는 뜻이다.
   * 정확히 한도만큼 있고 더 없는 경우도 여기 걸리는데, 그건 그대로 둔다.
   * **우리가 아는 건 "여기서 끊었다" 지 "여기까지가 전부다" 가 아니다.**
   */
  private async fetchPages<T>(
    path: string,
    maxPages: number,
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = []
    const joiner = path.includes('?') ? '&' : '?'
    let lastWasFull = false

    for (let page = 1; page <= maxPages; page++) {
      const chunk = await this.request<T[]>(`${path}${joiner}per_page=100&page=${page}`)
      if (!Array.isArray(chunk)) break
      items.push(...chunk)
      lastWasFull = chunk.length === 100
      if (!lastWasFull) break
    }

    return { items, truncated: lastWasFull }
  }

  /**
   * 페이지를 끝까지 따라간다. maxPages 로 폭주를 막는다.
   *
   * 한도에 걸리면 적어둔다. 예전에는 끝까지 읽었을 때와 똑같은 배열이 나와서,
   * 저장소 1,200개짜리 조직이 1,000개로 훑히고도 화면이 다 봤다고 말했다.
   */
  private async paginate<T>(path: string, maxPages = 10): Promise<T[]> {
    const { items, truncated } = await this.fetchPages<T>(path, maxPages)
    if (truncated) this.truncations.push({ path, got: items.length })
    return items
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
   * 저장소의 최근 이벤트에서 시간대 안의 것만 골라낸다.
   *
   * 한 번 받아서 두 갈래로 나눈다. 예전에는 푸시만 남기고 나머지를 버렸는데,
   * **버리던 응답 안에 `PublicEvent` 가 같이 들어 있었다.** 따로 받으러 가면
   * 저장소마다 왕복이 한 번씩 더 늘고, 그 값은 이미 치른 값이다.
   *
   * 주의 - GitHub 이벤트 API 는 최근 90일, 저장소당 300건 정도만 보관한다.
   * 오래된 사고는 여기서 안 잡힐 수 있고, 그 경우 개발자 로컬의 reflog 가 유일한 복구원이다.
   */
  async listRepoEvents(
    repo: string,
    since: string,
    until: string,
  ): Promise<{ pushes: PushEvent[]; exposures: RepoExposure[] }> {
    const path = `repos/${repo}/events`
    const { items, truncated } = await this.fetchPages<RawEvent>(path, 3)

    /*
      여기서는 `paginate` 를 안 쓴다. 페이지가 꽉 찼다고 다 못 본 게 아니기 때문이다.

      GitHub 이 저장소당 300건까지만 주기 때문에, 활발한 저장소는 언제 훑어도 세 페이지가
      꽉 찬다. 그걸 그대로 "확인 못 함" 으로 올리면 매번 뜬다.
      **매번 뜨는 경고는 곧 아무도 안 읽는 경고다.**

      실제로 물어야 할 것은 시간대를 덮었느냐다. `windowCovered` 가 그걸 판단한다.
    */
    if (!windowCovered(items, truncated, since)) {
      this.truncations.push({ path, got: items.length })
    }

    return splitRepoEvents(repo, items, since, until)
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
    if (hit) {
      this.meter.saved++
      return hit
    }

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
    if (hit) {
      this.meter.saved++
      return hit
    }

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
    /*
      탐지기 둘이 같은 워크플로 파일을 본다. 캐시가 없으면 파일 하나를
      네 번 받아온다 (탐지기 둘 × 전후 둘).

      개수를 묶어둔다. 파일 내용이라 트리나 커밋보다 무겁고, 큰 조직을 훑을 때
      계속 쌓이면 그게 다른 문제가 된다. 오래된 것부터 버린다.
    */
    const key = `${repo}@${ref}:${path}`
    const hit = this.textCache.get(key)
    if (hit !== undefined) {
      this.meter.saved++
      return hit
    }

    try {
      const raw = await this.request<{ content?: string; encoding?: string; size: number }>(
        `repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      )
      const text = !raw.content || raw.encoding !== 'base64' ? null : decodeBase64Utf8(raw.content)
      this.remember(key, text)
      return text
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // 없다는 것도 답이다. 다시 물으러 가지 않는다.
        this.remember(key, null)
        return null
      }
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
    const raw = await this.request<RawCompare>(`repos/${repo}/compare/${base}...${head}`)
    return {
      status: raw.status,
      aheadBy: raw.ahead_by,
      behindBy: raw.behind_by,
      // 이미 받아온 응답 안에 있다. 안 읽으면 그냥 버려진다.
      signing: readSigning(raw),
    }
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

/** GitHub 이벤트 API 응답 중 우리가 읽는 부분 */
export interface RawEvent {
  type: string
  created_at: string
  actor: { login: string }
  payload: { ref?: string; before?: string; head?: string }
}

/**
 * 한 번 받은 이벤트를 두 갈래로 가른다.
 *
 * 함수를 따로 뺀 이유는 시험을 붙이기 위해서다. 클래스 안에 두면 네트워크 없이는
 * 못 돌리고, 그러면 **공개 전환을 못 알아보는 버그가 조용히 살아남는다.**
 * 이 검사가 잡으려는 게 정확히 조용한 실패라서 그건 앞뒤가 안 맞는다.
 *
 * 시각 비교는 19자로 잘라서 한다. 우리가 만드는 시간대는 `2026-08-06T00:00:00` 이고
 * GitHub 이 주는 시각은 `2026-08-06T00:00:00Z` 다. 그냥 문자열로 비교하면
 * 끝시각과 정확히 같은 순간에 일어난 일이 `Z` 한 글자 때문에 범위 밖으로 밀린다.
 */
export function splitRepoEvents(
  repo: string,
  raw: RawEvent[],
  since: string,
  until: string,
): { pushes: PushEvent[]; exposures: RepoExposure[] } {
  const at = (iso: string) => iso.slice(0, 19)
  const inWindow = raw.filter((e) => at(e.created_at) >= at(since) && at(e.created_at) <= at(until))

  return {
    pushes: inWindow
      .filter((e) => e.type === 'PushEvent' && typeof e.payload.ref === 'string')
      .map((e) => ({
        repo,
        branch: e.payload.ref!.replace(/^refs\/heads\//, ''),
        actor: e.actor.login,
        createdAt: e.created_at,
        before: e.payload.before ?? '',
        head: e.payload.head ?? '',
      })),

    // payload 가 비어 있는 이벤트다. 뜻이 하나뿐이라 읽어낼 것이 없다.
    exposures: inWindow
      .filter((e) => e.type === 'PublicEvent')
      .map((e) => ({ repo, at: e.created_at, actor: e.actor.login })),
  }
}

/**
 * 받아온 이벤트가 시간대를 덮었는지.
 *
 * 이벤트는 최신순으로 온다. 그래서 **마지막으로 받은 것이 시작 시각보다 오래됐으면**
 * 그 사이는 전부 훑은 것이다. 페이지가 몇 장 꽉 찼든 상관없다.
 *
 * 반대로 마지막으로 받은 것이 아직 시작 시각보다 최신이면, 그 아래에 우리가 못 본
 * 시간대가 남아 있다. 사고 난 푸시가 거기 있을 수 있다.
 *
 * 잘리지 않았으면 물어볼 것도 없다. 저장소가 가진 걸 다 받은 것이다.
 */
export function windowCovered(events: RawEvent[], truncated: boolean, since: string): boolean {
  if (!truncated) return true

  const oldest = events.at(-1)?.created_at
  if (!oldest) return true

  // `Z` 한 글자 때문에 갈리지 않게 19자로 맞춰서 본다
  return oldest.slice(0, 19) <= since.slice(0, 19)
}

/** 비교 응답 중 우리가 읽는 부분 */
export interface RawCompare {
  status: CompareResult['status']
  ahead_by: number
  behind_by: number
  total_commits?: number
  base_commit?: { commit?: { verification?: { verified?: boolean; reason?: string } } }
  commits?: Array<{ commit?: { verification?: { verified?: boolean; reason?: string } } }>
}

/**
 * 비교 응답에서 서명 상태를 읽는다.
 *
 * 서명이 없는 것과 붙어 있는데 안 맞는 것을 갈라 센다. GitHub 이 `reason` 으로 알려주는데,
 * `unsigned` 만 "없음" 이고 나머지 실패는 전부 "붙어 있는데 안 맞음" 이다.
 * 한 칸에 담으면 흔한 쪽이 드문 쪽을 덮는다.
 *
 * `base_commit` 은 푸시 직전 커밋이라 기준점이 된다. 이게 없으면 서명이 몇 개 없든
 * 말할 수 있는 게 없어서 `baseSigned` 를 비워둔다. 0 이 아니라 비운다.
 */
export function readSigning(raw: RawCompare): CompareSigning | undefined {
  const commits = raw.commits
  if (!Array.isArray(commits)) return undefined

  let unsigned = 0
  let badSignature = 0

  for (const c of commits) {
    const v = c.commit?.verification
    if (!v || v.verified) continue
    if (v.reason === 'unsigned') unsigned++
    else badSignature++
  }

  const baseVerified = raw.base_commit?.commit?.verification?.verified

  return {
    baseSigned: typeof baseVerified === 'boolean' ? baseVerified : undefined,
    seen: commits.length,
    unsigned,
    badSignature,
    total: raw.total_commits ?? commits.length,
  }
}
