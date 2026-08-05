import { GitHubClient } from '../core/github'
import type { CaseFile } from '../core/types'

/**
 * 도구들이 함께 쓰는 것들.
 *
 * 도구 파일마다 GitHub 클라이언트를 새로 만들거나 사건 보관소를 각자 들고 있으면
 * `scan` 이 만든 사건을 `triage` 가 못 찾는다. 하나만 만들어서 돌려쓴다.
 */
export type McpContext = {
  github: GitHubClient
  /** 이번 세션에서 만든 사건들. 에이전트가 caseId 로 다시 꺼내 쓴다. */
  cases: Map<string, CaseFile>
}

export function createContext(): McpContext {
  return { github: new GitHubClient(), cases: new Map() }
}

/** MCP 가 요구하는 응답 모양. 우리는 글만 돌려준다. */
export const reply = (body: string) => ({
  content: [{ type: 'text' as const, text: body }],
})

/**
 * 사건을 꺼내거나, 없으면 에이전트에게 그렇게 알린다.
 *
 * 없는 id 를 조용히 빈 결과로 돌려주면 에이전트는 "훑어봤는데 아무것도 없다" 로 읽는다.
 * 그건 이 도구가 제일 하면 안 되는 일이다 (SAFETY.md 10번).
 */
export function findCase(ctx: McpContext, caseId: string) {
  const found = ctx.cases.get(caseId)
  if (found) return { ok: true as const, caseFile: found }
  return {
    ok: false as const,
    response: reply(`그런 caseId 가 없어요: ${caseId}\nlist_cases 로 확인해 보세요.`),
  }
}

/** 파일 하나를 한 줄로. 목록 도구들이 같은 모양을 쓰게 한다. */
export const locationOf = (repo: string, branch?: string, path?: string) =>
  `${branch ? `${repo}@${branch}` : repo}${path ? ` :: ${path}` : ''}`
