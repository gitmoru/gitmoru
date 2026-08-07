import { describe, expect, it } from 'vitest'

import { splitRepoEvents, type RawEvent } from '../github'

/**
 * 한 번 받은 이벤트를 푸시와 공개 전환으로 가르기.
 *
 * 여기 쓰인 모양은 지어낸 게 아니라 실제 응답에서 그대로 가져왔다.
 * `PublicEvent` 의 payload 는 정말로 비어 있고, 우리가 읽는 건 세 개뿐이다
 * (`type`, `created_at`, `actor.login`).
 *
 * 이 파일이 있는 이유는 하나다. 이 갈래가 조용히 망가지면
 * 화면에는 "그 시간대엔 아무도 안 건드렸어요" 가 뜬다. 저장소는 인터넷에 있는 채로.
 */

const WINDOW = { since: '2026-08-06T00:00:00', until: '2026-08-06T07:00:00' }

const push = (at: string, ref = 'refs/heads/main'): RawEvent => ({
  type: 'PushEvent',
  created_at: at,
  actor: { login: 'someone' },
  payload: { ref, before: 'aaa', head: 'bbb' },
})

const madePublic = (at: string, who = 'someone'): RawEvent => ({
  type: 'PublicEvent',
  created_at: at,
  actor: { login: who },
  payload: {},
})

const split = (raw: RawEvent[]) => splitRepoEvents('a/b', raw, WINDOW.since, WINDOW.until)

describe('splitRepoEvents', () => {
  it('같은 응답에서 푸시와 공개 전환을 둘 다 꺼낸다', () => {
    const out = split([push('2026-08-06T01:00:00Z'), madePublic('2026-08-06T02:00:00Z', 'attacker')])

    expect(out.pushes).toHaveLength(1)
    expect(out.exposures).toEqual([
      { repo: 'a/b', at: '2026-08-06T02:00:00Z', actor: 'attacker' },
    ])
  })

  it('푸시가 하나도 없어도 공개 전환은 남는다', () => {
    // 이게 이 기능을 만든 상황이다. 예전 코드는 여기서 빈 손으로 돌아왔다.
    const out = split([madePublic('2026-08-06T03:00:00Z')])

    expect(out.pushes).toEqual([])
    expect(out.exposures).toHaveLength(1)
  })

  it('우리가 모르는 이벤트는 조용히 흘려보낸다', () => {
    // 별 누르기, 포크, 이슈 코멘트. 여기 섞여 들어오면 숫자가 부풀어 오른다.
    const noise: RawEvent[] = [
      { type: 'WatchEvent', created_at: '2026-08-06T01:00:00Z', actor: { login: 'x' }, payload: {} },
      { type: 'ForkEvent', created_at: '2026-08-06T01:00:00Z', actor: { login: 'x' }, payload: {} },
    ]
    const out = split(noise)

    expect(out.pushes).toEqual([])
    expect(out.exposures).toEqual([])
  })

  it('시간대 밖의 공개 전환은 빼놓는다', () => {
    const out = split([madePublic('2026-08-05T23:59:59Z'), madePublic('2026-08-06T09:00:00Z')])
    expect(out.exposures).toEqual([])
  })

  /*
    끝시각과 정확히 같은 순간.

    우리가 만드는 시간대는 `2026-08-06T07:00:00` 이고 GitHub 이 주는 시각은
    `2026-08-06T07:00:00Z` 다. 그냥 문자열로 비교하면 `Z` 한 글자가 더 크다는 이유로
    이 이벤트가 범위 밖으로 밀린다. 경계에서 놓친 한 건이 곧 잘못된 안심이다.
  */
  it('끝시각과 같은 순간에 일어난 일을 Z 한 글자 때문에 놓치지 않는다', () => {
    const out = split([madePublic('2026-08-06T07:00:00Z'), push('2026-08-06T07:00:00Z')])

    expect(out.exposures).toHaveLength(1)
    expect(out.pushes).toHaveLength(1)
  })

  it('시작시각과 같은 순간도 마찬가지다', () => {
    expect(split([madePublic('2026-08-06T00:00:00Z')]).exposures).toHaveLength(1)
  })

  it('ref 가 없는 푸시는 브랜치를 지어내지 않고 버린다', () => {
    const broken: RawEvent = {
      type: 'PushEvent',
      created_at: '2026-08-06T01:00:00Z',
      actor: { login: 'x' },
      payload: {},
    }
    expect(split([broken]).pushes).toEqual([])
  })
})
