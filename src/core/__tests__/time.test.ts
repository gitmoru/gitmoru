import { describe, expect, it } from 'vitest'

import { utcToZoned, zonedToUtc } from '../time'

/**
 * 시간대.
 *
 * 예전에는 `+09:00` 이 코드에 박혀 있었다. 화면은 영어와 일본어로도 뜨는데
 * 시간만 한국시간으로 읽히면, 다른 나라 사람은 자기가 넣은 숫자와 다른 구간을 훑게 된다.
 * 조사 도구에서 시간을 잘못 읽는 것은 결과를 통째로 못 쓰게 만든다.
 */
describe('zonedToUtc', () => {
  it.each([
    ['2026-08-05 01:00', 'Asia/Seoul', '2026-08-04T16:00:00'],
    ['2026-08-05 01:00', 'UTC', '2026-08-05T01:00:00'],
    ['2026-08-05 01:00', 'Asia/Tokyo', '2026-08-04T16:00:00'],
  ])('%s 를 %s 로 읽으면 %s', (local, zone, want) => {
    expect(zonedToUtc(local, zone)).toBe(want)
  })

  // 서머타임이 있는 곳은 계절마다 오프셋이 달라서 고정 숫자를 쓸 수 없다
  it('여름에는 뉴욕이 -4 다', () => {
    expect(zonedToUtc('2026-08-05 01:00', 'America/New_York')).toBe('2026-08-05T05:00:00')
  })

  it('겨울에는 뉴욕이 -5 다', () => {
    expect(zonedToUtc('2026-01-05 01:00', 'America/New_York')).toBe('2026-01-05T06:00:00')
  })

  /*
    Date.parse 에 그냥 넘기면 알아보지 못한 글자를 2000년으로 만들어 낸다.
    그러면 엉뚱한 시간대를 훑고 "아무도 안 건드렸어요" 가 뜬다.
  */
  it.each(['어제쯤', '', 'nonsense', '2026-13-01 00:00', '2026-02-30 00:00', '2026-01-01 25:00'])(
    '%s 는 읽지 못했다고 던진다',
    (bad) => {
      expect(() => zonedToUtc(bad, 'UTC')).toThrow()
    },
  )
})

describe('utcToZoned', () => {
  it('넣은 숫자가 그대로 돌아온다', () => {
    expect(utcToZoned(zonedToUtc('2026-08-05 01:00', 'Asia/Seoul'), 'Asia/Seoul')).toBe(
      '2026-08-05 01:00',
    )
  })
})
