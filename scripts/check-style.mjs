/**
 * 우리 글쓰기 규칙을 기계가 지키게 한다.
 *
 * CONTRIBUTING.md 에 적어둔 것들인데, 사람이 기억해서 지키는 규칙은 언젠가 샌다.
 * 실제로 이 저장소에서도 한 번 새서 나중에 47개 파일을 되돌려야 했다.
 *
 *   pnpm style
 */

import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, extname, sep } from 'node:path'

const SKIP = new Set(['node_modules', 'dist', '.git', '.sprite-preview', 'release', 'build'])
const EXT = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js', '.md'])

/**
 * AI 가 쓴 티가 나는 문자들.
 *
 * 긴 줄표와 가운뎃점은 사람이 손으로 잘 안 친다. 섞여 있으면 글이 기계 같아진다.
 */
const BANNED = [
  { ch: '—', name: '긴 줄표(—)', use: '-' },
  { ch: '–', name: '짧은 줄표(–)', use: '-' },
  { ch: '·', name: '가운뎃점(·)', use: ', ' },
  { ch: '…', name: '말줄임표(…)', use: '...' },
]

/** 이 규칙을 설명하는 자리에서는 그 문자가 나올 수밖에 없다 */
const ALLOW_FILES = new Set(['AGENTS.md', 'CONTRIBUTING.md', 'scripts/check-style.mjs'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (EXT.has(extname(name))) out.push(path)
  }
  return out
}

const problems = []
for (const path of walk('.')) {
  const rel = path.split(sep).join('/').replace(/^\.\//, '')
  if (ALLOW_FILES.has(rel)) continue

  const lines = readFileSync(path, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const { ch, name, use } of BANNED) {
      if (line.includes(ch)) {
        problems.push(`${rel}:${i + 1}  ${name} 대신 ${use} 를 쓰세요`)
      }
    }
  })
}

if (problems.length) {
  console.error(`\n  글쓰기 규칙에 어긋난 곳 ${problems.length}군데\n`)
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`)
  if (problems.length > 40) console.error(`  ... 외 ${problems.length - 40}군데`)
  console.error('')
  process.exit(1)
}

console.log('  글쓰기 규칙 통과')
