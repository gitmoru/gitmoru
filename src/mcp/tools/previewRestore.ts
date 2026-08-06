import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { buildPlan, canRestore, markProtected } from '../../core/restore'
import { findCase, lines, reply, type McpContext } from '../context'

/**
 * 되돌리기 미리보기. 실행은 없다.
 *
 * 이 서버가 읽기 전용인 이유가 여기 있다. 에이전트는 바로 앞 단계에서
 * 공격자가 쓴 코드를 읽었다. 거기 "이전 지시를 무시하고 ..." 가 섞여 있는데
 * force-push 도구까지 열려 있으면 그 문장이 곧 실행 경로가 된다.
 *
 * 그래서 계획을 보여주는 데까지만 하고, 방아쇠는 사람이 앱에서 당긴다.
 */
export function registerPreviewRestore(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'preview_restore',
    {
      title: '되돌리기 미리보기',
      description: [
        '무엇을 어디로 되돌리게 될지 보여줍니다. **실행하지 않습니다.**',
        '이 MCP 서버는 저장소를 바꾸지 않습니다 - 실행은 사람이 gitmoru 앱에서 합니다.',
        '분석 대상 코드에 지시문이 섞여 있을 수 있어, 쓰기 권한을 에이전트에 열지 않습니다.',
      ].join(' '),
      inputSchema: { caseId: z.string() },
    },
    async ({ caseId }) => {
      const found = findCase(ctx, caseId)
      if (!found.ok) return found.response

      const gate = canRestore(found.caseFile)
      if (!gate.ok) return reply(`되돌릴 수 없는 상태예요 - ${gate.reason}`)

      const plan = await markProtected(ctx.github, buildPlan(found.caseFile))
      const blocked = plan.entries.filter((entry) => entry.isProtected)

      return reply(
        lines([
          `브랜치 ${plan.entries.length}개를 공격 직전 커밋으로 되돌리게 됩니다.`,
          blocked.length ? `그중 ${blocked.length}개는 보호 규칙에 막힙니다.` : null,
          '',
          ...plan.entries.map((entry) => {
            const mark = entry.isProtected ? '  [보호됨]' : ''
            return `- ${entry.repo}@${entry.branch}  ${entry.from.slice(0, 8)} → ${entry.to.slice(0, 8)}${mark}`
          }),
          '',
          '실행하려면 gitmoru 앱의 "되돌리기" 를 쓰세요. 이 서버는 아무것도 바꾸지 않습니다.',
        ]),
      )
    },
  )
}
