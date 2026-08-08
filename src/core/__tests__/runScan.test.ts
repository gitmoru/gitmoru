import { describe, expect, it } from 'vitest'

import { runScan, verdictOf } from '../scan'
import { defaultDetectorConfig } from '../detectors'
import type { GitHubClient } from '../github'
import type { ScanRequest } from '../scan'

/**
 * 조각이 아니라 **이어붙인 자리**를 붙잡는다.
 *
 * 나머지 시험은 전부 함수 하나씩을 본다. 그런데 최근 세 번의 릴리스가 고친 것은
 * 전부 `runScan` 안의 서로 다른 지점이었다.
 *
 *   0.3.0  이벤트를 푸시와 공개 전환으로 가르고, 타임라인과 판정에 태운다
 *   0.4.0  잘린 목록을 브랜치 상태를 정하기 **전에** 실패로 걷는다
 *   0.4.0  비교에서 읽은 서명을 푸시 이벤트에 실어 탐지기까지 보낸다
 *   0.5.0  워크플로 파일을 두 시점에서 읽는다
 *
 * 조각은 저마다 시험이 있는데 맞물리는 자리는 코드를 눈으로 읽어서 확인했다.
 * 그건 안 확인한 것과 같은 수준이다.
 *
 * 네트워크는 안 쓴다. 남의 저장소를 건드리는 시험은 CI 에서 못 돌고,
 * 여기서 보려는 건 GitHub 이 아니라 우리 배선이다.
 */

const WINDOW = { since: '2026-08-06T00:00:00', until: '2026-08-06T07:00:00', displayTz: 'UTC' }

const REPO = 'someorg/somerepo'
const BASE = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)

interface FakeOptions {
  pushes?: Array<{ branch: string; before: string; head: string }>
  exposures?: Array<{ at: string; actor: string }>
  truncations?: Array<{ path: string; got: number }>
  /** 비교 응답의 서명 부분 */
  signing?: { baseSigned?: boolean; seen: number; unsigned: number; badSignature: number; total: number }
  /** 경로별 파일 크기. base 와 head 를 따로 준다. */
  baseTree?: Array<{ path: string; sha: string; size: number }>
  headTree?: Array<{ path: string; sha: string; size: number }>
  /** getTree 가 터지게 만들 때 */
  treeThrows?: boolean
}

/**
 * `runScan` 이 실제로 부르는 것만 답하는 가짜.
 *
 * 여기 없는 메서드를 파이프라인이 부르기 시작하면 이 시험이 먼저 깨진다.
 * 그것도 알아야 하는 정보라서 일부러 좁게 만든다.
 */
function fakeGitHub(opts: FakeOptions = {}) {
  const tree = (entries: FakeOptions['baseTree']) =>
    (entries ?? []).map((e) => ({ path: e.path, type: 'blob' as const, sha: e.sha, size: e.size }))

  return {
    listOrgRepos: async () => [
      { owner: 'someorg', name: 'somerepo', fullName: REPO, defaultBranch: 'main' },
    ],

    listRepoEvents: async () => ({
      pushes: (opts.pushes ?? []).map((p) => ({
        repo: REPO,
        branch: p.branch,
        actor: 'someone',
        createdAt: '2026-08-06T02:00:00Z',
        before: p.before,
        head: p.head,
      })),
      exposures: (opts.exposures ?? []).map((e) => ({
        repo: REPO,
        at: e.at,
        actor: e.actor,
        how: 'made-public' as const,
      })),
      // 파이프라인이 새로 읽기 시작한 것. 가짜가 좁아서 여기가 먼저 깨진다.
      collaborators: [],
    }),

    listBranches: async () => [{ repo: REPO, branch: 'main', sha: HEAD }],

    takeTruncations: () => opts.truncations ?? [],

    // 비용 계량기. 파이프라인이 새로 부르기 시작한 것이라 여기도 같이 는다.
    resetUsage: () => {},
    usage: () => ({ calls: 0, saved: 0 }),

    compare: async () => ({
      status: 'diverged' as const,
      aheadBy: 1,
      behindBy: 2,
      signing: opts.signing,
    }),

    getTree: async (_repo: string, sha: string) => {
      if (opts.treeThrows) throw new Error('500')
      return sha === BASE ? tree(opts.baseTree) : tree(opts.headTree)
    },

    getCommit: async (_repo: string, sha: string) => ({
      sha,
      message: 'x',
      authorName: 'someone',
      authorDate: '2026-08-06T02:00:00Z',
      committerName: 'someone',
      committerDate: '2026-08-06T02:00:00Z',
      parents: [],
      treeSha: 't',
    }),

    getTextFile: async () => null,
  } as unknown as GitHubClient
}

const request = (over: Partial<ScanRequest> = {}): ScanRequest => ({
  title: '시험',
  orgs: ['someorg'],
  repos: [],
  window: WINDOW,
  detectorConfig: defaultDetectorConfig(),
  ...over,
})

const scan = (opts: FakeOptions = {}, over: Partial<ScanRequest> = {}) =>
  runScan(fakeGitHub(opts), request(over))

