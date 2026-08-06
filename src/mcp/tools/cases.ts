import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { shareText } from '../../core/share'
import { allCases, findCase, reply, type McpContext } from '../context'

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
      description: [
        '보관된 사건을 최근 순으로 보여줍니다.',
        '앱에서 훑은 것도 여기 나옵니다 - 같은 폴더를 봅니다.',
        '그래서 사람이 앱에서 훑어둔 걸 다시 훑지 않고 caseId 로 바로 열어볼 수 있습니다.',
      ].join(' '),
      inputSchema: {},
    },
    async () => {
      const { cases, unreadable } = allCases()
      if (cases.length === 0 && unreadable.length === 0) {
        return reply('아직 훑은 게 없어요. scan 을 먼저 부르세요.')
      }

      return reply(
        [
          ...cases.map(
            (c) =>
              `${c.id}  ${c.title}  ${c.createdAt.slice(0, 16)}  브랜치 ${c.branches}, 변경 파일 ${c.changedFiles}, 신호 ${c.findings}, 확인실패 ${c.failures}`,
          ),
          // 못 읽은 파일을 조용히 빼지 않는다. 목록에서 사라지면 없었던 것이 된다.
          ...(unreadable.length
            ? ['', `읽지 못한 파일 ${unreadable.length}개: ${unreadable.join(', ')}`]
            : []),
        ].join('\n'),
      )
    },
  )
}
