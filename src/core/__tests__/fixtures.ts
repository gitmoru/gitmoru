import type { CaseFile } from '../types'

/**
 * 테스트용 빈 사건.
 *
 * 사건 하나 만드는 데 필드가 열 몇 개 필요해서, 테스트마다 따로 쓰면
 * `CaseFile` 에 필드가 하나 늘 때 여러 군데가 같이 깨진다.
 * 여기 하나만 고치면 되게 모아둔다.
 */
export function makeCase(over: Partial<CaseFile> = {}): CaseFile {
  return {
    version: 2,
    id: 'case-abc123',
    title: '테스트 사건',
    createdAt: '2026-01-01T00:00:00',
    scope: { orgs: [], repos: [] },
    window: { since: '2026-01-01T00:00:00', until: '2026-01-02T00:00:00', displayTz: 'UTC' },
    detectorConfig: {},
    stats: { reposScanned: 0, branchesScanned: 0, failures: 0 },
    failures: [],
    timeline: [],
    branches: [],
    changes: [],
    findings: [],
    ...over,
  }
}
