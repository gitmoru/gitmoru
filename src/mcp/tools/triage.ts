import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { formatBytes } from '../../core/safeText'
import { summarize } from '../../core/scan'
import { findCase, locationOf, reply, type McpContext } from '../context'

/** 신호 없이 바뀐 파일을 몇 개까지 곁들일지 */
const UNSIGNALLED_SAMPLE = 8

/**
 * 무엇부터 볼지.
 *
 * 규칙에 걸린 것만 주면 안 된다. 규칙은 우리가 겪어본 공격에서 나오고,
 * 새 수법은 정의상 거기 없다. 그래서 "안 걸린 변경 N개" 를 같은 화면에 남긴다.
 */
export function registerTriage(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'triage',
    {
      title: '무엇부터 볼지',
      description: [
        '한 번의 호출로 "먼저 읽어야 할 것" 의 짧은 목록을 돌려줍니다.',
        '규칙에 걸린 것이 위에 오지만, 규칙에 안 걸린 변경도 개수로 함께 알려줍니다 -',
        '규칙이 못 잡는 방식이 있기 때문입니다.',
      ].join(' '),
      inputSchema: {
        caseId: z.string(),
        limit: z.number().int().min(1).max(50).optional().describe('기본 12'),
      },
    },
    async ({ caseId, limit }) => {
      const found = findCase(ctx, caseId)
      if (!found.ok) return found.response
      const { caseFile } = found

      const stats = summarize(caseFile)
      const byAttention = (level: string) => caseFile.findings.filter((f) => f.attention === level)
      const picked = [...byAttention('first'), ...byAttention('soon')].slice(0, limit ?? 12)

      const ranked = picked.map((finding, i) => {
        const where = locationOf(finding.repo, finding.branch, finding.path)
        return `${i + 1}. [${finding.attention}] ${where}\n   ${finding.summary}`
      })

      const unsignalled = caseFile.changes
        .flatMap((change) =>
          change.files
            .filter((file) => file.signalIds.length === 0)
            .map((file) => ({ change, file })),
        )
        .slice(0, UNSIGNALLED_SAMPLE)

      return reply(
        [
          `사건: ${caseFile.title} (${caseFile.id})`,
          `신호 ${caseFile.findings.length}건 중 ${picked.length}건 표시`,
          '',
          ranked.length ? ranked.join('\n') : '(규칙에 걸린 것 없음)',
          '',
          `규칙에 안 걸린 변경 ${stats.unreviewed}개 - 규칙이 못 잡는 방식도 있으니 직접 봐야 합니다.`,
          ...unsignalled.map(({ change, file }) => {
            const size = file.sizeAfter !== undefined ? `, ${formatBytes(file.sizeAfter)}` : ''
            return `- ${locationOf(change.repo, change.branch, file.path)} (${file.kind}${size})`
          }),
          stats.unreviewed > unsignalled.length
            ? `- 외 ${stats.unreviewed - unsignalled.length}개`
            : '',
          '',
          '다음: read_file 로 의심스러운 파일을 읽어보세요.',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    },
  )
}