describe('runScan 이 이어붙이는 자리', () => {
  it('푸시가 없어도 공개 전환은 사건에 남고 판정을 바꾼다', async () => {
    // 이 갈림길이 0.3.0 의 이유다. 예전에는 여기가 '활동 없음' 이었다.
    const c = await scan({ exposures: [{ at: '2026-08-06T03:00:00Z', actor: 'attacker' }] })

    expect(c.exposures).toEqual([
      { repo: REPO, at: '2026-08-06T03:00:00Z', actor: 'attacker', how: 'made-public' },
    ])
    expect(c.timeline.map((t) => t.kind)).toEqual(['made-public'])
    expect(verdictOf(c)).toBe('exposed')
  })

  it('공개 전환이 없었으면 0건으로 남는다. 안 본 것과 다르다', async () => {
    const c = await scan()
    expect(c.exposures).toEqual([])
    expect(verdictOf(c)).toBe('no-activity')
  })

  it('잘린 목록이 실패로 걷혀서 판정을 끌어내린다', async () => {
    /*
      걷는 걸 잊으면 여기가 조용해진다. 조회가 성공했으니 예외도 없고,
      배열도 멀쩡해서 아무 데서도 안 터진다.

      자리는 상관없다는 것도 여기서 확인했다. 브랜치 상태 뒤로 옮겨도 결과가 같다.
      판정이 마지막에 실패 개수를 세서 나오기 때문이다.
    */
    const c = await scan({ truncations: [{ path: 'orgs/someorg/repos', got: 1000 }] })

    expect(c.failures.map((f) => f.target)).toContain('orgs/someorg/repos')
    expect(verdictOf(c)).toBe('incomplete')
  })

  it('비교에서 읽은 서명이 탐지기까지 간다', async () => {
    // 도중에 끊기면 아무 데서도 안 터지고 신호만 조용히 사라진다.
    const c = await scan({
      pushes: [{ branch: 'main', before: BASE, head: HEAD }],
      signing: { baseSigned: true, seen: 3, unsigned: 2, badSignature: 0, total: 3 },
      baseTree: [{ path: 'a.ts', sha: 's1', size: 10 }],
      headTree: [{ path: 'a.ts', sha: 's2', size: 20 }],
    })

    const signing = c.findings.filter((f) => f.detectorId === 'signing-dropped')
    expect(signing).toHaveLength(1)
    expect(signing[0]?.facts).toMatchObject({ kind: 'signing-dropped', unsigned: 2 })
  })

  it('서명하던 흔적이 없으면 신호를 만들지 않는다', async () => {
    const c = await scan({
      pushes: [{ branch: 'main', before: BASE, head: HEAD }],
      signing: { baseSigned: false, seen: 3, unsigned: 3, badSignature: 0, total: 3 },
      baseTree: [{ path: 'a.ts', sha: 's1', size: 10 }],
      headTree: [{ path: 'a.ts', sha: 's2', size: 20 }],
    })

    expect(c.findings.filter((f) => f.detectorId === 'signing-dropped')).toEqual([])
  })

  it('신호가 안 붙은 변경도 목록에서 사라지지 않는다', async () => {
    // 사라지게 두면 규칙이 놓친 공격을 사람도 못 본다 (ADR 0002).
    const c = await scan({
      pushes: [{ branch: 'main', before: BASE, head: HEAD }],
      baseTree: [],
      headTree: [{ path: 'docs/readme.md', sha: 's2', size: 30 }],
    })

    const files = c.changes.flatMap((x) => x.files)
    expect(files.map((f) => f.path)).toEqual(['docs/readme.md'])
    expect(files[0]?.signalIds).toEqual([])
    expect(verdictOf(c)).toBe('has-changes')
  })

  it('트리를 못 받으면 그대로로 접지 않고 확인 못 함으로 남긴다', async () => {
    /*
      여기로 오는 길이 두 개다. 실패 목록에 브랜치가 올라 있어서 걸리는 길과,
      변경 목록을 못 만들어서 마지막 else 로 떨어지는 길.

      한쪽만 망가뜨리면 다른 쪽이 받아내서 이 시험이 안 깨진다. 확인해봤다.
      줄 하나가 아니라 **결과**를 붙잡고 있는 시험이고, 그게 맞다.
      화면에 'unknown' 이 뜨기만 하면 어느 길로 왔는지는 상관없다.
    */
    const c = await scan({
      pushes: [{ branch: 'main', before: BASE, head: HEAD }],
      treeThrows: true,
    })

    expect(c.branches[0]?.status).toBe('unknown')
    expect(verdictOf(c)).toBe('incomplete')
  })

  it('되돌아온 브랜치는 변경으로 세지 않는다', async () => {
    // 지금 커밋이 공격 직전 커밋과 같다. 비교할 변경 자체가 없다.
    const c = await scan({ pushes: [{ branch: 'main', before: HEAD, head: HEAD }] })

    expect(c.branches[0]?.status).toBe('reverted')
    expect(c.changes).toEqual([])
  })

  it('훑을 때 쓴 설정을 사건에 남긴다', async () => {
    // 나중에 같은 조건으로 다시 훑을 수 있어야 한다.
    const c = await scan()
    expect(Object.keys(c.detectorConfig).sort()).toEqual(
      [
        'forged-commit',
        'pin-loosened',
        'shared-blob',
        'signing-dropped',
        'size-jump',
        'tool-marker',
        'workflow-risk',
      ],
    )
  })
})
