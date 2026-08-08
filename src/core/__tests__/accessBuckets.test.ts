import { describe, expect, it } from 'vitest'

import { checkAccess } from '../access'
import type { GitHubClient } from '../github'

/**
 * 시간이 없는 것을 어디에 둘 것인가.
 *
 * 러너는 GitHub 이 등록 시각을 안 준다. '최근' 에 넣으면 2년 전에 등록한 것을
 * 이번 사고로 만들고, '이미 있던 것' 에 넣으면 방금 심은 것을 원래 있던 걸로 만든다.
 * **둘 다 우리가 모르는 것을 아는 척하는 것이다.**
 *
 * 비밀은 반대다. 생긴 시각과 바뀐 시각이 둘 다 오는데, 여기서 중요한 건 바뀐 쪽이다.
 * 오래전에 만든 비밀이 어제 갈아끼워졌으면 그건 어제 일이다.
 */

const SINCE = '2026-08-01T00:00:00Z'

function fakeGitHub(over: Partial<Record<string, unknown>> = {}) {
  return {
    listDeployKeys: async () => [],
    listWebhooks: async () => [],
    listRepoInvitations: async () => [],
    listOrgInvitations: async () => [],
    listRunners: async () => [],
    listSecrets: async () => [],
    ...over,
  } as unknown as GitHubClient
}

const repo = { owner: 'someorg', name: 'somerepo', fullName: 'someorg/somerepo', defaultBranch: 'main', isAdmin: true }

const run = (gh: GitHubClient) => checkAccess(gh, { repos: [repo], orgs: [], since: SINCE })

describe('러너', () => {
  it('최근에도 이미 있던 것에도 안 넣는다', async () => {
    const report = await run(
      fakeGitHub({ listRunners: async () => [{ id: 1, name: 'build-01', os: 'linux' }] }),
    )

    expect(report.recent).toEqual([])
    expect(report.existing.runner).toBe(0)
    expect(report.undated).toHaveLength(1)
    expect(report.undated[0]).toMatchObject({ kind: 'runner', repo: 'someorg/somerepo' })
  })

  it('어느 기계인지 알아볼 수 있게 적는다', async () => {
    const report = await run(
      fakeGitHub({ listRunners: async () => [{ id: 1, name: 'build-01', os: 'linux' }] }),
    )
    expect(report.undated[0]?.label).toBe('build-01 (linux)')
  })
})

describe('비밀', () => {
  it('생긴 때가 아니라 바뀐 때로 최근을 가른다', async () => {
    // 2년 전에 만든 비밀이 사고 시간대에 갈아끼워진 경우다. 이게 제일 위험하다.
    const report = await run(
      fakeGitHub({
        listSecrets: async () => [
          { name: 'DEPLOY_KEY', created_at: '2024-01-01T00:00:00Z', updated_at: '2026-08-04T03:00:00Z' },
        ],
      }),
    )

    expect(report.recent).toHaveLength(1)
    expect(report.recent[0]).toMatchObject({ kind: 'secret', label: 'DEPLOY_KEY' })
  })

  it('오래 안 바뀐 비밀은 개수만 센다', async () => {
    const report = await run(
      fakeGitHub({
        listSecrets: async () => [
          { name: 'OLD', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
        ],
      }),
    )

    expect(report.recent).toEqual([])
    expect(report.existing.secret).toBe(1)
  })

  it('값은 어디에도 담기지 않는다', async () => {
    // 값을 안 받아오는 것이 이 검사를 쓸 수 있게 만드는 조건이다.
    const report = await run(
      fakeGitHub({
        listSecrets: async () => [
          { name: 'DEPLOY_KEY', created_at: SINCE, updated_at: '2026-08-04T03:00:00Z' },
        ],
      }),
    )
    expect(JSON.stringify(report)).not.toContain('value')
  })
})

describe('못 본 것', () => {
  it('권한이 없으면 없다고 하지 않고 못 봤다고 한다', async () => {
    const report = await run(
      fakeGitHub({
        listRunners: async () => {
          throw Object.assign(new Error('403'), { status: 403 })
        },
      }),
    )

    expect(report.gaps.some((g) => g.target.includes('runners'))).toBe(true)
    expect(report.undated).toEqual([])
  })
})
