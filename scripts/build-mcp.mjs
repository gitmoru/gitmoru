/**
 * MCP 서버를 한 덩어리로 굽는다.
 *
 * 지금까지는 `npx tsx src/mcp/index.ts` 로 TypeScript 를 그대로 돌렸다.
 * 저장소를 클론해 둔 사람에게는 되지만, npm 으로 받은 사람에게는 안 된다.
 * tsx 가 없고, 소스 트리도 통째로 있어야 하기 때문이다.
 *
 * 파일 하나로 묶으면 그 두 가지가 다 사라진다. 확장자 없는 import 도 문제가 안 된다.
 *
 * MCP SDK 와 zod 는 밖에 둔다. 흔한 패키지라 겹치면 중복으로 받게 되고,
 * 버전이 어긋나면 그게 더 골치다. 우리 코드(`server/*.mjs` 포함)만 안으로 넣는다.
 *
 *   pnpm build:mcp
 */

import { build } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const result = await build({
  entryPoints: [resolve(ROOT, 'src/mcp/index.ts')],
  outfile: resolve(ROOT, 'dist-mcp/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // 자기 자리를 알아야 하는 코드가 있다. import.meta 를 살려둔다.
  external: ['@modelcontextprotocol/sdk/*', 'zod'],
  banner: {
    js: '// gitmoru MCP server. 원본은 src/mcp/ 에 있습니다. https://github.com/gitmoru/gitmoru',
  },
  logLevel: 'warning',
  metafile: true,
})

const out = Object.values(result.metafile.outputs)[0]
console.log(`  dist-mcp/index.js  ${(out.bytes / 1024).toFixed(0)}KB`)
