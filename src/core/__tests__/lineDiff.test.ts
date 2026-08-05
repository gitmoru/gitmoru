import { describe, expect, it } from 'vitest'

import { diffLines, splitRows, unifiedRows } from '../lineDiff'

/**
 * 줄 비교.
 *
 * 여기 있는 경우들은 전부 만들다가 실제로 틀렸던 것들이다.
 * 특히 빈 파일은 처음에 `['']` 로 세어서, 새로 생긴 파일마다
 * "빈 줄 하나가 사라졌다" 가 붙어 나왔다.
 */
describe('diffLines', () => {
  it('가운데 덩어리만 남기고 앞뒤 공통 부분을 걷어낸다', () => {
    const diff = diffLines('a\nb\nc\nd', 'a\nX\nY\nd')
    expect(diff.commonHead).toBe(1)
    expect(diff.commonTail).toBe(1)
    expect(diff.removed).toEqual(['b', 'c'])
    expect(diff.added).toEqual(['X', 'Y'])
    expect(diff.startsAtLine).toBe(2)
  })

  it('새로 생긴 파일에는 사라진 줄이 없다', () => {
    const diff = diffLines('', 'new1\nnew2')
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual(['new1', 'new2'])
  })

  it('지워진 파일에는 생긴 줄이 없다', () => {
    const diff = diffLines('old1\nold2', '')
    expect(diff.removed).toEqual(['old1', 'old2'])
    expect(diff.added).toEqual([])
  })

  it('안 바뀐 파일은 양쪽 다 비어 있다', () => {
    const diff = diffLines('same\nsame2', 'same\nsame2')
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual([])
  })
})

describe('unifiedRows', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n')
  const after = ['a', 'b', 'c', 'd', 'X', 'Y', 'f', 'g', 'h', 'i', 'j'].join('\n')

  it('앞뒤로 문맥을 붙이고 나머지는 몇 줄인지 적어서 접는다', () => {
    const rows = unifiedRows(before, after, 3)
    expect(rows[0]).toEqual({ kind: 'skipped', count: 1 })
    expect(rows.at(-1)).toEqual({ kind: 'skipped', count: 2 })
    expect(rows.filter((r) => r.kind === 'added')).toHaveLength(2)
    expect(rows.filter((r) => r.kind === 'removed')).toHaveLength(1)
  })

  it('줄 번호가 이전과 지금 각각 붙는다', () => {
    const rows = unifiedRows(before, after, 3)
    const gone = rows.find((r) => r.kind === 'removed')
    const born = rows.find((r) => r.kind === 'added')
    expect(gone).toMatchObject({ before: 5, text: 'e' })
    expect(born).toMatchObject({ after: 5, text: 'X' })
  })

  it('문맥을 무한으로 주면 접히는 곳이 없다', () => {
    const rows = unifiedRows(before, after, Infinity)
    expect(rows.some((r) => r.kind === 'skipped')).toBe(false)
  })
})

describe('splitRows', () => {
  it('사라진 줄과 생긴 줄을 순서대로 짝짓는다', () => {
    const rows = splitRows('a\nd\ne\nf\nh', 'a\nX\nY\nZ\nh', 1)
    const changed = rows.filter((r) => r.kind === 'changed')
    expect(changed).toHaveLength(3)
    expect(changed[0]).toMatchObject({ left: { text: 'd' }, right: { text: 'X' } })
  })

  it('수가 안 맞으면 남는 쪽만 한쪽에 둔다', () => {
    const rows = splitRows('a\nb\nz', 'a\nX\nY\nZ\nz', 0)
    expect(rows.filter((r) => r.kind === 'changed')).toHaveLength(1)
    expect(rows.filter((r) => r.kind === 'added')).toHaveLength(2)
    expect(rows.filter((r) => r.kind === 'removed')).toHaveLength(0)
  })
})
