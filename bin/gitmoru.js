#!/usr/bin/env node
/**
 * gitmoru 진입점.
 *
 *   npx gitmoru          화면을 브라우저로 연다
 *   npx gitmoru mcp      MCP 서버를 띄운다 (AI 가 stdio 로 붙는다)
 *   npx gitmoru --help   쓸 수 있는 명령을 찍는다
 *
 * 되돌리기는 여기 없다. Electron 앱에서만 한다 (SAFETY.md 10번).
 * 저장소를 바꾸는 동작을 명령 한 줄로 열어두지 않는다.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , cmd] = process.argv

/*
  버그 신고에 붙일 것이 필요하다.

  "최신 버전인데도 안 돼요" 라는 말은 대부분 사실이 아니고, 확인할 방법이 없으면
  거기서 왕복이 두 번 더 생긴다. npx 는 캐시된 옛날 것을 쓰기도 한다.
*/
if (cmd === '--version' || cmd === '-v') {
  const pkg = fileURLToPath(new URL('../package.json', import.meta.url))
  console.log(JSON.parse(readFileSync(pkg, 'utf8')).version)
} else if (cmd === 'mcp') {
  // 번들이라 tsx 가 없어도 돈다. 원본은 src/mcp/ 에 있다.
  await import('../dist-mcp/index.js')
} else if (cmd === undefined || cmd === 'serve') {
  await import('./serve.mjs')
} else {
  const { msg } = await import('../server/messages.mjs')
  // 처음 쓰는 사람과 에이전트가 가장 먼저 치는 게 --help 다. 틀린 명령 취급하면 안 된다.
  const asked = cmd === '--help' || cmd === '-h'
  const usage = `
  npx gitmoru             ${msg.usageServe}
  npx gitmoru mcp         ${msg.usageMcp}
  npx gitmoru --version   ${msg.usageVersion}
  npx gitmoru --help      ${msg.usageHelp}
`
  if (asked) {
    console.log(usage)
  } else {
    console.error(`
  ${msg.unknownCommand(cmd)}
${usage}`)
    process.exit(1)
  }
}
