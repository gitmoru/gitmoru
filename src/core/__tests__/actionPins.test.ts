import { describe, expect, it } from 'vitest'

import { loosenedPins, readActionPins } from '../actionPins'
import { pinLoosenedDetector } from '../detectors/pinLoosened'
import type { DetectorContext } from '../types'

/**
 * 액션 고정이 풀린 자리 읽기.
 *
 * `@<40자리 해시>` 는 못 옮긴다. `@v46` 은 그 액션 주인이 언제든 옮긴다.
 * 2025년 3월 `tj-actions/changed-files` 가 정확히 그 방식으로 털렸다.
 *
 * 여기서도 어려운 건 찾는 게 아니라 **안 찾는 것**이다.
 * 태그를 쓰는 워크플로가 대부분이라, 안 박힌 걸 다 올리면 어디서나 뜬다.
 * 그래서 이 시간대에 **박혀 있던 것이 풀린 경우만** 잡는다.
 */

const SHA = 'a284dc1814e3fd07f2e34267fc8f81ea535e903a'
const OTHER = 'b'.repeat(40)

describe('readActionPins', () => {
  it('목록 항목이든 아니든 읽는다', () => {
    const text = ['steps:', '  - uses: actions/checkout@v5', '    uses: actions/setup-node@v5'].join(
      '\n',
    )
    expect(readActionPins(text)).toEqual([
      { action: 'actions/checkout', ref: 'v5' },
      { action: 'actions/setup-node', ref: 'v5' },
    ])
  })

  it('핀 뒤에 붙은 주석을 참조로 읽지 않는다', () => {
    // 핀을 박은 곳은 대개 `@<해시> # v46` 처럼 사람이 읽을 것을 뒤에 단다.
    // 여기서 주석을 같이 삼키면 어떤 해시도 해시로 안 보인다.
    const pins = readActionPins(`      - uses: tj-actions/changed-files@${SHA} # v46`)
    expect(pins).toEqual([{ action: 'tj-actions/changed-files', ref: SHA }])
  })

  it('따옴표가 붙어 있어도 읽는다', () => {
    expect(readActionPins(`  - uses: "actions/checkout@v5"`)).toEqual([
      { action: 'actions/checkout', ref: 'v5' },
    ])
  })

  it('하위 경로가 있는 액션도 읽는다', () => {
    expect(readActionPins('  - uses: github/codeql-action/analyze@v3')).toEqual([
      { action: 'github/codeql-action/analyze', ref: 'v3' },
    ])
  })

  it('이 저장소 안의 액션과 도커 이미지는 뺀다', () => {
    // 앞은 태그가 없고 뒤는 액션이 아니다. 여기서 말하는 문제가 생길 자리가 아니다.
    const text = ['  - uses: ./.github/actions/setup', '  - uses: docker://alpine:3.20'].join('\n')
    expect(readActionPins(text)).toEqual([])
  })

  it('참조가 아예 없으면 뺀다', () => {
    // 박힌 적이 없으니 "풀렸다" 는 말이 성립하지 않는다.
    expect(readActionPins('  - uses: actions/checkout')).toEqual([])
  })

  it('uses 가 아닌 줄은 건드리지 않는다', () => {
    expect(readActionPins('  # uses: actions/checkout@v5 라고 적어둔 주석')).toEqual([])
  })
})

