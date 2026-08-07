import { describe, expect, it } from 'vitest'

import { ApiError, GitHubClient } from '../github'

/**
 * 목록이 한도에서 끊겼을 때 그 사실이 남는지.
 *
 * 여기가 조용해지면 저장소 1,200개짜리 조직이 1,000개로 훑히고도 화면이 다 봤다고 말한다.
 * 예외도 안 나고 배열도 멀쩡해서, 아무도 안 물어보면 영영 안 드러난다.
 *
 * `request` 를 바꿔치기해서 네트워크 없이 돌린다. 페이지 수를 마음대로 만들 수 있어야
 * 경계를 짚을 수 있는데, 실제 GitHub 으로는 1,000개짜리 조직을 만들 수가 없다.
 */

/** 페이지마다 몇 개씩 돌려줄지 정해서 클라이언트를 만든다 */
function clientReturning(pageSizes: number[]) {
  const client = new GitHubClient()
  const asked: string[] = []

  // @ts-expect-error 저수준 호출만 갈아끼운다. 페이지 논리는 진짜 것을 그대로 쓴다.
  client.request = async (path: string) => {
    asked.push(path)
    // `per_page=100` 안에도 `page=100` 이 들어 있다. 앞의 구분자까지 봐야 한다.
    const page = Number(path.match(/[?&]page=(\d+)/)?.[1] ?? 1)
    return Array.from({ length: pageSizes[page - 1] ?? 0 }, (_, i) => ({ id: `${page}-${i}` }))
  }

  return { client, asked }
}

/** private 이라 이렇게 부른다. 시험 대상이 이 논리 자체다. */
const paginate = (c: GitHubClient, path: string, maxPages: number) =>
  (c as unknown as { paginate: (p: string, m: number) => Promise<unknown[]> }).paginate(
    path,
    maxPages,
  )

describe('목록이 잘렸을 때', () => {
  it('끝까지 읽었으면 아무것도 안 적는다', async () => {
    // 마지막 페이지가 덜 찼다 = 더 없다
    const { client } = clientReturning([100, 40])
    const items = await paginate(client, 'orgs/x/repos', 10)

    expect(items).toHaveLength(140)
    expect(client.takeTruncations()).toEqual([])
  })

  it('한도까지 갔는데 마지막 페이지가 꽉 찼으면 적어둔다', async () => {
    // 여기가 이 시험의 이유다. 예전에는 위 경우와 결과가 똑같이 생겼다.
    const { client } = clientReturning([100, 100, 100, 100])
    const items = await paginate(client, 'orgs/x/repos', 3)

    expect(items).toHaveLength(300)
    expect(client.takeTruncations()).toEqual([{ path: 'orgs/x/repos', got: 300 }])
  })

  it('한 페이지도 안 찼으면 물어볼 것이 없다', async () => {
    const { client } = clientReturning([0])
    await paginate(client, 'orgs/x/repos', 10)
    expect(client.takeTruncations()).toEqual([])
  })

  it('꽉 찬 페이지 뒤에 빈 페이지가 오면 거기서 끝난 것이다', async () => {
    const { client } = clientReturning([100, 0])
    const items = await paginate(client, 'orgs/x/repos', 10)

    expect(items).toHaveLength(100)
    expect(client.takeTruncations()).toEqual([])
  })

  it('가져가면 비워진다', async () => {
    // 다음 훑기가 지난 훑기의 것을 자기 것으로 세면 안 된다.
    const { client } = clientReturning([100, 100])
    await paginate(client, 'orgs/x/repos', 2)

    expect(client.takeTruncations()).toHaveLength(1)
    expect(client.takeTruncations()).toEqual([])
  })

  it('한도에 닿으면 그 이상은 받으러 가지 않는다', async () => {
    const { client, asked } = clientReturning([100, 100, 100, 100, 100])
    await paginate(client, 'orgs/x/repos', 3)
    expect(asked).toHaveLength(3)
  })
})

/**
 * 파일 내용 캐시.
 *
 * 탐지기 둘이 같은 워크플로 파일을 같은 두 시점에서 읽는다. 캐시가 없으면
 * 파일 하나를 네 번 받아온다. 이 시험이 그 네 번을 두 번으로 묶어둔다.
 */
describe('파일 내용을 두 번 받으러 가지 않는다', () => {
  function clientCounting() {
    const client = new GitHubClient()
    let calls = 0
    // @ts-expect-error 저수준만 갈아끼운다
    client.request = async () => {
      calls++
      return { content: Buffer.from('hello').toString('base64'), encoding: 'base64', size: 5 }
    }
    return { client, calls: () => calls }
  }

  it('같은 파일을 같은 시점에서 다시 물으면 안 받아온다', async () => {
    const { client, calls } = clientCounting()

    await client.getTextFile('a/b', '.github/workflows/ci.yml', 'head')
    await client.getTextFile('a/b', '.github/workflows/ci.yml', 'head')

    expect(calls()).toBe(1)
  })

  it('시점이 다르면 따로 받아온다', async () => {
    // 전후를 비교하는 게 이 도구가 하는 일이다. 여기서 묶으면 비교가 무의미해진다.
    const { client, calls } = clientCounting()

    await client.getTextFile('a/b', 'x.yml', 'base')
    await client.getTextFile('a/b', 'x.yml', 'head')

    expect(calls()).toBe(2)
  })

  it('없는 파일이라는 것도 기억한다', async () => {
    const client = new GitHubClient()
    let calls = 0
    // @ts-expect-error 저수준만 갈아끼운다
    client.request = async () => {
      calls++
      throw new ApiError('404', 404, 'x')
    }

    expect(await client.getTextFile('a/b', 'gone.yml', 'head')).toBe(null)
    expect(await client.getTextFile('a/b', 'gone.yml', 'head')).toBe(null)
    expect(calls).toBe(1)
  })
})
