/**
 * 앱 실행 - `pnpm app` 하나로 끝난다.
 *
 * Vite 를 띄우고, 준비되면 Electron 창을 연다.
 * 포트가 이미 쓰이고 있으면 빈 포트를 찾아 쓴다 (4174 가 막혀 창이 안 뜨는 일이 없게).
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'

function isFree(port) {
  return new Promise((resolve) => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, HOST)
  })
}

async function findPort(start) {
  for (let p = start; p < start + 40; p++) if (await isFree(p)) return p
  throw new Error('빈 포트를 찾지 못했습니다.')
}

async function waitFor(url, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return
    } catch {
      // 아직 안 떴다
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('개발 서버가 시간 안에 뜨지 않았습니다.')
}

const port = await findPort(4174)
const url = `http://${HOST}:${port}`

console.log(`\n  gitmole 준비 중... (${url})\n`)

const vite = spawn('npx', ['vite', '--host', HOST, '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
})

let electron = null
const stop = () => {
  electron?.kill()
  vite.kill()
}
process.on('SIGINT', () => {
  stop()
  process.exit(0)
})

try {
  await waitFor(url)
} catch (err) {
  console.error(`\n  ${err.message}\n`)
  stop()
  process.exit(1)
}

electron = spawn('npx', ['electron', '.'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
  env: { ...process.env, RADAR_DEV_URL: url },
})

// 창을 닫으면 개발 서버도 같이 내린다.
electron.on('exit', () => {
  vite.kill()
  process.exit(0)
})
