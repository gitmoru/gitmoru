import { ApiError, type GitHubClient } from './github'
import { tr } from '../i18n'
import type { AccessGap, AccessItem, AccessReport, RepoRef } from './types'

/**
 * 문단속 - 브랜치를 안 건드리고 들어오는 문을 센다.
 *
 * 훑기와 성격이 다르다. 훑기는 **시간대 안에 무엇이 바뀌었나**를 보고, 이벤트로 대상을 좁힌다.
 * 여기서 보는 것들은 이벤트를 안 남긴다. 배포 키가 하나 늘어도 푸시 기록에는 아무것도 안 뜬다.
 * 조용한 게 이것들의 성질이라, 좁힐 수단이 없고 범위 전체를 봐야 한다.
 *
 * 대신 전부 `created_at` 이 있어서, 시간대와 무관하게 언제든 확인할 수 있다.
 * 그래서 사고 조사가 아니라 **현황 점검**이고, 훑기와 따로 돈다.
 *
 * 여기서도 판정하지 않는다 (ADR 0002). 웹훅이 있다는 게 나쁜 게 아니다.
 * "언제 생긴 게 몇 개 있다" 를 세어서 내놓고, 내가 만든 게 맞는지는 사람이 안다.
 */

/** 최근으로 볼 기본 기간 (일) */
export const DEFAULT_RECENT_DAYS = 30

/**
 * 사용자가 고른 범위를 실제 저장소 목록으로 좁힌다.
 *
 * 화면과 MCP 가 같은 함수를 쓴다. 예전에는 양쪽에 같은 조건문이 따로 있었는데,
 * 한쪽만 고치면 사람이 보는 "저장소 12곳을 봤습니다" 와 에이전트가 받는 숫자가
 * 말없이 어긋난다. **범위가 어긋나면 둘 다 못 믿는 결과가 된다.**
 *
 * 저장소를 콕 집었으면 그것만, 조직만 골랐으면 그 조직 것 전부,
 * 아무것도 안 골랐으면 손이 닿는 전부를 본다.
 */
export function narrowRepos(
  all: RepoRef[],
  pick: { repos?: string[]; orgs?: string[] },
): RepoRef[] {
  if (pick.repos?.length) return all.filter((r) => pick.repos!.includes(r.fullName))
  if (pick.orgs?.length) return all.filter((r) => pick.orgs!.includes(r.owner))
  return all
}

export interface AccessScope {
  /** 볼 저장소. 이미 받아둔 목록을 그대로 넘긴다 */
  repos: RepoRef[]
  /** 조직 초대까지 볼 조직 */
  orgs: string[]
  /** 이 시각 뒤에 생긴 것을 '최근' 으로 본다 (UTC ISO) */
  since: string
  /** 포크까지 볼지. 포크는 상류에 영향을 못 줘서 기본은 건너뛴다 */
  includeForks?: boolean
}

/**
 * 볼 저장소를 추린다.
 *
 * 저장소 목록 응답에 `admin`, `archived`, `fork` 가 이미 들어 있어서
 * 여기서 추가 호출 없이 걸러낼 수 있다.
 *
 * 걸러낸 것을 조용히 버리지 않고 `gaps` 에 남긴다. 안 본 것을 안 봤다고
 * 말하지 않으면 "확인했는데 없었다" 와 구분이 안 된다 (SAFETY.md 11번).
 */
function pickTargets(scope: AccessScope) {
  const targets: RepoRef[] = []
  const gaps: AccessReport['gaps'] = []

  for (const repo of scope.repos) {
    if (repo.archived) continue // 바뀔 수 없는 저장소라 볼 이유가 없다
    if (repo.fork && !scope.includeForks) continue // 상류에 영향을 못 준다
    if (!repo.isAdmin) {
      gaps.push({ target: repo.fullName, why: 'notAdmin' })
      continue
    }
    targets.push(repo)
  }

  return { targets, gaps }
}

/** 403 은 권한이 없는 것이고, 그건 실패가 아니라 정상이다. */
function gapFor(err: unknown): AccessGap {
  return err instanceof ApiError && (err.status === 403 || err.status === 404)
    ? 'notAdmin'
    : 'failed'
}

