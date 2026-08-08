import { describe, expect, it } from 'vitest'

import { forgedCommitDetector } from '../detectors/forgedCommit'
import type { CommitFacts, DetectorContext, PushEvent } from '../types'

/**
 * 커밋 위조 신호가 어디서 재료를 얻는지.
 *
 * 예전에는 head 커밋마다 따로 받으러 갔다. 실제 조직을 재보니 그게
 * 전체 요청 996회 중 437회였고, 그동안 같은 값이 비교 응답 안에 들어 있었다.
 *
 * 여기서 붙잡는 건 두 가지다. 이미 손에 있으면 안 받으러 간다는 것과,
 * **비교가 실패한 자리에서는 여전히 받으러 간다**는 것. 뒤쪽을 놓치면
 * 기록이 통째로 갈아치워진 브랜치에서만 이 탐지기가 조용해진다.
 */

const WINDOW = { since: '2026-08-06T00:00:00Z', until: '2026-08-06T23:59:59Z', displayTz: 'UTC' }

/** author 와 committer 날짜가 벌어진 커밋 */
const forged = (sha: string): CommitFacts => ({
  sha,
  authorName: '누군가',
  authorDate: '2026-05-01T00:00:00Z',
  committerName: '누군가',
  committerDate: '2026-08-06T03:00:00Z',
})

const event = (over: Partial<PushEvent>): PushEvent => ({
  repo: 'a/b',
  branch: 'main',
  actor: 'x',
  createdAt: '2026-08-06T03:00:00Z',
  before: 'a'.repeat(40),
  head: 'h'.repeat(40),
  ...over,
})

function run(events: PushEvent[]) {
  const fetched: string[] = []
  const ctx = {
    events,
    window: WINDOW,
    repos: [],
    branches: [],
    changes: [],
    options: {},
    reportFailure: () => {},
    gh: {
      getCommit: async (_repo: string, sha: string) => {
        fetched.push(sha)
        return { ...forged(sha), parents: [], message: '', treeSha: 't' }
      },
    } as unknown as DetectorContext['gh'],
  }
  return forgedCommitDetector.run(ctx as unknown as DetectorContext).then((f) => ({ f, fetched }))
}

describe('forgedCommitDetector', () => {
  it('비교가 준 커밋으로 신호를 만들고 받으러 가지 않는다', async () => {
    const { f, fetched } = await run([event({ commits: [forged('c1')] })])

    expect(f).toHaveLength(1)
    expect(fetched).toEqual([])
  })

  it('푸시가 들고 온 커밋을 전부 본다', async () => {
    // 예전에는 맨 끝 커밋만 봤다. 중간에 낀 위조 커밋은 못 봤다는 뜻이다.
    const { f } = await run([event({ commits: [forged('c1'), forged('c2')] })])
    expect(f).toHaveLength(2)
  })

  it('같은 커밋이 여러 푸시에 나와도 한 번만 올린다', async () => {
    const { f } = await run([
      event({ commits: [forged('c1')] }),
      event({ branch: 'dev', commits: [forged('c1')] }),
    ])
    expect(f).toHaveLength(1)
  })

  it('비교가 실패한 푸시는 여전히 받으러 간다', async () => {
    // 이어지지 않는 기록이면 비교 자체가 안 된다. 하필 제일 수상한 자리다.
    const { f, fetched } = await run([event({ commits: undefined, head: 'z'.repeat(40) })])

    expect(fetched).toEqual(['z'.repeat(40)])
    expect(f).toHaveLength(1)
  })

  it('이미 비교로 본 커밋이면 다시 받으러 가지 않는다', async () => {
    const { fetched } = await run([
      event({ commits: [forged('h'.repeat(40))] }),
      event({ branch: 'dev', commits: undefined }),
    ])
    expect(fetched).toEqual([])
  })

  it('날짜가 안 벌어졌으면 신호가 아니다', async () => {
    const same: CommitFacts = {
      sha: 'c1',
      authorName: 'x',
      authorDate: '2026-08-06T03:00:00Z',
      committerName: 'x',
      committerDate: '2026-08-06T03:00:00Z',
    }
    const { f } = await run([event({ commits: [same] })])
    expect(f).toEqual([])
  })

  it('커밋된 시각이 시간대 밖이면 신호가 아니다', async () => {
    // 오래된 커밋을 그냥 옮겨온 경우다. 우리가 물어본 시간대의 일이 아니다.
    const old = { ...forged('c1'), committerDate: '2026-07-01T00:00:00Z' }
    const { f } = await run([event({ commits: [old] })])
    expect(f).toEqual([])
  })
})
