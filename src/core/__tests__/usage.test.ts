import { describe, expect, it } from 'vitest'

import { usageText } from '../scan'
import { makeCase as caseFile } from './fixtures'
import type { ApiUsage } from '../types'

/**
 * 훑기가 얼마나 들었는지.
 *
 * 저장소 14개 브랜치 134개짜리 훑기가 300초 걸렸는데, **왜 오래 걸렸는지 셀 방법이 없었다.**
 * 밖에서도 못 잰다. `gh api rate_limit` 이 안 움직인다.
 *
 * 답은 우리가 이미 받아놓고 안 읽던 헤더 안에 있었다.
 */

const stats = (usage?: ApiUsage) =>
  caseFile({ stats: { reposScanned: 0, branchesScanned: 0, failures: 0, usage } })

describe('usageText', () => {
  it('안 잰 사건에는 아무 말도 하지 않는다', () => {
    // 이 검사가 생기기 전에 남긴 사건이다. 0회 썼다는 뜻이 아니다.
    expect(usageText(stats())).toBe(null)
  })

  it('나간 요청과 캐시가 막아준 것을 같이 적는다', () => {
    // 아낀 걸 안 세면 캐시가 값을 하는지 알 수 없다.
    const out = usageText(stats({ calls: 120, saved: 40, remaining: 4000 }))
    expect(out?.line).toContain('120')
    expect(out?.line).toContain('40')
  })

  it('아낀 게 없으면 그 얘기는 안 한다', () => {
    const out = usageText(stats({ calls: 5, saved: 0 }))
    expect(out?.line).not.toContain('0회 아낌')
  })

  it('남은 한도를 못 읽었으면 지어내지 않는다', () => {
    const out = usageText(stats({ calls: 5, saved: 0 }))
    expect(out?.lowBudget).toBe(false)
  })

  it('한도가 얼마 안 남았으면 미리 말한다', () => {
    // 걸린 다음에 말하면 늦다. 그때는 "확인 못 함" 이 무더기로 뜬 뒤다.
    expect(usageText(stats({ calls: 900, saved: 10, remaining: 120 }))?.lowBudget).toBe(true)
  })

  it('넉넉하면 겁주지 않는다', () => {
    expect(usageText(stats({ calls: 900, saved: 10, remaining: 4000 }))?.lowBudget).toBe(false)
  })

  it('0 이 남았어도 모름으로 접지 않는다', () => {
    // `remaining: 0` 과 `remaining: undefined` 는 다른 말이다.
    expect(usageText(stats({ calls: 900, saved: 0, remaining: 0 }))?.lowBudget).toBe(true)
  })
})
