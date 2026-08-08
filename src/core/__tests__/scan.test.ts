import { describe, expect, it } from 'vitest'

import { summarize, verdictOf } from '../scan'
import { makeCase as caseFile } from './fixtures'
import type {
  BranchChanges,
  BranchState,
  RepoExposure,
  ScanFailure,
  TimelineEntry,
} from '../types'

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
  pushCount: 0,
  droppedCommits: 0,
  ...over,
})

const push = (): TimelineEntry => ({
  at: '2026-01-01T01:00:00',
  repo: 'a/b',
  branch: 'main',
  actor: 'x',
  kind: 'push',
})

const exposure = (): RepoExposure => ({ repo: 'a/b', at: '2026-01-01T02:00:00', actor: 'x' })

const madePublic = (): TimelineEntry => ({
  at: '2026-01-01T02:00:00',
  repo: 'a/b',
  branch: '',
  actor: 'x',
  kind: 'made-public',
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

  /*
    저장소가 공개로 바뀐 경우.

    이 갈림길이 이 검사를 만든 이유다. 공격자가 비공개 저장소를 공개로 돌리고
    푸시를 하나도 안 하면, 예전 코드에서는 타임라인이 비어서 '활동 없음' 이 나갔다.
    화면에는 "그 시간대엔 아무도 안 건드렸어요" 가 뜬다. 그 사이 저장소는 인터넷에 있다.
  */
  it('푸시가 하나도 없어도 공개로 바뀌었으면 활동 없음이 아니다', () => {
    const c = caseFile({ exposures: [exposure()], timeline: [madePublic()] })
    expect(verdictOf(c)).toBe('exposed')
  })

  it('바뀐 파일보다 공개 전환이 먼저다', () => {
    // 파일은 되돌리면 없던 일이 되고, 밖으로 나간 것은 안 그렇다.
    const c = caseFile({
      exposures: [exposure()],
      timeline: [push(), madePublic()],
      branches: [branch({ status: 'changed', changedFiles: 1 })],
      changes: [changed(['src/a.ts'])],
    })
    expect(verdictOf(c)).toBe('exposed')
  })

  it('확인 못 한 게 있으면 공개 전환보다 그게 먼저다', () => {
    // 여기서 exposed 로 접으면 "공개된 건 이 하나" 로 읽힌다. 더 있을 수 있다.
    const c = caseFile({ exposures: [exposure()], failures: [failure('403')] })
    expect(verdictOf(c)).toBe('incomplete')
  })
})

describe('summarize 의 공개 전환 수', () => {
  it('안 본 사건과 봤는데 없던 사건을 갈라 센다', () => {
    // 둘 다 0 으로 그리면, 안 본 것이 확인한 것처럼 보인다 (SAFETY.md 11번).
    expect(summarize(caseFile()).exposed).toBe(null)
    expect(summarize(caseFile({ exposures: [] })).exposed).toBe(0)
    expect(summarize(caseFile({ exposures: [exposure()] })).exposed).toBe(1)
  })

  it('옛 사건 파일은 0건이 아니라 안 봄으로 남는다', () => {
    // 이 검사가 생기기 전에 저장된 사건이다. 되짚어 채울 방법이 없다.
    const old = caseFile({ version: 1 })
    expect(summarize(old).exposed).toBe(null)
    expect(verdictOf(old)).not.toBe('exposed')
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
        branch({ overwrite: { kind: 'forced' } as never, droppedCommits: 6 }),
        branch({ overwrite: { kind: 'unrelated' } as never, droppedCommits: 0 }),
        branch({ overwrite: { kind: 'fast-forward' } as never }),
      ],
    })
    const s = summarize(c)
    expect(s.forcedBranches).toBe(2)
    expect(s.rewrittenBranches).toBe(1)
    expect(s.droppedCommits).toBe(6)
  })

  it('확인하지 못한 푸시를 강제 푸시로 세지 않는다', () => {
    const c = caseFile({ branches: [branch({ overwrite: { kind: 'unknown' } as never })] })
    expect(summarize(c).forcedBranches).toBe(0)
  })
})
