#!/usr/bin/env node
/**
 * gitmoru 실행 진입점.
 *
 * 빌드된 화면을 127.0.0.1 에만 열고, GitHub 요청은 프록시로 중계한다.
 * 토큰은 이 프로세스 메모리에만 있고 브라우저로 내려가지 않는다 (SAFETY.md 4, 5번).
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, loadToken, SECURITY_HEADERS } from '../server/proxy.mjs'

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const SESSION_KEY = randomBytes(24).toString('hex')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)

  try {
    if (await handleApi(req, res, SESSION_KEY)) return
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: String(err?.message ?? err) }))
    return
  }

  // ── 정적 파일 ────────────────────────────────────────────
  const urlPath = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')

  // dist 밖으로 못 나가게 막는다 (path traversal)
  const filePath = join(ROOT, normalize(rel))
  if (!filePath.startsWith(ROOT + sep) && filePath !== join(ROOT, 'index.html')) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }

  try {
    let body = await readFile(filePath)
    const type = MIME[extname(filePath)] ?? 'application/octet-stream'

    // 세션 키를 페이지에 심는다. GitHub 토큰이 아니다.
    if (type.startsWith('text/html')) {
      body = Buffer.from(body.toString('utf8').replace('__RADAR_SESSION__', SESSION_KEY))
    }

    res.writeHead(200, { 'Content-Type': type })
    res.end(body)
  } catch {
    // SPA 라 알 수 없는 경로는 index.html 로 넘긴다
    try {
      const html = (await readFile(join(ROOT, 'index.html'), 'utf8')).replace(
        '__RADAR_SESSION__',
        SESSION_KEY,
      )
      res.writeHead(200, { 'Content-Type': MIME['.html'] })
      res.end(html)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  }
})

const PORT = Number(process.env.RADAR_PORT ?? 4174)

try {
  await loadToken()
} catch (err) {
  console.error(`\n  ${err.message}\n`)
  process.exit(1)
}

// 127.0.0.1 에만 바인딩한다. 같은 네트워크의 다른 기기에서는 접근할 수 없다.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`
  gitmoru

  http://127.0.0.1:${PORT}

  - 저장소를 내려받지 않습니다 (clone 하지 않음)
  - 화면은 이 컴퓨터 밖으로 통신하지 않습니다
  - GitHub 토큰은 이 프로세스 안에만 있습니다

  종료하려면 Ctrl+C
`)
})
