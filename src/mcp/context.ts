import { GitHubClient } from '../core/github'
import type { CaseFile } from '../core/types'
import { listCases, readCase, saveCase } from '../../server/cases.mjs'

/**
 * 도구들이 함께 쓰는 것들.
 *
 * 도구 파일마다 GitHub 클라이언트를 새로 만들거나 사건 보관소를 각자 들고 있으면
 * `scan` 이 만든 사건을 `triage` 가 못 찾는다. 하나만 만들어서 돌려쓴다.
 */
export type McpContext = {
  github: GitHubClient
  /** 이번 세션에서 꺼내 본 사건들. 디스크가 원본이고 이건 캐시다. */
  cases: Map<string, CaseFile>
}

export function createContext(): McpContext {
  return { github: new GitHubClient(), cases: new Map() }
}

/**
 * 사건을 디스크에 남긴다. 앱이 쓰는 폴더와 같은 곳이다.
 *
 * 저장에 실패해도 훑기 결과는 그대로 돌려준다. 기록이 안 남는 것보다
 * 방금 알아낸 걸 못 보게 되는 쪽이 나쁘다.
 */
export function keepCase(ctx: McpContext, caseFile: CaseFile) {
  ctx.cases.set(caseFile.id, caseFile)
  try {
    saveCase(caseFile)
  } catch {
    // 보관 실패는 조사 자체를 막지 않는다
  }
}

/** 앱에서 훑은 것까지 포함한 전체 목록. */
export function allCases() {
  return listCases()
}

/** MCP 가 요구하는 응답 모양. 우리는 글만 돌려준다. */
export const reply = (body: string) => ({
  content: [{ type: 'text' as const, text: body }],
})

/**
 * 줄을 이어 붙인다.
 *
 * `null` 은 "조건이 안 맞아 이 줄은 안 쓴다", 빈 문자열은 **일부러 둔 빈 줄**이다.
 * 예전에는 둘 다 `''` 로 적고 `.filter(Boolean)` 으로 걸러서, 문단 사이 빈 줄까지
 * 같이 사라졌다. 응답이 한 덩어리로 붙어 나오면 에이전트도 사람도 훑기 어렵다.
 */
export const lines = (rows: Array<string | null>) =>
  rows.filter((row) => row !== null).join('\n')

/**
 * 사건을 꺼내거나, 없으면 에이전트에게 그렇게 알린다.
 *
 * 없는 id 를 조용히 빈 결과로 돌려주면 에이전트는 "훑어봤는데 아무것도 없다" 로 읽는다.
 * 그건 이 도구가 제일 하면 안 되는 일이다 (SAFETY.md 10번).
 */
export function findCase(ctx: McpContext, caseId: string) {
  const cached = ctx.cases.get(caseId)
  if (cached) return { ok: true as const, caseFile: cached }

  // 이 세션에서 안 만든 것일 수 있다. 앱에서 훑은 사건이 대표적이다.
  try {
    const stored = readCase(caseId) as CaseFile | null
    if (stored) {
      ctx.cases.set(caseId, stored)
      return { ok: true as const, caseFile: stored }
    }
  } catch {
    // 못 읽으면 없는 것으로 본다. 아래에서 그렇게 알린다.
  }

  return {
    ok: false as const,
    response: reply(`그런 caseId 가 없어요: ${caseId}\nlist_cases 로 확인해 보세요.`),
  }
}

/** 파일 하나를 한 줄로. 목록 도구들이 같은 모양을 쓰게 한다. */
export const locationOf = (repo: string, branch?: string, path?: string) =>
  `${branch ? `${repo}@${branch}` : repo}${path ? ` :: ${path}` : ''}`
