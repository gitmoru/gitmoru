import { describe, expect, it } from 'vitest'

import { splitRepoEvents, type RawEvent } from '../github'

/**
 * 권한 없이도 보이는 것들.
 *
 * 문단속에서 보는 건 거의 다 저장소 관리자여야 조회된다. 그래서 관리자가 아닌 사람이
 * 그 화면을 열면 아무것도 못 얻는다. **사고를 먼저 발견하는 사람은 대개 관리자가 아니다.**
 *
 * 그런데 이 둘은 이벤트에 그냥 들어 있다. 권한이 필요 없고, 이미 받아오고 있는 응답이다.
 *
 *   포크        내용이 통째로 복사돼 나갔다. 원본을 지워도 그 복사본은 안 없어진다
 *   사람 추가   다시 들어올 길이다. 계정을 잠가도 안 닫힌다
 */

const WINDOW = { since: '2026-08-06T00:00:00', until: '2026-08-06T07:00:00' }

const ev = (type: string, payload: RawEvent['payload'] = {}, at = '2026-08-06T02:00:00Z'): RawEvent => ({
  type,
  created_at: at,
  actor: { login: 'attacker' },
  payload,
})

const split = (raw: RawEvent[]) => splitRepoEvents('someorg/somerepo', raw, WINDOW.since, WINDOW.until)

describe('포크', () => {
  it('어디로 갔는지까지 남긴다', () => {
    // 원본을 지워도 그 복사본은 남는다. 어디 있는지가 곧 할 일이다.
    const out = split([ev('ForkEvent', { forkee: { full_name: 'attacker/somerepo' } })])

    expect(out.exposures).toEqual([
      {
        repo: 'someorg/somerepo',
        at: '2026-08-06T02:00:00Z',
        actor: 'attacker',
        how: 'forked',
        via: 'attacker/somerepo',
      },
    ])
  })

  it('공개 전환과 같은 자리에 담긴다', () => {
    // 둘 다 되돌릴 수 없다. 브랜치를 되돌리는 일과는 성격이 다르다.
    const out = split([ev('PublicEvent'), ev('ForkEvent', { forkee: { full_name: 'x/y' } })])
    expect(out.exposures.map((e) => e.how)).toEqual(['made-public', 'forked'])
  })

  it('어디로 갔는지 모르면 지어내지 않는다', () => {
    expect(split([ev('ForkEvent', {})]).exposures[0]?.via).toBeUndefined()
  })
})

describe('사람 추가', () => {
  it('추가한 사람과 추가된 사람을 따로 남긴다', () => {
    const out = split([ev('MemberEvent', { action: 'added', member: { login: 'newcomer' } })])

    expect(out.collaborators).toEqual([
      {
        repo: 'someorg/somerepo',
        at: '2026-08-06T02:00:00Z',
        actor: 'attacker',
        member: 'newcomer',
      },
    ])
  })

  it('added 가 아닌 것은 안 본다', () => {
    // 사람이 빠지는 쪽은 여기서 말할 것이 없다.
    expect(split([ev('MemberEvent', { action: 'removed' })]).collaborators).toEqual([])
  })

  it('나간 것과 섞지 않는다', () => {
    // 앞은 이미 나가버린 것이고 이건 아직 닫을 수 있는 것이다.
    const out = split([ev('MemberEvent', { action: 'added', member: { login: 'x' } })])
    expect(out.exposures).toEqual([])
    expect(out.collaborators).toHaveLength(1)
  })
})

describe('시간대', () => {
  it('밖에서 일어난 일은 안 본다', () => {
    const out = split([
      ev('ForkEvent', { forkee: { full_name: 'x/y' } }, '2026-08-06T09:00:00Z'),
      ev('MemberEvent', { action: 'added', member: { login: 'x' } }, '2026-08-05T23:00:00Z'),
    ])
    expect(out.exposures).toEqual([])
    expect(out.collaborators).toEqual([])
  })
})
