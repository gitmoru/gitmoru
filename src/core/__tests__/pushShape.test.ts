import { describe, expect, it } from 'vitest'

import { ApiError } from '../github'
import { fillPushShapes, forcedOn } from '../pushShape'
import type { CompareResult, GitHubReader, PushEvent } from '../types'

/**
 * 푸시 모양.
 *
 * GitHub 이벤트에는 강제 푸시 여부가 안 들어 있어서 전후 커밋을 맞대본다.
 * 여기서 제일 중요한 건 **404 두 가지를 구분하는 것**이다.
 * "커밋이 정리돼서 없다" 는 확인 실패고, "공통 조상이 없다" 는 사실이다.
 */
const reader = (compare: GitHubReader['compare']): GitHubReader =>
  ({ compare }) as unknown as GitHubReader

const event = (before: string, head: string): PushEvent => ({
  repo: 'a/b',
  branch: 'main',
  actor: 'x',
  createdAt: '2026-08-05T00:00:00Z',
  before,
  head,
})

const ok = (aheadBy: number, behindBy: number): CompareResult => ({
  status: behindBy > 0 ? 'diverged' : 'ahead',
  aheadBy,
  behindBy,
})

describe('fillPushShapes', () => {
  it('사라진 커밋이 없으면 평범한 푸시다', async () => {
    const events = [event('aaa', 'bbb')]
    await fillPushShapes(reader(async () => ok(3, 0)), events, () => {})
    expect(events[0]!.push).toMatchObject({ kind: 'fast-forward', droppedCommits: 0 })
  })

  it('사라진 커밋이 있으면 기록을 덮어쓴 것이다', async () => {
    const events = [event('aaa', 'bbb')]
    await fillPushShapes(reader(async () => ok(1, 6)), events, () => {})
    expect(events[0]!.push).toMatchObject({ kind: 'forced', droppedCommits: 6 })
  })

  it('공통 조상이 없으면 확인 실패가 아니라 사실이다', async () => {
    const events = [event('aaa', 'bbb')]
    const failures: string[] = []
    await fillPushShapes(
      reader(async () => {
        throw new ApiError('404 {"message":"No common ancestor between x and y."}', 404, 'compare')
      }),
      events,
      (target) => failures.push(target),
    )
    expect(events[0]!.push).toMatchObject({ kind: 'unrelated' })
    // 사실이므로 실패 목록에 올리지 않는다
    expect(failures).toEqual([])
  })

  it('그냥 없는 커밋은 확인 실패로 올린다', async () => {
    const events = [event('aaa', 'bbb')]
    const failures: string[] = []
    await fillPushShapes(
      reader(async () => {
        throw new ApiError('404 {"message":"Not Found"}', 404, 'compare')
      }),
      events,
      (target) => failures.push(target),
    )
    expect(events[0]!.push).toMatchObject({ kind: 'unknown' })
    expect(failures).toEqual(['a/b/main'])
  })

  it('실패 이유에 응답 본문을 통째로 싣지 않는다', async () => {
    const events = [event('aaa', 'bbb')]
    await fillPushShapes(
      reader(async () => {
        throw new ApiError('404 {"message":"Not Found","documentation_url":"https://..."}', 404, 'c')
      }),
      events,
      () => {},
    )
    expect(events[0]!.push?.reason).not.toContain('documentation_url')
  })

  it('브랜치가 그때 생긴 푸시는 경고로 올리지 않는다', async () => {
    const events = [event('0'.repeat(40), 'bbb')]
    const failures: string[] = []
    await fillPushShapes(
      reader(async () => {
        throw new Error('불려서는 안 된다')
      }),
      events,
      (target) => failures.push(target),
    )
    expect(events[0]!.push).toMatchObject({ kind: 'fast-forward' })
    expect(failures).toEqual([])
  })
})

describe('forcedOn', () => {
  it('평범한 푸시는 빼고 모은다', async () => {
    const events = [event('a', 'b'), event('c', 'd')]
    let call = 0
    await fillPushShapes(reader(async () => ok(1, call++ === 0 ? 2 : 0)), events, () => {})
    expect(forcedOn(events, 'a/b', 'main')).toHaveLength(1)
  })
})
