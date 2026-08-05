import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { checkAccess, DEFAULT_RECENT_DAYS, ORG_HOOK_SCOPE_CMD } from '../../core/access'
import { defang } from '../../core/safeText'
import { reply, type McpContext } from '../context'

/**
 * 문단속. 브랜치를 안 건드리고 들어오는 문을 센다.
 *
 * `scan` 과 따로 두는 이유가 있다. `scan` 은 시간대 안에 무엇이 바뀌었나를 보고,
 * 이벤트로 대상을 좁힌다. 여기서 보는 것들은 이벤트를 안 남겨서 좁힐 수가 없고,
 * 대신 만들어진 시각이 남아 있어서 언제든 확인할 수 있다.
 *
 * 사고 조사가 아니라 현황 점검이라, 사고가 없을 때 돌려도 값이 있다.
 */
export function registerCheckAccess(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'check_access',
    {
      title: '들어오는 문 세기',
      description: [
        '배포 키, 웹훅, 대기 중인 초대를 셉니다. 브랜치를 안 건드리고 저장소에 접근하는 길들입니다.',
        'scan 과 달리 시간대가 아니라 지금 상태를 봅니다. 사고가 없을 때 돌려도 값이 있습니다.',
        '판정하지 않습니다 - 웹훅이 있다는 게 나쁜 게 아니라, 만든 적 없는 게 있으면 그게 문제입니다.',
        '관리자 권한이 없는 저장소는 볼 수 없고, 그 사실도 같이 알려줍니다.',
      ].join(' '),
      inputSchema: {
        orgs: z.array(z.string()).optional().describe('조직 이름. 조직 초대까지 봅니다.'),
        repos: z
          .array(z.string())
          .optional()
          .describe('`소유자/저장소`. 비우면 접근 가능한 저장소 전부를 봅니다.'),
        recentDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe(`며칠 안에 생긴 것을 '최근' 으로 볼지. 기본 ${DEFAULT_RECENT_DAYS}`),
        includeForks: z.boolean().optional().describe('포크까지 볼지. 기본 안 봅니다.'),
      },
    },
    async ({ orgs, repos, recentDays, includeForks }) => {
      const days = recentDays ?? DEFAULT_RECENT_DAYS
      const since = new Date(Date.now() - days * 86_400_000).toISOString()

      // 저장소 목록을 받아둔다. admin, archived, fork 가 여기 들어 있어서 추가 호출이 없다.
      const all = await ctx.github.listAccessibleRepos()
      const picked = repos?.length
        ? all.filter((r) => repos.includes(r.fullName))
        : orgs?.length
          ? all.filter((r) => orgs.includes(r.owner))
          : all

      const report = await checkAccess(ctx.github, {
        repos: picked,
        orgs: orgs ?? [],
        since,
        includeForks,
      })

      const byWhy = (why: string) => report.gaps.filter((g) => g.why === why).length

      return reply(
        [
          `저장소 ${report.checked}곳을 봤습니다 (최근 ${days}일 기준)`,
          '',
          report.recent.length
            ? [
                `최근에 생긴 것 ${report.recent.length}건`,
                ...report.recent.map((item) => {
                  // 웹훅 주소는 공격자 인프라일 수 있다. 눌리지 않는 형태로 넘긴다.
                  const where = item.target ? ` → ${defang(item.target)}` : ''
                  const ro = item.readOnly ? ' (읽기 전용)' : ''
                  return `- [${item.kind}] ${item.repo} :: ${item.label}${where}${ro}  ${item.createdAt.slice(0, 10)}`
                }),
              ].join('\n')
            : `최근 ${days}일 안에 새로 생긴 건 없습니다.`,
          '',
          `그 밖에 이미 있던 것 - 배포 키 ${report.existing.deployKey}, 웹훅 ${report.existing.webhook}, 대기 초대 ${report.existing.invitation}`,
          '',
          byWhy('notAdmin') > 0
            ? `${byWhy('notAdmin')}곳은 관리자 권한이 없어 못 봤습니다. 이걸 "없다" 로 읽지 마세요.`
            : '',
          byWhy('failed') > 0 ? `${byWhy('failed')}곳은 조회에 실패했습니다.` : '',
          '',
          [
            '조직 전체에 걸리는 웹훅(admin:org_hook)은 확인하지 않았습니다.',
            'GitHub 에 이 권한의 읽기 전용 버전이 없어서, 받으면 조직 웹훅을 만들고 지우는 것까지 됩니다.',
            '읽기만 하는 도구가 요구할 권한이 아니라고 보고 빼뒀습니다.',
            `필요하면 사람이 직접 여세요: ${ORG_HOOK_SCOPE_CMD}`,
          ].join(' '),
        ]
          .filter(Boolean)
          .join('\n'),
      )
    },
  )
}
