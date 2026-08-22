import { describe, expect, it } from 'vitest'

/**
 * 터미널이 어느 말로 하는지.
 *
 * 앱도 사이트도 세 언어로 말하는데 **`npx -y gitmoru` 를 친 사람이 처음 보는 화면만**
 * 한국어였다. 그 세 줄은 "이걸 지금 내 저장소에 돌려도 되나" 에 답하는 자리라,
 * 못 읽으면 거기서 멈춘다.
 *
 * 여기서 붙잡는 건 번역이 아니라 **고르는 규칙**이다. 처음 만들 때 `Intl` 만 봤는데
 * `LANG=en_US` 를 줘도 안 바뀌었다. Node 의 `Intl` 은 POSIX 환경변수가 아니라
 * 운영체제 설정을 읽는다.
 */

import { DICTS, pickLang } from '../../../server/messages.mjs'

/** 그 환경에서 어떤 사전이 뽑히는지 */
const dictFor = (env: Record<string, string>) => DICTS[pickLang(env)]

describe('터미널 말 고르기', () => {
  it('LANG 을 따른다', () => {
    // 이게 안 되면 사용자가 말을 바꿀 방법이 없다.
    expect(dictFor({ LANG: 'en_US.UTF-8' }).quit).toBe('Ctrl+C to stop')
    expect(dictFor({ LANG: 'ja_JP.UTF-8' }).quit).toBe('終了は Ctrl+C')
    expect(dictFor({ LANG: 'ko_KR.UTF-8' }).quit).toBe('종료하려면 Ctrl+C')
  })

  it('`ko-KR` 처럼 하이픈으로 와도 읽는다', () => {
    expect(pickLang({ LANG: 'ko-KR' })).toBe('ko')
  })

  it('LC_ALL 이 LANG 을 이긴다', () => {
    // POSIX 가 정한 순서다. 여기만 우리 마음대로 하면 안 된다.
    expect(pickLang({ LC_ALL: 'en_US.UTF-8', LANG: 'ko_KR.UTF-8' })).toBe('en')
  })

  it('GITMORU_LANG 이 제일 세다', () => {
    expect(pickLang({ GITMORU_LANG: 'ja', LC_ALL: 'ko_KR', LANG: 'ko_KR' })).toBe('ja')
  })

  it('모르는 지역은 영어로 간다', () => {
    // 못 알아본 지역이 한국어를 읽을 가능성보다 영어를 읽을 가능성이 높다.
    expect(pickLang({ LANG: 'fr_FR.UTF-8' })).toBe('en')
  })

  it('세 언어가 같은 열쇠를 다 가지고 있다', () => {
    // 하나가 빠지면 그 자리만 undefined 로 찍힌다. 반쯤 번역된 터미널이 제일 나쁘다.
    const keys = (d: object) => Object.keys(d).sort()
    expect(keys(DICTS.en)).toEqual(keys(DICTS.ko))
    expect(keys(DICTS.ja)).toEqual(keys(DICTS.ko))
  })

  it('gh 가 없는 것과 로그인이 안 된 것을 갈라 말한다', () => {
    // 고치는 방법이 다르다. CLI 가 없는 사람에게 로그인하라고 하면 제자리를 돈다.
    for (const d of Object.values(DICTS)) {
      expect(d.ghMissing).not.toBe(d.ghLoggedOut)
      expect(d.ghMissing).toContain('cli.github.com')
    }
  })
})