/** 한 저장소에 열려 있는 문을 전부 센다. */
async function checkRepo(
  gh: GitHubClient,
  repo: string,
  gaps: AccessReport['gaps'],
): Promise<AccessItem[]> {
  const t = tr().access
  const found: AccessItem[] = []

  const [keys, hooks, invites] = await Promise.all([
    gh.listDeployKeys(repo).catch((err) => {
      gaps.push({ target: `${repo} (keys)`, why: gapFor(err) })
      return []
    }),
    gh.listWebhooks(repo).catch((err) => {
      gaps.push({ target: `${repo} (hooks)`, why: gapFor(err) })
      return []
    }),
    gh.listRepoInvitations(repo).catch((err) => {
      gaps.push({ target: `${repo} (invitations)`, why: gapFor(err) })
      return []
    }),
  ])

  for (const key of keys) {
    found.push({
      kind: 'deployKey',
      repo,
      label: key.title,
      createdAt: key.created_at,
      readOnly: key.read_only,
      href: `https://github.com/${repo}/settings/keys`,
    })
  }

  for (const hook of hooks) {
    found.push({
      kind: 'webhook',
      repo,
      label: hook.name,
      createdAt: hook.created_at,
      // 주소는 페이로드다. 화면에서 무력화해서 그린다.
      target: hook.config.url,
      href: `https://github.com/${repo}/settings/hooks`,
    })
  }

  for (const invite of invites) {
    found.push({
      kind: 'invitation',
      repo,
      label: invite.invitee?.login ?? t.unknownInvitee,
      createdAt: invite.created_at,
      href: invite.html_url,
    })
  }

  return found
}

/**
 * 문단속을 돈다.
 *
 * 저장소당 세 번 부른다. 목록 조회라 가볍고, 동시에 나가서 저장소 수십 개도 몇 초면 끝난다.
 * 무거운 것은 트리 비교와 파일 내용이지 이런 목록이 아니다.
 */
export async function checkAccess(
  gh: GitHubClient,
  scope: AccessScope,
  onProgress?: (done: number, total: number) => void,
): Promise<AccessReport> {
  const t = tr().access
  const { targets, gaps } = pickTargets(scope)
  const all: AccessItem[] = []

  // 조직 초대는 조직당 한 번이면 된다. 저장소마다 물어볼 필요가 없다.
  for (const org of scope.orgs) {
    try {
      const invites = await gh.listOrgInvitations(org)
      for (const invite of invites) {
        all.push({
          kind: 'invitation',
          repo: org,
          label: invite.login ?? invite.email ?? t.unknownInvitee,
          createdAt: invite.created_at,
          href: `https://github.com/orgs/${org}/people`,
        })
      }
    } catch (err) {
      gaps.push({ target: org, why: gapFor(err) })
    }
  }

  /*
    저장소를 한 줄로 세워 돌면 안 된다.

    한 저장소 안의 세 번은 이미 동시에 나가지만, 저장소끼리 순서대로 기다리면
    동시 요청 한도(6)를 절반도 못 쓴다. 실제로 82곳에 37초가 걸렸다.

    전부 한꺼번에 띄우고 한도가 알아서 조이게 둔다. 클라이언트가 세마포어로
    막고 있어서 GitHub 2차 제한에 걸릴 걱정은 여기서 안 해도 된다.
  */
  let done = 0
  const perRepo = await Promise.all(
    targets.map(async (repo) => {
      const found = await checkRepo(gh, repo.fullName, gaps)
      done++
      onProgress?.(done, targets.length)
      return found
    }),
  )
  for (const found of perRepo) all.push(...found)

  /*
    기준 시각 뒤에 생긴 것만 사실로 올린다.

    2년 전에 만든 배포 키는 뉴스가 아니다. 그런데 있다는 사실 자체는 알아야 하니
    나머지는 개수만 센다. 이러면 임계값 없이도 소음이 안 된다.
  */
  const recent = all.filter((item) => item.createdAt >= scope.since)
  const existing: AccessReport['existing'] = { deployKey: 0, webhook: 0, invitation: 0 }
  for (const item of all) {
    if (item.createdAt < scope.since) existing[item.kind]++
  }

  return {
    since: scope.since,
    recent: recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    existing,
    checked: targets.length,
    gaps,
  }
}

/** 조직 웹훅은 스코프가 더 필요하다. 우리가 요구하지 않고 안내만 한다. */
export const ORG_HOOK_SCOPE_CMD = 'gh auth refresh -h github.com -s admin:org_hook'
