import { tr } from '../../i18n'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { summaryOf } from '../../core/findingText'
import { summarize, usageText, verdictOf } from '../../core/scan'
import { utcToZoned, zoneLabel } from '../../core/time'
import { findCase, lines, reply, type McpContext } from '../context'

/**
 * 보관된 사건 하나를 펼친다.
 *
 * `list_cases` 는 목록만 준다. 사람이 앱에서 새벽에 훑어둔 사건을 에이전트가
 * 이어받으려면, 무엇을 어떤 조건으로 봤는지부터 알아야 한다.
 * 이게 없으면 에이전트는 결국 같은 걸 다시 훑는다.
 *
 * 요약만 준다. 파일 내용은 `diff_file`, `read_file` 이 따로 가져온다.
 * 여기서 다 실어 보내면 응답이 커지기만 하고, 정작 볼 것은 안 보인다.
 */
export function registerOpenCase(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'open_case',
    {
      title: '사건 펼치기',
      description: [
        '보관된 사건 하나를 펼쳐 봅니다. 앱에서 훑어둔 것도 그대로 열립니다.',
        '무엇을 언제 어떤 조건으로 봤는지, 그래서 무엇이 나왔는지를 한 번에 돌려줍니다.',
        '다시 훑기(scan) 전에 이걸 먼저 보세요 - 이미 있는 조사를 반복하지 않게 됩니다.',
        '확인하지 못한 대상이 있으면 그 사실도 같이 알려줍니다.',
      ].join(' '),
      inputSchema: {
        caseId: z.string().describe('list_cases 로 확인한 사건 번호'),
      },
    },
    async ({ caseId }) => {
      const found = findCase(ctx, caseId)
      if (!found.ok) return found.response

      const c = found.caseFile
      const s = summarize(c)
      const tz = c.window.displayTz
      const at = (iso: string) => utcToZoned(iso, tz)

      const cost = usageText(c)
      const first = c.findings.filter((f) => f.attention === 'first')

      return reply(
        lines([
          `${c.title}  (${c.id})`,
          `훑은 시각: ${at(c.createdAt)} ${zoneLabel(tz)}`,
          `본 시간대: ${at(c.window.since)} ~ ${at(c.window.until)} ${zoneLabel(tz)}`,
          `범위: ${c.scope.repos.length ? c.scope.repos.join(', ') : c.scope.orgs.join(', ') || '(접근 가능한 전부)'}`,
          c.actor ? `대상 계정: ${c.actor}` : null,
          '',
          `상태: ${verdictOf(c)}`,
          `저장소 ${c.stats.reposScanned}, 브랜치 ${s.total}`,
          `변경됨 ${s.changed}, 원복됨 ${s.reverted}, 변경없음 ${s.untouched}, 확인실패 ${s.unknown}`,
          `바뀐 파일 ${s.changedFiles} (규칙에 걸린 것 ${s.signalled}, 안 걸린 것 ${s.unreviewed})`,
          s.forcedBranches > 0
            ? `덮어써진 채 ${s.forcedBranches}곳, 없어진 커밋 ${s.droppedCommits}개`
            : null,
          s.autoRun.workflow > 0 ? `CI 정의 ${s.autoRun.workflow}개가 바뀌었습니다` : null,
          cost ? cost.line : null,
          cost?.lowBudget ? tr().usage.low : null,
          /*
            0 과 "안 봄" 을 갈라 적는다.

            이 검사가 생기기 전에 남긴 사건 파일에는 공개 전환 기록이 아예 없다.
            그걸 "0개" 로 적으면 읽는 쪽은 확인했다고 믿는다. 여기 오는 건 대개
            에이전트고, 에이전트는 적힌 대로 결론을 낸다.
          */
          s.exposed === null
            ? '공개 전환 여부: 이 사건을 훑을 때는 확인하지 않았습니다 (검사가 생기기 전 기록). 0건이라는 뜻이 아닙니다.'
            : null,
          ...(s.exposed
            ? [
                `비공개였던 저장소 ${s.exposed}개가 공개로 바뀌었습니다. 되돌려도 회수되지 않습니다. 키와 토큰을 새로 발급해야 합니다.`,
                ...(c.exposures ?? []).map((e) => `- ${e.repo} (${at(e.at)}, ${e.actor})`),
              ]
            : []),
          '',
          // 확인 못 한 게 있으면 맨 끝이 아니라 여기서 말한다 (SAFETY.md 11번)
          s.unknown > 0 || s.failures > 0
            ? `주의: 확인하지 못한 대상이 ${s.unknown + s.failures}건 있습니다. 이 결과를 "이상 없음" 으로 결론내지 마세요.`
            : null,
          first.length > 0 ? '먼저 볼 것' : null,
          ...first
            .slice(0, 10)
            .map(
              (f) => `- ${f.branch ? `${f.repo}@${f.branch}` : f.repo}: ${summaryOf(f)}`,
            ),
          first.length > 10 ? `... 외 ${first.length - 10}건` : null,
          '',
          '다음: triage 로 순서를 받거나, list_changes 로 바뀐 파일 전체를 보세요.',
        ]),
      )
    },
  )
}
