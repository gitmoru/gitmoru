import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { formatBytes } from '../../core/safeText'
import { findCase, locationOf, lines, reply, type McpContext } from '../context'
import type { FileChange } from '../../core/types'

const DEFAULT_LIMIT = 40

/** `120B → 40KB` 처럼. 한쪽만 알면 아는 쪽만 쓴다. */
function sizeLabel(file: FileChange): string {
  if (file.sizeBefore !== undefined && file.sizeAfter !== undefined) {
    return `${formatBytes(file.sizeBefore)} → ${formatBytes(file.sizeAfter)}`
  }
  return file.sizeAfter !== undefined ? formatBytes(file.sizeAfter) : ''
}

/**
 * 바뀐 파일 전부.
 *
 * 규칙과 무관하게 모은 목록이라, 여기 없는 변경은 그 시간대에 없었다는 뜻이다.
 * triage 가 "먼저 볼 것" 이라면 이건 "빠짐없이" 쪽이다.
 */
export function registerListChanges(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'list_changes',
    {
      title: '바뀐 파일 목록',
      description:
        '그 시간대에 바뀐 파일을 나열합니다. 규칙과 무관하게 전부 모은 목록이라, 여기 없는 변경은 없습니다.',
      inputSchema: {
        caseId: z.string(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        onlyWithSignals: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional().describe(`기본 ${DEFAULT_LIMIT}`),
      },
    },
    async ({ caseId, repo, branch, onlyWithSignals, limit }) => {
      const found = findCase(ctx, caseId)
      if (!found.ok) return found.response

      const max = limit ?? DEFAULT_LIMIT
      const rows: string[] = []
      let matched = 0

      for (const change of found.caseFile.changes) {
        if (repo && change.repo !== repo) continue
        if (branch && change.branch !== branch) continue

        for (const file of change.files) {
          if (onlyWithSignals && file.signalIds.length === 0) continue
          matched++
          if (rows.length >= max) continue

          const signal = file.signalIds.length ? ' *신호' : ''
          rows.push(
            `${locationOf(change.repo, change.branch, file.path)} [${file.kind}] ${sizeLabel(file)}${signal}`,
          )
        }
      }

      return reply(
        lines([
          `${matched}개 중 ${rows.length}개 표시`,
          '',
          ...rows,
          matched > rows.length ? `... 외 ${matched - rows.length}개 (limit 을 올리면 더 봅니다)` : null,
        ]),
      )
    },
  )
}
