import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { utcToZoned, zoneLabel } from '../../core/time'
import { findCase, lines, reply, type McpContext } from '../context'

/**
 * 기록을 덮어쓴 푸시만 따로 본다.
 *
 * `scan` 요약에는 "강제 푸시 3곳, 커밋 12개 사라짐" 처럼 뭉쳐서 나온다.
 * 그 숫자로는 **어느 브랜치가 얼마나 잃었는지**를 못 짚는다.
 * 복구 순서를 정하려면 그게 필요하다 - 6개 잃은 브랜치와 1개 잃은 브랜치는 다르다.
 *
 * 여기서도 판정하지 않는다. 강제 푸시 자체는 정상 작업일 수 있다.
 * 다만 '기록이 이어지지 않는' 경우는 사라진 양을 셀 수조차 없어서 따로 표시한다.
 */
export function registerListForcedPushes(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'list_forced_pushes',
    {
      title: '덮어쓴 푸시 목록',
      description: [
        '기록을 덮어쓴 푸시를 브랜치별로 나열합니다. 어느 브랜치가 커밋 몇 개를 잃었는지 나옵니다.',
        'scan 요약은 전체 합계만 주기 때문에, 복구 순서를 정하려면 이걸 보세요.',
        '강제 푸시 자체가 나쁜 게 아닙니다 - 한 적 없는 강제 푸시가 있으면 그게 문제입니다.',
        '확인하지 못한 푸시는 "확인 실패" 로 따로 나오며, 없었다는 뜻이 아닙니다.',
      ].join(' '),
      inputSchema: {
        caseId: z.string().describe('list_cases 로 확인한 사건 번호'),
        includeNormal: z
          .boolean()
          .optional()
          .describe('덮어쓰지 않은 평범한 푸시까지 볼지. 기본 안 봅니다.'),
      },
    },
    async ({ caseId, includeNormal }) => {
      const found = findCase(ctx, caseId)
      if (!found.ok) return found.response

      const c = found.caseFile
      const tz = c.window.displayTz

      const rows: string[] = []
      let dropped = 0
      let rewritten = 0
      let unchecked = 0

      // 많이 잃은 브랜치가 위로. 복구할 때 먼저 봐야 하는 순서다.
      const branches = [...c.branches].sort((a, b) => b.droppedCommits - a.droppedCommits)

      for (const b of branches) {
        for (const push of b.overwrite ? [b.overwrite] : []) {
          const where = `${b.repo}@${b.branch}`

          if (push.kind === 'forced') {
            dropped += push.droppedCommits
            rows.push(`- [덮어씀] ${where}  커밋 ${push.droppedCommits}개 사라짐`)
          } else if (push.kind === 'unrelated') {
            rewritten++
            rows.push(`- [갈아치움] ${where}  이전 기록과 이어지지 않음, 사라진 양을 셀 수 없음`)
          } else if (push.kind === 'unknown') {
            unchecked++
            rows.push(`- [확인 실패] ${where}  ${push.reason ?? '비교하지 못했습니다'}`)
          } else if (includeNormal) {
            rows.push(`- [보통] ${where}  커밋 ${push.addedCommits}개 추가`)
          }
        }
      }

      if (rows.length === 0) {
        return reply(
          lines([
            '덮어쓴 푸시를 찾지 못했습니다.',
            '이게 "없었다" 는 뜻은 아닙니다 - GitHub 활동 기록은 90일까지만 남고, 그 밖은 확인할 수 없습니다.',
          ]),
        )
      }

      return reply(
        lines([
          `${c.title} (${c.id})`,
          `본 시간대: ${utcToZoned(c.window.since, tz)} ~ ${utcToZoned(c.window.until, tz)} ${zoneLabel(tz)}`,
          '',
          ...rows,
          '',
          `합계: 사라진 커밋 ${dropped}개`,
          rewritten > 0 ? `기록이 갈아치워진 브랜치 ${rewritten}곳 - 되돌리기로도 못 살립니다` : null,
          unchecked > 0 ? `확인하지 못한 푸시 ${unchecked}건 - 없었다는 뜻이 아닙니다` : null,
          '',
          '되돌리려면 preview_restore 로 무엇이 어디로 가는지 먼저 보세요. 실행은 사람이 앱에서 합니다.',
        ]),
      )
    },
  )
}
