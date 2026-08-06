import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { BranchChanges, BranchState, CaseFile, Finding } from '../types'
import { makeCase } from './fixtures'

/**
 * 사건 보관.
 *
 * 여기서 제일 중요한 건 **id 로 파일 이름을 만든다**는 점이다.
 * `../../` 같은 게 섞이면 엉뚱한 파일을 읽거나 지운다. 지금은 우리 코드만 id 를 만들지만,
 * 나중에 밖에서 들어올 자리라 경계를 테스트로 박아둔다.
 *
 * 두 번째는 못 읽은 파일을 조용히 빼지 않는 것이다 (SAFETY.md 11번).
 * 목록에서 사라지면 사람은 그게 원래 없었다고 읽는다.
 */

const dir = mkdtempSync(join(tmpdir(), 'gitmoru-cases-'))

// 홈 폴더를 건드리지 않게 임시 폴더로 돌린다
vi.mock('node:os', async () => {
  const real = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...real, homedir: () => dir }
})

const { casesDir, deleteCase, listCases, readCase, saveCase } = await import(
  '../../../server/cases.mjs'
)

const caseFile = (over: Partial<CaseFile> = {}) =>
  makeCase({
    createdAt: '2026-08-05T01:00:00',
    window: { since: '2026-08-04T00:00:00', until: '2026-08-04T07:00:00', displayTz: 'Asia/Seoul' },
    scope: { orgs: ['org1'], repos: [] },
    branches: [{ repo: 'a/b' } as BranchState],
    changes: [{ files: [{ path: 'x.ts' }, { path: 'y.ts' }] } as BranchChanges],
    findings: [{ id: 'f1' } as Finding],
    ...over,
  })

beforeAll(() => {
  saveCase(caseFile())
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('보관 위치', () => {
  it('홈 아래 정해진 폴더를 쓴다', () => {
    expect(casesDir()).toBe(join(dir, '.gitmoru', 'cases'))
  })
})

describe('사건 번호 검사', () => {
  it('우리가 만든 모양만 받는다', () => {
    expect(() => readCase('../../../etc/passwd')).toThrow()
    expect(() => readCase('case-abc/../..')).toThrow()
    expect(() => deleteCase('..')).toThrow()
    expect(() => saveCase(caseFile({ id: '../evil' }))).toThrow()
  })

  it('없는 번호는 던지지 않고 null 이다', () => {
    // 모양은 맞는데 파일이 없는 것과, 모양부터 틀린 것은 다르게 다뤄야 한다
    expect(readCase('case-nothinghere')).toBeNull()
    expect(deleteCase('case-nothinghere')).toBe(false)
  })
})

describe('읽고 쓰기', () => {
  it('저장한 걸 그대로 돌려준다', () => {
    const stored = readCase('case-abc123')
    expect(stored?.title).toBe('테스트 사건')
    expect(stored?.window.displayTz).toBe('Asia/Seoul')
  })

  it('같은 번호로 다시 저장하면 덮어쓴다', () => {
    saveCase(caseFile({ title: '고친 제목' }))
    expect(readCase('case-abc123')?.title).toBe('고친 제목')
    expect(listCases().cases).toHaveLength(1)
  })
})

describe('목록', () => {
  it('목록에 셈이 같이 나온다', () => {
    const [first] = listCases().cases
    expect(first?.branches).toBe(1)
    expect(first?.changedFiles).toBe(2)
    expect(first?.findings).toBe(1)
  })

  it('최근 것이 위로 온다', () => {
    saveCase(caseFile({ id: 'case-older', createdAt: '2026-01-01T00:00:00' }))
    saveCase(caseFile({ id: 'case-newer', createdAt: '2026-12-31T00:00:00' }))
    expect(listCases().cases.map((c) => c.id)[0]).toBe('case-newer')
  })

  it('못 읽은 파일을 조용히 빼지 않는다', () => {
    // 여기서 그냥 건너뛰면 "기록이 없다" 와 "기록을 못 읽었다" 가 같아진다
    writeFileSync(join(casesDir(), 'case-broken.json'), '{ 이건 JSON 이 아니다', 'utf8')
    const { cases, unreadable } = listCases()
    expect(unreadable).toContain('case-broken.json')
    expect(cases.some((c) => c.id === 'case-broken')).toBe(false)
  })

  it('지우면 목록에서 빠진다', () => {
    expect(deleteCase('case-older')).toBe(true)
    expect(listCases().cases.some((c) => c.id === 'case-older')).toBe(false)
  })
})
