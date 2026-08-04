import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { summarize, verdictOf } from '../../core/scan'
import { shareText } from '../../core/share'
import { findCase, reply, type McpContext } from '../context'

/** 사건을 다루는 작은 도구들. 훑기 흐름 바깥에 있는 것들을 모았다. */
export function registerCaseTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'share_summary',
    {
      title: '공유용 요약',
      description: '팀 채널에 그대로 붙여넣을 수 있는 요약문을 만듭니다.',
      inputSchema: { caseId: z.string() },
    },
    async ({ caseId }) => {
      const found = findCase(ctx, caseId)
      return found.ok ? reply(shareText(found.caseFile)) : found.response
    },
  )

  server.registerTool(
    'list_cases',
    {
      title: '사건 목록',
      description: '이번 세션에서 훑은 사건들을 보여줍니다.',
      inputSchema: {},
    },
    async () => {
      if (ctx.cases.size === 0) return reply('아직 훑은 게 없어요. scan 을 먼저 부르세요.')

      return reply(
        [...ctx.cases.values()]
          .map((caseFile) => {
            const stats = summarize(caseFile)
            return `${caseFile.id}  ${caseFile.title}  [${verdictOf(caseFile)}]  변경 ${stats.changed}, 확인실패 ${stats.unknown}`
          })
          .join('\n'),
      )
    },
  )
}
