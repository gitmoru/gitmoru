import { tr } from '../../i18n'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { defaultDetectorConfig } from '../../core/detectors'
import { runScan, summarize, usageText, verdictText } from '../../core/scan'
import { localZone, zonedToUtc } from '../../core/time'
import { keepCase, lines, reply, type McpContext } from '../context'

/**
 * 훑기. 모든 작업의 출발점이다.
 *
 * 결과를 통째로 돌려주지 않고 caseId 만 준다. 브랜치 수백 개짜리 결과를 한 번에
 * 쏟으면 에이전트가 그걸 다 읽느라 정작 파일 내용을 볼 예산이 안 남는다.
 */
export function registerScan(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'scan',
    {
      title: '저장소 훑기',
      description: [
        '지정한 시간대에 GitHub 저장소에서 무엇이 바뀌었는지 모읍니다.',
        '판정하지 않습니다 - 바뀐 사실만 모으고, 무엇인지 판단하는 건 당신 몫입니다.',
        '결과는 caseId 로 저장되니 이후 도구에 그 id 를 넘기세요.',
        '범위를 좁힐수록(repos/branches) 훨씬 빠릅니다.',
      ].join(' '),
      inputSchema: {
        orgs: z.array(z.string()).optional().describe('조직 이름. repos 를 주면 무시됩니다.'),
        repos: z.array(z.string()).optional().describe('`소유자/저장소`. 지정하면 여기만 봅니다.'),
        branches: z
          .array(z.string())
          .optional()
          .describe('`소유자/저장소@브랜치`. 지정하면 이 브랜치만 봅니다.'),
        since: z.string().describe('시작 시각. `YYYY-MM-DD HH:mm`'),
        until: z.string().describe('끝 시각. `YYYY-MM-DD HH:mm`'),
        timezone: z
          .string()
          .optional()
          .describe(
            '위 시각을 어느 시간대로 읽을지 (예: `Asia/Seoul`). 안 주면 이 컴퓨터의 시간대로 읽습니다. 서버에서 도는 에이전트는 UTC 인데 사람은 다른 곳에 있는 경우가 많으니, 사람이 말한 시간대를 넣어 주세요.',
          ),
        actor: z
          .string()
          .optional()
          .describe('의심 계정. 알면 넣으세요 - 대상이 크게 좁아집니다.'),
        title: z.string().optional(),
      },
    },
    async (args) => {
      const zone = args.timezone || localZone()
      const caseFile = await runScan(ctx.github, {
        title: args.title ?? '이름 없는 사건',
        orgs: args.orgs ?? [],
        repos: args.repos ?? [],
        branches: args.branches,
        window: {
          since: zonedToUtc(args.since, zone),
          until: zonedToUtc(args.until, zone),
          displayTz: zone,
        },
        actor: args.actor,
        detectorConfig: defaultDetectorConfig(),
      })
      keepCase(ctx, caseFile)

      const stats = summarize(caseFile)
      const verdict = verdictText(caseFile)
      const incomplete = stats.unknown > 0 || stats.failures > 0
      const cost = usageText(caseFile)

      return reply(
        lines([
          `caseId: ${caseFile.id}`,
          '',
          `${verdict.title} - ${verdict.detail}`,
          '',
          `저장소 ${caseFile.stats.reposScanned}, 브랜치 ${stats.total}`,
          `변경됨 ${stats.changed}, 원복됨 ${stats.reverted}, 변경없음 ${stats.untouched}, 확인실패 ${stats.unknown}`,
          `바뀐 파일 ${stats.changedFiles} (그중 규칙에 걸린 것 ${stats.signalled}, 안 걸린 것 ${stats.unreviewed})`,
          stats.forcedBranches > 0
            ? `브랜치 ${stats.forcedBranches}개가 지금도 덮어써진 채이고, 그 사이 커밋 ${stats.droppedCommits}개가 없어졌습니다`
            : null,
          stats.autoRun.workflow > 0
            ? `CI 정의(.github/workflows) ${stats.autoRun.workflow}개가 바뀌었습니다. 다음 푸시부터 여기 적힌 대로 돕니다`
            : null,
          stats.rewrittenBranches > 0
            ? `그중 ${stats.rewrittenBranches}곳은 이전 기록과 이어지지 않는 새 기록으로 갈아치워졌습니다 (사라진 커밋 수를 셀 수 없음)`
            : null,
          // 파일 숫자 밑에 묻으면 안 된다. 여기부터 할 일이 달라진다.
          ...(stats.exposed
            ? [
                '',
                `비공개였던 저장소 ${stats.exposed}개가 이 시간대에 공개로 바뀌었습니다. 되돌린다고 회수되지 않습니다. 그 안에 있던 키와 토큰은 새로 발급해야 합니다.`,
                ...(caseFile.exposures ?? []).map(
                  (e) => `- ${e.repo}${e.how === 'forked' ? ` -> 포크 ${e.via ?? ''}` : ' (공개 전환)'} (${e.at}, ${e.actor})`,
                ),
              ]
            : []),
          '',
          // 왜 오래 걸렸는지, 다시 훑을 여유가 있는지. 나중에 반드시 물어보게 된다.
          ...(cost ? [cost.line, cost.lowBudget ? tr().usage.low : null] : []),
          ...(stats.added
            ? [
                `이 시간대에 저장소에 추가된 사람이 ${stats.added}명 있습니다. 계정을 잠가도 안 닫히고, 브랜치를 되돌려도 남습니다.`,
                ...(caseFile.collaborators ?? []).map(
                  (e) => `- ${e.repo}: ${e.member} (${e.at}, ${e.actor})`,
                ),
                '',
              ]
            : []),
          incomplete
            ? '주의: 확인하지 못한 대상이 있습니다. 이 결과를 "이상 없음" 으로 결론내지 마세요.'
            : null,
          '다음: triage 로 무엇부터 볼지 받아보세요.',
        ]),
      )
    },
  )
}
