import { describe, expect, it } from 'vitest'

import { readSigning, type RawCompare } from '../github'
import { signingDroppedDetector } from '../detectors/signingDropped'
import type { DetectorContext, PushEvent } from '../types'

/**
 * 서명이 끊긴 브랜치.
 *
 * 이 탐지기에서 어려운 건 찾는 게 아니라 **안 찾는 것**이다.
 * 서명을 안 쓰는 저장소가 대부분이라, 서명 없는 커밋만 세면 어디서나 뜬다.
 * 어디서나 뜨는 신호는 곧 아무도 안 읽는 신호가 된다.
 *
 * 그래서 여기 있는 절반은 "이 경우엔 안 떠야 한다" 를 붙잡아 두는 시험이다.
 */

const verification = (verified: boolean, reason: string) => ({ commit: { verification: { verified, reason } } })

const signed = () => verification(true, 'valid')
const unsigned = () => verification(false, 'unsigned')
const badSig = () => verification(false, 'unknown_key')

const compare = (base: ReturnType<typeof signed> | undefined, commits: Array<ReturnType<typeof signed>>, total?: number): RawCompare => ({
  status: 'ahead',
  ahead_by: commits.length,
  behind_by: 0,
  total_commits: total ?? commits.length,
  base_commit: base,
  commits,
})

const event = (raw: RawCompare): PushEvent => ({
  repo: 'a/b',
  branch: 'main',
  actor: 'x',
  createdAt: '2026-08-06T01:00:00Z',
  before: 'a'.repeat(40),
  head: 'b'.repeat(40),
  signing: readSigning(raw),
})

const run = (raw: RawCompare) =>
  signingDroppedDetector.run({
    events: [event(raw)],
    window: { since: '', until: '', displayTz: 'UTC' },
    repos: [],
    branches: [],
    changes: [],
    options: {},
    gh: {} as DetectorContext['gh'],
    reportFailure: () => {},
  })

/** 하나만 나왔는지 보고 그걸 준다. 인덱스 접근을 매번 확인하지 않으려고 둔다. */
function only<T>(items: T[]): T {
  expect(items).toHaveLength(1)
  return items[0] as T
}

describe('readSigning', () => {
  it('서명 없는 것과 안 맞는 서명을 갈라 센다', () => {
    // 한 칸에 담으면 흔한 쪽이 드문 쪽을 덮는다.
    const s = readSigning(compare(signed(), [unsigned(), badSig(), signed()]))
    expect(s).toMatchObject({ baseSigned: true, seen: 3, unsigned: 1, badSignature: 1 })
  })

  it('기준점이 응답에 없으면 비워둔다', () => {
    // 0 도 false 도 아니다. 모른다는 뜻이다.
    expect(readSigning(compare(undefined, [unsigned()]))?.baseSigned).toBeUndefined()
  })

  it('커밋 목록이 아예 없으면 아무 말도 하지 않는다', () => {
    expect(readSigning({ status: 'ahead', ahead_by: 0, behind_by: 0 })).toBeUndefined()
  })
})

describe('signingDroppedDetector', () => {
  it('서명 안 쓰는 저장소에서는 안 뜬다', async () => {
    // 이 시험이 제일 중요하다. 여기서 뜨면 이 탐지기는 소음이 된다.
    expect(await run(compare(unsigned(), [unsigned(), unsigned()]))).toEqual([])
  })

  it('기준점을 모르면 서명이 없어도 안 뜬다', async () => {
    // 기준점 없이 "서명 없음" 만으로 올리면 위 경우와 구별이 안 된다.
    expect(await run(compare(undefined, [unsigned(), unsigned()]))).toEqual([])
  })

  it('계속 서명하고 있으면 안 뜬다', async () => {
    expect(await run(compare(signed(), [signed(), signed()]))).toEqual([])
  })

  it('서명하던 브랜치에서 서명이 빠지면 뜬다', async () => {
    expect(only(await run(compare(signed(), [unsigned(), signed()]))).facts).toMatchObject({
      kind: 'signing-dropped',
      baseSigned: true,
      unsigned: 1,
      seen: 2,
    })
  })

  it('안 맞는 서명은 기준점이 없어도 뜬다', async () => {
    // 서명을 안 하는 건 평범하지만, 붙어 있는데 안 맞는 건 그렇지 않다.
    expect(only(await run(compare(unsigned(), [badSig()]))).attention).toBe('first')
  })

  it('안 맞는 서명이 서명 빠짐보다 먼저다', async () => {
    expect(only(await run(compare(signed(), [unsigned(), badSig()]))).attention).toBe('first')
  })

  it('250개를 넘어서 다 못 봤으면 그렇게 남긴다', async () => {
    expect(only(await run(compare(signed(), [unsigned()], 400))).facts).toMatchObject({ partial: true })
  })

  it('다 봤으면 다 봤다고 남긴다', async () => {
    expect(only(await run(compare(signed(), [unsigned()]))).facts).toMatchObject({ partial: false })
  })
})
