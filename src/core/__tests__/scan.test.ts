import { describe, expect, it } from 'vitest'

import { summarize, verdictOf } from '../scan'
import type { BranchChanges, BranchState, CaseFile, ScanFailure, TimelineEntry } from '../types'

/**
 * "0건" 을 갈라 읽기.
 *
 * 이 도구가 사람에게 하는 말 중에 제일 위험한 게 0 이다.
 * 아무 일도 없었던 0 과, 조회에 실패해서 나온 0 은 화면에 똑같이 0 으로 뜬다.
 * **뒤쪽을 앞쪽으로 읽히게 두면 도구가 거짓 안심을 파는 것이 된다** (ADR 0002).
 *
 * 여기 있는 것은 문구 검사가 아니라 그 갈림길 자체를 붙잡아 두는 테스트다.
 * 나중에 누가 조건 하나를 편하게 고치면 바로 여기서 걸린다.
 */

const branch = (over: Partial<BranchState> = {}): BranchState => ({
  repo: 'a/b',
  branch: 'main',
  status: 'untouched',
  currentSha: 'aaa',
  isProtected: false,
  findingIds: [],
  changedFiles: 0,
  forcedPushes: [],
  droppedCommits: 0,
  ...over,
})

const caseFile = (over: Partial<CaseFile> = {}): CaseFile => ({
  version: 1,
  id: 'c1',
  title: '테스트',
  createdAt: '2026-01-01T00:00:00',
  scope: { orgs: [], repos: [] },
  window: { since: '2026-01-01T00:00:00', until: '2026-01-02T00:00:00', displayTz: 'UTC' },
  detectorConfig: {},
  stats: { reposScanned: 0, branchesScanned: 0, treesFetched: 0, failures: 0 },
  failures: [],
  timeline: [],
  branches: [],
  changes: [],
  findings: [],
  ...over,
})

const push = (): TimelineEntry => ({
  at: '2026-01-01T01:00:00',
  repo: 'a/b',
  branch: 'main',
  actor: 'x',
  kind: 'push',
})

const failure = (reason: string): ScanFailure => ({
  target: 'a/b',
  reason,
  at: '2026-01-01T01:00:00',
})

const changed = (paths: string[], signalled: string[] = []): BranchChanges => ({
  repo: 'a/b',
  branch: 'main',
  baseSha: 'aaa',
  headSha: 'bbb',
  partial: false,
  files: paths.map((path) => ({
    path,
    kind: 'modified' as const,
    signalIds: signalled.includes(path) ? ['s1'] : [],
  })),
})

describe('verdictOf', () => {
  it('푸시 자체가 없었으면 활동 없음이다', () => {
    expect(verdictOf(caseFile())).toBe('no-activity')
  })

  it('푸시는 있었는데 내용이 그대로면 변화 없음이다', () => {
    const c = caseFile({ timeline: [push()], branches: [branch()] })
    expect(verdictOf(c)).toBe('no-changes')
  })

  it('바뀐 파일이 있으면 변화 있음이다', () => {
    const c = caseFile({
      timeline: [push()],
      branches: [branch({ status: 'changed', changedFiles: 1 })],
      changes: [changed(['src/a.ts'])],
    })
    expect(verdictOf(c)).toBe('has-changes')
  })

  it('조회에 실패한 게 하나라도 있으면 확인 못 함이다', () => {
    const c = caseFile({
      timeline: [push()],
      branches: [branch()],
      failures: [failure('429')],
    })
    expect(verdictOf(c)).toBe('incomplete')
  })

  it('상태가 unknown 인 브랜치가 있으면 확인 못 함이다', () => {
    const c = caseFile({
      timeline: [push()],
      branches: [branch({ status: 'unknown', unknownReason: '조회 실패' })],
    })
    expect(verdictOf(c)).toBe('incomplete')
  })

  it('확인 못 한 게 있으면 변화가 있어도 확인 못 함이 이긴다', () => {
    // 여기서 has-changes 가 나오면 "이만큼이 전부" 로 읽힌다. 실제로는 더 있을 수 있다.
    const c = caseFile({
      timeline: [push()],
      branches: [branch({ status: 'changed', changedFiles: 1 }), branch({ status: 'unknown' })],
      changes: [changed(['src/a.ts'])],
    })
    expect(verdictOf(c)).toBe('incomplete')
  })

  it('활동이 없어도 확인 못 한 게 있으면 활동 없음이라고 하지 않는다', () => {
    // 제일 나쁜 오독이다. 다 실패한 훑기가 "아무도 안 건드렸어요" 로 보인다.
    const c = caseFile({ failures: [failure('401')] })
    expect(verdictOf(c)).toBe('incomplete')
  })
})

describe('summarize', () => {
  it('신호가 안 붙은 변경도 사람이 읽을 몫으로 센다', () => {
    const c = caseFile({
      changes: [changed(['src/a.ts', 'src/b.ts', 'src/c.ts'], ['src/a.ts'])],
    })
    const s = summarize(c)
    expect(s.changedFiles).toBe(3)
    expect(s.signalled).toBe(1)
    expect(s.unreviewed).toBe(2)
  })

  it('자동 실행되는 자리는 따로 센다', () => {
    const c = caseFile({ changes: [changed(['.github/workflows/ci.yml', 'README.md'])] })
    expect(summarize(c).autoRun.workflow).toBe(1)
  })

  it('기록을 갈아치운 브랜치와 사라진 커밋을 센다', () => {
    const c = caseFile({
      branches: [
        branch({ forcedPushes: [{ kind: 'forced' } as never], droppedCommits: 6 }),
        branch({ forcedPushes: [{ kind: 'unrelated' } as never], droppedCommits: 0 }),
        branch({ forcedPushes: [{ kind: 'fast-forward' } as never] }),
      ],
    })
    const s = summarize(c)
    expect(s.forcedBranches).toBe(2)
    expect(s.rewrittenBranches).toBe(1)
    expect(s.droppedCommits).toBe(6)
  })

  it('확인하지 못한 푸시를 강제 푸시로 세지 않는다', () => {
    const c = caseFile({ branches: [branch({ forcedPushes: [{ kind: 'unknown' } as never] })] })
    expect(summarize(c).forcedBranches).toBe(0)
  })
})
