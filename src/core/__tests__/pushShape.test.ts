import { describe, expect, it } from 'vitest'

import { ApiError } from '../github'
import { shapeBranches } from '../pushShape'
import type { CompareResult, GitHubReader } from '../types'

/**
 * 푸시 모양.
 *
 * GitHub 이벤트에는 강제 푸시 여부가 안 들어 있어서 전후 커밋을 맞대본다.
 * 여기서 제일 중요한 건 **404 두 가지를 구분하는 것**이다.
 * "커밋이 정리돼서 없다" 는 확인 실패고, "공통 조상이 없다" 는 사실이다.
 */
const reader = (compare: GitHubReader['compare']): GitHubReader =>
  ({ compare }) as unknown as GitHubReader

const target = (before: string, head: string, pushes = 1) => ({
  repo: 'a/b',
  branch: 'main',
  before,
  head,
  pushes,
})

/** 브랜치 하나만 넣고 그 모양을 꺼낸다 */
const shapeOne = async (
  compare: GitHubReader['compare'],
  onFailure: (t: string, r: string) => void = () => {},
  before = 'aaa',
  head = 'bbb',
) => (await shapeBranches(reader(compare), [target(before, head)], onFailure)).get('a/b/main')?.shape

const ok = (aheadBy: number, behindBy: number): CompareResult => ({
  status: behindBy > 0 ? 'diverged' : 'ahead',
  aheadBy,
  behindBy,
})

describe('shapeBranches', () => {
  it('사라진 커밋이 없으면 평범한 푸시다', async () => {
    const shape = await shapeOne(async () => ok(3, 0))
    expect(shape).toMatchObject({ kind: 'fast-forward', droppedCommits: 0 })
  })

  it('사라진 커밋이 있으면 기록을 덮어쓴 것이다', async () => {
    const shape = await shapeOne(async () => ok(1, 6))
    expect(shape).toMatchObject({ kind: 'forced', droppedCommits: 6 })
  })

  it('공통 조상이 없으면 확인 실패가 아니라 사실이다', async () => {
    const failures: string[] = []
    const shape = await shapeOne(
      async () => {
        throw new ApiError('404 {"message":"No common ancestor between x and y."}', 404, 'compare')
      },
      (target) => failures.push(target),
    )
    expect(shape).toMatchObject({ kind: 'unrelated' })
    // 사실이므로 실패 목록에 올리지 않는다
    expect(failures).toEqual([])
  })

  it('그냥 없는 커밋은 확인 실패로 올린다', async () => {
    const failures: string[] = []
    const shape = await shapeOne(
      async () => {
        throw new ApiError('404 {"message":"Not Found"}', 404, 'compare')
      },
      (target) => failures.push(target),
    )
    expect(shape).toMatchObject({ kind: 'unknown' })
    expect(failures).toEqual(['a/b/main'])
  })

  it('실패 이유에 응답 본문을 통째로 싣지 않는다', async () => {
    const shape = await shapeOne(async () => {
      throw new ApiError('404 {"message":"Not Found","documentation_url":"https://..."}', 404, 'c')
    })
    expect(shape?.reason).not.toContain('documentation_url')
  })

  it('브랜치가 그때 생긴 푸시는 경고로 올리지 않는다', async () => {
    const failures: string[] = []
    const shape = await shapeOne(
      async () => {
        throw new Error('불려서는 안 된다')
      },
      (target) => failures.push(target),
      '0'.repeat(40),
    )
    expect(shape).toMatchObject({ kind: 'fast-forward' })
    expect(failures).toEqual([])
  })

  /*
    브랜치마다 한 번씩만 물어본다.

    예전에는 푸시 하나당 한 번이었다. 실제 조직에서 요청 890회 중 550회가 여기였고,
    그렇게 더한 숫자는 이미 사라진 커밋을 여러 번 세서 13,724개 같은 수를 만들었다.
  */
  it('푸시가 몇 번이든 브랜치마다 한 번만 물어본다', async () => {
    let calls = 0
    const shapes = await shapeBranches(
      reader(async () => {
        calls++
        return ok(1, 6)
      }),
      [target('aaa', 'bbb', 9)],
      () => {},
    )

    expect(calls).toBe(1)
    expect(shapes.get('a/b/main')?.shape).toMatchObject({ droppedCommits: 6 })
  })

  it('비교에 딸려온 것을 같이 돌려준다', async () => {
    // 이걸 안 챙기면 탐지기들이 같은 값을 다시 받으러 간다.
    const shapes = await shapeBranches(
      reader(async () => ({
        ...ok(1, 0),
        signing: { seen: 2, unsigned: 1, badSignature: 0, total: 2, baseSigned: true },
        commits: [
          {
            sha: 'c1',
            authorName: 'x',
            authorDate: '2026-08-05T00:00:00Z',
            committerName: 'x',
            committerDate: '2026-08-05T00:00:00Z',
          },
        ],
      })),
      [target('aaa', 'bbb')],
      () => {},
    )

    const got = shapes.get('a/b/main')
    expect(got?.signing?.unsigned).toBe(1)
    expect(got?.commits).toHaveLength(1)
  })
})
