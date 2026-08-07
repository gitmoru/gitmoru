import { describe, expect, it } from 'vitest'

import { windowCovered, type RawEvent } from '../github'

/**
 * 이벤트를 다 못 받았을 때, 그게 문제인지 아닌지.
 *
 * GitHub 은 저장소당 300건까지만 준다. 그래서 활발한 저장소는 언제 훑어도 페이지가 꽉 찬다.
 * 그걸 그대로 "확인 못 함" 으로 올리면 매번 뜨고, **매번 뜨는 경고는 곧 안 읽힌다.**
 *
 * 진짜 물어야 할 건 시간대를 덮었느냐다. 이벤트는 최신순으로 오니까
 * 마지막으로 받은 것이 시작 시각보다 오래됐으면 그 사이는 전부 본 것이다.
 */

const SINCE = '2026-08-06T00:00:00'

/** 최신순으로 온다. 뒤로 갈수록 오래된 것. */
const at = (...times: string[]): RawEvent[] =>
  times.map((t) => ({
    type: 'PushEvent',
    created_at: t,
    actor: { login: 'x' },
    payload: { ref: 'refs/heads/main' },
  }))

describe('windowCovered', () => {
  it('안 잘렸으면 저장소가 가진 걸 다 받은 것이다', () => {
    expect(windowCovered(at('2026-08-06T05:00:00Z'), false, SINCE)).toBe(true)
  })

  it('잘렸어도 시작 시각보다 오래된 데까지 받았으면 덮은 것이다', () => {
    // 300건이 꽉 찼지만 그 300건이 시작 시각 이전까지 닿았다.
    // 활발한 저장소에서 늘 일어나는 일이고, 경고할 이유가 없다.
    const events = at('2026-08-06T06:00:00Z', '2026-08-05T22:00:00Z')
    expect(windowCovered(events, true, SINCE)).toBe(true)
  })

  it('잘렸는데 아직 시작 시각보다 최신이면 못 본 구간이 남아 있다', () => {
    // 여기가 위험한 자리다. 사고 난 푸시가 이 아래에 깔려 있을 수 있다.
    const events = at('2026-08-06T06:00:00Z', '2026-08-06T03:00:00Z')
    expect(windowCovered(events, true, SINCE)).toBe(false)
  })

  it('시작 시각과 정확히 같은 데까지 받았으면 덮은 것이다', () => {
    // 경계는 안쪽이다. 여기서 밀어내면 딱 그 순간의 푸시를 놓친다.
    expect(windowCovered(at('2026-08-06T00:00:00Z'), true, SINCE)).toBe(true)
  })

  it('Z 한 글자 때문에 못 덮었다고 하지 않는다', () => {
    // 우리 시간대는 Z 가 없고 GitHub 시각에는 있다. 문자열로 그냥 비교하면
    // 같은 순간인데도 `Z` 가 크다는 이유로 "덜 받았다" 가 된다.
    const sameMoment = at('2026-08-06T00:00:00Z')
    expect(windowCovered(sameMoment, true, '2026-08-06T00:00:00')).toBe(true)
  })

  it('받은 게 하나도 없으면 물어볼 것이 없다', () => {
    expect(windowCovered([], true, SINCE)).toBe(true)
  })
})
