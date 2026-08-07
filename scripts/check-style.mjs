/**
 * 우리 글쓰기 규칙을 기계가 지키게 한다.
 *
 * CONTRIBUTING.md 에 적어둔 것들인데, 사람이 기억해서 지키는 규칙은 언젠가 샌다.
 * 실제로 이 저장소에서도 한 번 새서 나중에 47개 파일을 되돌려야 했다.
 *
 *   pnpm style
 */

import { readFileSync } from 'node:fs'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, sep } from 'node:path'

const SKIP = new Set(['node_modules', 'dist', '.git', '.sprite-preview', 'release', 'build'])
const EXT = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js', '.md', '.yml', '.yaml'])

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
const ALLOW_FILES = new Set([
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.en.md',
  'CONTRIBUTING.ja.md',
  'scripts/check-style.mjs',
])

/**
 * 세 벌로 두는 문서들.
 *
 * 하나만 고치고 나머지를 잊는 건 시간 문제다. 실제로 README 가 한 번 그렇게 어긋났고,
 * 영어로 읽은 사람만 옛날 이야기를 보고 있었다. 내용까지는 못 보지만
 * 큰 제목 개수가 다르면 한쪽에 뭔가 붙었거나 빠진 것이다.
 */
const TRIOS = ['README', 'CONTRIBUTING']
const LANGS = ['', '.en', '.ja']

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

for (const base of TRIOS) {
  const counted = []
  for (const lang of LANGS) {
    const file = `${base}${lang}.md`
    if (!existsSync(file)) {
      problems.push(`${file}  세 벌 중 하나가 없어요`)
      continue
    }
    const heads = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('## ')).length
    counted.push({ file, heads })
  }
  const odd = counted.filter((c) => c.heads !== counted[0]?.heads)
  if (counted.length === LANGS.length && odd.length) {
    const shown = counted.map((c) => `${c.file} ${c.heads}개`).join(', ')
    problems.push(`${base}  세 벌의 큰 제목 개수가 달라요 (${shown})`)
  }
}

if (problems.length) {
  console.error(`\n  글쓰기 규칙에 어긋난 곳 ${problems.length}군데\n`)
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`)
  if (problems.length > 40) console.error(`  ... 외 ${problems.length - 40}군데`)
  console.error('')
  process.exit(1)
}

console.log('  글쓰기 규칙 통과')
