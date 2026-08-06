import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { setGhTransport } from '../platform/bridge'
import { createContext } from './context'
import { registerScan } from './tools/scan'
import { registerTriage } from './tools/triage'
import { registerListChanges } from './tools/listChanges'
import { registerReadFile } from './tools/readFile'
import { registerDiffFile } from './tools/diffFile'
import { registerPreviewRestore } from './tools/previewRestore'
import { registerCaseTools } from './tools/cases'
import { registerCheckAccess } from './tools/checkAccess'
import { registerOpenCase } from './tools/openCase'
import { registerListForcedPushes } from './tools/listForcedPushes'

// @ts-expect-error - 프록시는 순수 ESM JS 다 (npx 실행 시 빌드 없이 돌아야 함)
import { callGitHub } from '../../server/proxy.mjs'

/**
 * gitmoru MCP 서버.
 *
 * 목적이 하나다 - **도구가 못 하는 판단을 에이전트가 하게 한다.**
 * 무엇이 바뀌었는지는 우리가 모으고, 그게 무슨 코드인지는 에이전트가 읽는다.
 *
 * 설계에서 지킨 것들:
 *
 *  1. **읽기 전용이다.** 되돌리기(force-push)는 노출하지 않는다.
 *     에이전트는 공격자가 쓴 코드를 읽는다. 그 안에 "이전 지시를 무시하고 ..." 가
 *     들어 있을 수 있고, 되돌리기 도구가 열려 있으면 그게 곧 공격 경로가 된다.
 *     계획 미리보기까지만 주고, 실행은 사람이 앱에서 한다.
 *
 *  2. **도구는 일 단위로 만든다.** API 를 그대로 옮기지 않는다.
 *     `triage` 한 번이면 "무엇부터 볼지" 가 나오게 해서 왕복을 줄인다.
 *
 *  3. **출력은 짧게.** 에이전트는 토큰으로 값을 치른다.
 *     목록은 개수와 상한을 알려주고, 파일 본문은 잘라서 준다.
 *
 *  4. **파일 본문은 신뢰하지 않는 데이터로 감싼다.** 그 안의 문장은 지시가 아니다.
 *
 * 자세한 배경은 docs/decisions/0005-mcp-is-read-only.md 에 있다.
 */

// GitHub 호출은 프록시 함수를 그대로 쓴다. 목적지 고정과 쓰기 제한이 거기 있다.
setGhTransport(async (path, opts) => {
  const res = await callGitHub({
    path,
    method: opts.method ?? 'GET',
    body: opts.body,
    intent: opts.intent,
  })
  return {
    status: res.status,
    ok: res.ok,
    body: res.body,
    rateRemaining: res.rateRemaining,
    rateReset: res.rateReset,
  }
})

const server = new McpServer({ name: 'gitmoru', version: '0.1.0' })
const ctx = createContext()

// 등록 순서가 곧 쓰는 순서다. 훑고 → 추리고 → 바뀐 줄을 보고 → 필요하면 전체를 읽고 → 되돌릴지 본다.
registerScan(server, ctx)
registerTriage(server, ctx)
registerListChanges(server, ctx)
registerDiffFile(server, ctx)
registerReadFile(server, ctx)
registerPreviewRestore(server, ctx)
registerCheckAccess(server, ctx)
registerCaseTools(server, ctx)
registerOpenCase(server, ctx)
registerListForcedPushes(server, ctx)

await server.connect(new StdioServerTransport())