describe('loosenedPins', () => {
  const pin = (action: string, ref: string) => ({ action, ref })

  it('해시에서 태그로 바뀌면 잡는다', () => {
    const found = loosenedPins(
      [pin('tj-actions/changed-files', SHA)],
      [pin('tj-actions/changed-files', 'v46')],
    )
    expect(found).toEqual([{ action: 'tj-actions/changed-files', before: SHA, after: 'v46' }])
  })

  it('해시에서 다른 해시로 바뀐 건 평범한 갱신이라 안 잡는다', () => {
    expect(loosenedPins([pin('a/b', SHA)], [pin('a/b', OTHER)])).toEqual([])
  })

  it('원래 태그였으면 안 잡는다', () => {
    // 이 시간대에 생긴 일이 아니다. 이걸 올리면 거의 모든 저장소에서 뜬다.
    expect(loosenedPins([pin('a/b', 'v5')], [pin('a/b', 'v6')])).toEqual([])
  })

  it('새로 추가된 액션은 안 잡는다', () => {
    // 안 박고 추가하는 건 너무 흔하다.
    expect(loosenedPins([], [pin('a/b', 'v1')])).toEqual([])
  })

  it('계속 박혀 있으면 안 잡는다', () => {
    expect(loosenedPins([pin('a/b', SHA)], [pin('a/b', SHA)])).toEqual([])
  })

  it('여러 번 쓰는 액션이 한 군데만 풀려도 잡는다', () => {
    // 열 군데 중 한 군데만 풀어놔도 그 한 군데로 들어온다.
    const found = loosenedPins(
      [pin('a/b', SHA), pin('a/b', SHA)],
      [pin('a/b', SHA), pin('a/b', 'main')],
    )
    expect(found).toEqual([{ action: 'a/b', before: SHA, after: 'main' }])
  })

  it('같은 액션을 두 번 올리지 않는다', () => {
    const found = loosenedPins([pin('a/b', SHA)], [pin('a/b', 'v1'), pin('a/b', 'v2')])
    expect(found).toHaveLength(1)
  })

  it('대문자로 적힌 해시도 해시로 본다', () => {
    expect(loosenedPins([pin('a/b', SHA.toUpperCase())], [pin('a/b', 'v1')])).toHaveLength(1)
  })

  it('해시처럼 생겼지만 짧은 건 해시가 아니다', () => {
    // 앞 7자만 적는 사람이 있다. 그건 고정이 아니라 줄임말이라 옮겨질 수 있다.
    expect(loosenedPins([pin('a/b', SHA.slice(0, 7))], [pin('a/b', 'v1')])).toEqual([])
  })
})

/**
 * 탐지기 배선.
 *
 * 순수 함수가 맞아도 **무엇을 그 함수에 넣느냐**에서 틀릴 수 있다.
 * 새로 생긴 파일을 넣으면 이전 상태가 없는데도 비교하려 들고,
 * 워크플로가 아닌 파일까지 넣으면 저장소마다 쓸데없이 두 번씩 받아온다.
 */
describe('pinLoosenedDetector', () => {
  const WITH_SHA = `steps:\n  - uses: a/b@${SHA}`
  const WITH_TAG = 'steps:\n  - uses: a/b@v1'

  /** 경로와 ref 로 내용을 돌려주는 가짜 GitHub */
  function ctxWith(files: Array<{ path: string; kind: 'modified' | 'added' }>) {
    const asked: string[] = []
    return {
      changes: [
        { repo: 'a/b', branch: 'main', baseSha: 'base', headSha: 'head', partial: false,
          files: files.map((f) => ({ ...f, signalIds: [] })) },
      ],
      events: [], repos: [], branches: [], window: { since: '', until: '', displayTz: 'UTC' },
      options: {}, reportFailure: () => {}, asked,
      gh: {
        getTextFile: async (_repo: string, path: string, ref: string) => {
          asked.push(`${path}@${ref}`)
          return ref === 'base' ? WITH_SHA : WITH_TAG
        },
      } as unknown as DetectorContext['gh'],
    }
  }

  it('바뀐 워크플로에서 풀린 핀을 올린다', async () => {
    const ctx = ctxWith([{ path: '.github/workflows/ci.yml', kind: 'modified' }])
    const found = await pinLoosenedDetector.run(ctx as unknown as DetectorContext)

    expect(found).toHaveLength(1)
    expect(found[0]?.facts).toMatchObject({ kind: 'pin-loosened', actions: [{ action: 'a/b' }] })
  })

  it('새로 생긴 파일은 건드리지 않는다', async () => {
    // 비교할 이전 상태가 없다. 받아오러 가지도 말아야 한다.
    const ctx = ctxWith([{ path: '.github/workflows/ci.yml', kind: 'added' }])

    expect(await pinLoosenedDetector.run(ctx as unknown as DetectorContext)).toEqual([])
    expect(ctx.asked).toEqual([])
  })

  it('워크플로가 아닌 파일은 받아오지도 않는다', async () => {
    const ctx = ctxWith([{ path: 'src/index.ts', kind: 'modified' }])

    expect(await pinLoosenedDetector.run(ctx as unknown as DetectorContext)).toEqual([])
    expect(ctx.asked).toEqual([])
  })

  it('파일 하나당 전후 두 번만 받아온다', async () => {
    const ctx = ctxWith([{ path: '.github/workflows/ci.yml', kind: 'modified' }])
    await pinLoosenedDetector.run(ctx as unknown as DetectorContext)

    expect(ctx.asked).toEqual(['.github/workflows/ci.yml@base', '.github/workflows/ci.yml@head'])
  })
})
