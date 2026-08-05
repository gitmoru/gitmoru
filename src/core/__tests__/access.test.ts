import { describe, expect, it } from 'vitest'

import { narrowRepos } from '../access'
import type { RepoRef } from '../types'

/**
 * 범위 좁히기.
 *
 * 화면과 MCP 가 같은 함수를 쓴다. 예전에는 양쪽에 같은 조건문이 따로 있었고,
 * 그 상태로는 한쪽만 고쳐도 아무 데서도 안 걸린다.
 */
const repo = (fullName: string): RepoRef =>
  ({
    fullName,
    owner: fullName.split('/')[0],
    name: fullName.split('/')[1],
  }) as RepoRef

const all = [repo('org1/a'), repo('org1/b'), repo('org2/c'), repo('me/d')]

describe('narrowRepos', () => {
  it('저장소를 콕 집으면 그것만 본다', () => {
    expect(narrowRepos(all, { repos: ['org1/b'], orgs: ['org2'] }).map((r) => r.fullName)).toEqual([
      'org1/b',
    ])
  })

  it('조직만 골랐으면 그 조직 것 전부를 본다', () => {
    expect(narrowRepos(all, { orgs: ['org1'] }).map((r) => r.fullName)).toEqual([
      'org1/a',
      'org1/b',
    ])
  })

  it('아무것도 안 골랐으면 손이 닿는 전부를 본다', () => {
    expect(narrowRepos(all, {})).toHaveLength(4)
    expect(narrowRepos(all, { repos: [], orgs: [] })).toHaveLength(4)
  })

  it('없는 이름을 넣으면 조용히 전부로 넓히지 않는다', () => {
    // 여기서 all 로 넘어가면 "12곳을 봤습니다" 가 뜨는데 사용자는 1곳을 시켰다.
    expect(narrowRepos(all, { repos: ['없는/저장소'] })).toEqual([])
  })
})
