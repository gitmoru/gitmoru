/**
 * MCP 서버를 직접 두드려 보는 도구.
 *
 * 에이전트를 붙이기 전에 도구가 실제로 도는지 확인할 때 쓴다.
 * 한 프로세스 안에서 scan → triage → read_file 을 차례로 부른다.
 *
 *   node scripts/try-mcp.mjs <소유자/저장소> <시작 KST> <끝 KST>
 *
 * 예)
 *   node scripts/try-mcp.mjs 내계정/시험용저장소 "2026-08-05 02:00" "2026-08-05 03:00"
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const [repo, since, until] = process.argv.slice(2)
if (!repo || !since || !until) {
  console.error('사용법: node scripts/try-mcp.mjs <소유자/저장소> "<시작 KST>" "<끝 KST>"')
  process.exit(2)
}

const child = spawn('npx', ['tsx', 'src/mcp/index.ts'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: process.platform === 'win32',
})

const rl = createInterface({ input: child.stdout })
const waiting = new Map()
let seq = 0

rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const resolve = waiting.get(msg.id)
  if (resolve) {
    waiting.delete(msg.id)
    resolve(msg)
  }
})

function send(method, params) {
  const id = ++seq
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  return new Promise((r) => waiting.set(id, r))
}

function notify(method) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`)
}

/** 도구 하나를 부르고 글만 뽑아온다 */
async function call(name, args) {
  const res = await send('tools/call', { name, arguments: args })
  const parts = res?.result?.content ?? []
  return parts.map((p) => p.text ?? '').join('\n')
}

const line = (t) => console.log(`\n${'─'.repeat(60)}\n${t}\n${'─'.repeat(60)}`)

await send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'try-mcp', version: '0' },
})
notify('notifications/initialized')

line('1) scan - 무엇이 바뀌었는지 모으기')
const scanned = await call('scan', { repos: [repo], sinceKst: since, untilKst: until, title: '시험' })
console.log(scanned)

const caseId = scanned.match(/caseId:\s*(\S+)/)?.[1]
if (!caseId) {
  console.error('caseId 를 못 찾았어요.')
  child.kill()
  process.exit(1)
}

line('2) triage - 무엇부터 볼지')
console.log(await call('triage', { caseId }))

line('3) list_changes - 바뀐 파일 전부')
const changes = await call('list_changes', { caseId, limit: 10 })
console.log(changes)

const hit = changes.match(/(\S+)@(\S+) :: (\S+)/)
if (hit) {
  const [, r, b, path] = hit
  line(`4) read_file - ${path} 읽기 (에이전트가 판단할 원문)`)
  const body = await call('read_file', { repo: r, path, ref: b, maxChars: 1200 })
  console.log(body.slice(0, 1400))
}

line('5) preview_restore - 되돌리기 미리보기 (실행 안 함)')
console.log(await call('preview_restore', { caseId }))

child.kill()
