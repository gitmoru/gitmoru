#!/usr/bin/env node
/**
 * gitmoru 진입점.
 *
 *   npx gitmoru          화면을 브라우저로 연다
 *   npx gitmoru mcp      MCP 서버를 띄운다 (AI 가 stdio 로 붙는다)
 *
 * 되돌리기는 여기 없다. Electron 앱에서만 한다 (SAFETY.md 10번).
 * 저장소를 바꾸는 동작을 명령 한 줄로 열어두지 않는다.
 */

const [, , cmd] = process.argv

if (cmd === 'mcp') {
  // 번들이라 tsx 가 없어도 돈다. 원본은 src/mcp/ 에 있다.
  await import('../dist-mcp/index.js')
} else if (cmd === undefined || cmd === 'serve') {
  await import('./serve.mjs')
} else {
  console.error(`
  그런 명령은 없어요: ${cmd}

  npx gitmoru        화면을 브라우저로 엽니다
  npx gitmoru mcp    MCP 서버를 띄웁니다
`)
  process.exit(1)
}
