import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { roleOf } from '../../core/fileRole'
import { summaryOf } from '../../core/findingText'
import { formatBytes } from '../../core/safeText'
import { summarize } from '../../core/scan'
import { findCase, locationOf, lines, reply, type McpContext } from '../context'

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
        return `${i + 1}. [${finding.attention}] ${where}\n   ${summaryOf(finding)}`
      })

      /*
        자동으로 실행되는 자리에서 바뀐 파일을 먼저 올린다.

        규칙에 걸렸는지와 무관하다. CI 정의가 바뀌었다는 건 임계값 없는 사실이고,
        자체 호스팅 러너를 쓰는 곳에서는 브랜치 덮어쓰기보다 더 멀리 간다.
      */
      const autoRun = caseFile.changes
        .flatMap((change) =>
          change.files
            .filter((file) => roleOf(file.path))
            .map((file) => ({ change, file, role: roleOf(file.path)! })),
        )
        .filter((x) => x.role === 'workflow' || x.role === 'gitHook')
        .slice(0, 10)

      const unsignalled = caseFile.changes
        .flatMap((change) =>
          change.files
            .filter((file) => file.signalIds.length === 0)
            .map((file) => ({ change, file })),
        )
        .slice(0, UNSIGNALLED_SAMPLE)

      return reply(
        lines([
          `사건: ${caseFile.title} (${caseFile.id})`,
          `신호 ${caseFile.findings.length}건 중 ${picked.length}건 표시`,
          '',
          /*
            공개로 바뀐 저장소를 신호보다 위에 둔다.

            이 도구가 답하는 질문이 "무엇부터 볼까" 다. 파일을 아무리 잘 읽어도
            저장소가 이미 인터넷에 있으면 먼저 할 일은 diff 가 아니라 키 교체다.
            아래 목록에 섞어두면 순서가 뒤집힌다.
          */
          ...(stats.exposed
            ? [
                `먼저: 비공개였던 저장소 ${stats.exposed}개가 이 시간대에 공개로 바뀌었습니다.`,
                ...(caseFile.exposures ?? []).map((e) => `- ${e.repo} (${e.at}, ${e.actor})`),
                '되돌려도 회수되지 않습니다. 그 안에 있던 키와 토큰부터 새로 발급하세요.',
                '',
              ]
            : []),
          ranked.length ? ranked.join('\n') : '(규칙에 걸린 것 없음)',
          '',
          autoRun.length
            ? [
                '자동으로 실행되는 자리에서 바뀐 파일 (규칙과 무관하게 먼저 보세요)',
                ...autoRun.map(
                  ({ change, file, role }) =>
                    `- [${role}] ${locationOf(change.repo, change.branch, file.path)}`,
                ),
                '',
              ].join('\n')
            : null,
          `규칙에 안 걸린 변경 ${stats.unreviewed}개 - 규칙이 못 잡는 방식도 있으니 직접 봐야 합니다.`,
          ...unsignalled.map(({ change, file }) => {
            const size = file.sizeAfter !== undefined ? `, ${formatBytes(file.sizeAfter)}` : ''
            return `- ${locationOf(change.repo, change.branch, file.path)} (${file.kind}${size})`
          }),
          stats.unreviewed > unsignalled.length
            ? `- 외 ${stats.unreviewed - unsignalled.length}개`
            : null,
          '',
          '다음: diff_file 로 무슨 줄이 새로 생겼는지 보세요. 전체가 필요하면 read_file 입니다.',
        ]),
      )
    },
  )
}
