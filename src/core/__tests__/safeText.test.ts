import { describe, expect, it } from 'vitest'

import { clampForAnalysis, collapseHiddenPadding, defang, wrapUntrusted } from '../safeText'

/**
 * 페이로드를 다루는 손.
 *
 * 여기 있는 것들은 전부 SAFETY.md 7, 9번을 코드로 옮긴 것이다.
 * 무력화가 빠지면 공격자 주소가 화면에서 눌리는 링크가 된다.
 */
describe('defang', () => {
  it('주소를 눌리지 않는 형태로 바꾼다', () => {
    expect(defang('https://evil.example')).toContain('hxxps://')
    expect(defang('http://evil.example')).toContain('hxxp://')
  })

  it('일반 문장의 마침표는 그대로 둔다', () => {
    expect(defang('끝났습니다. 다음으로.')).toBe('끝났습니다. 다음으로.')
  })
})

describe('collapseHiddenPadding', () => {
  it('공백으로 밀어낸 코드가 제 줄을 갖게 접는다', () => {
    const hidden = `head${' '.repeat(9000)}payload()`
    const { display, paddingFound } = collapseHiddenPadding(hidden)
    expect(paddingFound).toBe(9000)
    // 접고 나면 숨겨둔 꼬리가 별도 줄로 나온다
    expect(display.split('\n').at(-1)).toBe('payload()')
  })

  it('평범한 들여쓰기는 안 건드린다', () => {
    const code = 'function x() {\n  return 1\n}'
    expect(collapseHiddenPadding(code).paddingFound).toBe(0)
  })
})

describe('clampForAnalysis', () => {
  it('상한을 넘으면 잘랐다고 알린다', () => {
    const { text, truncated } = clampForAnalysis('x'.repeat(100), 10)
    expect(text).toHaveLength(10)
    expect(truncated).toBe(true)
  })
})

describe('wrapUntrusted', () => {
  it('데이터이지 지시가 아님을 못박아서 감싼다', () => {
    const out = wrapUntrusted('rm -rf /', { repo: 'a/b', path: 'x.sh' })
    expect(out).toContain('<untrusted-sample')
    expect(out).toContain('</untrusted-sample>')
    // 이 문장이 빠지면 에이전트가 페이로드 안의 문장을 지시로 읽을 수 있다
    expect(out.toLowerCase()).toMatch(/데이터|data/)
  })
})
