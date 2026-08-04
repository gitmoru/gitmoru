/**
 * GitHub 프록시 - 격리 경계.
 *
 * 이 파일이 SAFETY.md 3, 4, 5번을 실제로 강제하는 곳이다.
 *
 *  - 토큰은 이 프로세스 메모리에만 있고 브라우저로 내려가지 않는다
 *  - 요청은 api.github.com 으로만 나간다 (호스트 화이트리스트)
 *  - 쓰기(force-push 등)는 경로 화이트리스트에 있는 것만 허용한다
 *  - 세션 키와 Origin 을 검사해 같은 머신의 다른 프로그램을 막는다
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const GITHUB_HOST = 'api.github.com'
const GITHUB_ORIGIN = `https://${GITHUB_HOST}`

/**
 * 쓰기를 허용할 경로. 여기 없는 경로로는 어떤 변경 요청도 나가지 않는다.
 * 새 복구 동작을 추가할 때는 반드시 이 목록도 같이 늘려야 한다.
 */
const WRITE_ALLOWLIST = [
  /^repos\/[^/]+\/[^/]+\/git\/refs\/heads\/.+$/, // 브랜치 복구 (force-push)
  /^repos\/[^/]+\/[^/]+\/branches\/[^/]+\/protection$/, // 보호 규칙 일시 조정
]

const READ_ONLY_METHODS = new Set(['GET', 'HEAD'])

let cachedToken = null

/**
 * gh CLI 에 이미 로그인된 토큰을 빌려 쓴다.
 * 우리가 토큰을 받아 적거나 저장하지 않으므로, 사용자가 붙여넣을 것도 없고 유출될 것도 없다.
 */
export async function loadToken() {
  if (cachedToken) return cachedToken
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      windowsHide: true,
      timeout: 10_000,
    })
    const token = stdout.trim()
    if (!token) throw new Error('빈 토큰')
    cachedToken = token
    return token
  } catch {
    throw new Error(
      'gh CLI 로그인이 필요합니다. 터미널에서 `gh auth login` 을 먼저 실행해주세요.',
    )
  }
}

/** 로그, 에러에 토큰이 새어 나가지 않게 지운다. */
export function maskToken(text) {
  if (!cachedToken) return text
  return String(text).split(cachedToken).join('<토큰 가림>')
}

export async function whoami() {
  const token = await loadToken()
  const res = await fetch(`${GITHUB_ORIGIN}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub 인증 확인 실패 (${res.status})`)
  const user = await res.json()
  return { login: user.login, name: user.name }
}

/**
 * GitHub 호출의 단일 통로.
 *
 * HTTP 프록시(웹 모드)와 Electron IPC(앱 모드)가 **둘 다 이 함수만** 쓴다.
 * 목적지 고정, 쓰기 화이트리스트 같은 방어를 한 곳에서만 관리하기 위해서다.
 * 새 경로를 뚫고 싶으면 여기를 거치게 만들고, 우회로를 만들지 않는다.
 */
export async function callGitHub({ path, method = 'GET', body, intent }) {
  const m = String(method).toUpperCase()

  let target
  try {
    target = new URL(`${GITHUB_ORIGIN}/${String(path).replace(/^\/+/, '')}`)
  } catch {
    throw new Error('경로가 올바르지 않습니다.')
  }
  // 절대 URL 이나 `..` 이 섞여 들어와도 api.github.com 밖으로는 못 나간다.
  if (target.host !== GITHUB_HOST || target.protocol !== 'https:') {
    throw new Error('GitHub 외의 주소로는 요청할 수 없습니다.')
  }

  if (!READ_ONLY_METHODS.has(m)) {
    const cleanPath = target.pathname.replace(/^\/+/, '')
    if (!WRITE_ALLOWLIST.some((re) => re.test(cleanPath))) {
      throw new Error(`이 경로로는 변경 요청을 보낼 수 없습니다: ${m} ${cleanPath}`)
    }
    if (intent !== 'write') {
      throw new Error('변경 의도가 표시되지 않은 요청입니다.')
    }
  }

  const token = await loadToken()
  const res = await fetch(target, {
    method: m,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gitmoru',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  })

  const text = await res.text()
  return {
    status: res.status,
    ok: res.ok,
    body: text || '{}',
    rateRemaining: res.headers.get('x-ratelimit-remaining'),
    rateReset: res.headers.get('x-ratelimit-reset'),
  }
}

/**
 * `/api/gh/<path>` 요청을 GitHub 으로 중계한다.
 *
 * @returns 처리했으면 true. 우리 경로가 아니면 false 를 돌려 다음 핸들러로 넘긴다.
 */
export async function handleApi(req, res, sessionKey) {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (!url.pathname.startsWith('/api/')) return false

  // ── 같은 머신의 다른 프로그램 차단 ──────────────────────
  if (req.headers['x-radar-session'] !== sessionKey) {
    return send(res, 403, { error: '세션 키가 없거나 잘못됐습니다.' })
  }
  const origin = req.headers.origin
  if (origin && !isLocalOrigin(origin)) {
    return send(res, 403, { error: '허용되지 않은 출처입니다.' })
  }

  try {
    if (url.pathname === '/api/whoami') {
      return send(res, 200, await whoami())
    }

    if (url.pathname.startsWith('/api/gh/')) {
      return await proxyToGitHub(req, res, url)
    }

    return send(res, 404, { error: '알 수 없는 경로입니다.' })
  } catch (err) {
    return send(res, 500, { error: maskToken(err?.message ?? String(err)) })
  }
}

async function proxyToGitHub(req, res, url) {
  const rest = url.pathname.slice('/api/gh/'.length)
  const method = (req.method ?? 'GET').toUpperCase()

  // ── 목적지 고정 ─────────────────────────────────────────
  // 경로에 절대 URL 이나 `..` 이 섞여 들어와도 api.github.com 밖으로는 못 나간다.
  let target
  try {
    target = new URL(`${GITHUB_ORIGIN}/${rest}${url.search}`)
  } catch {
    return send(res, 400, { error: '경로가 올바르지 않습니다.' })
  }
  if (target.host !== GITHUB_HOST || target.protocol !== 'https:') {
    return send(res, 400, { error: 'GitHub 외의 주소로는 요청할 수 없습니다.' })
  }

  // ── 쓰기 제한 ───────────────────────────────────────────
  if (!READ_ONLY_METHODS.has(method)) {
    const cleanPath = target.pathname.replace(/^\/+/, '')
    const allowed = WRITE_ALLOWLIST.some((re) => re.test(cleanPath))
    if (!allowed) {
      return send(res, 403, {
        error: `이 경로로는 변경 요청을 보낼 수 없습니다: ${method} ${cleanPath}`,
      })
    }
    // 변경 요청은 UI 가 명시적으로 의도를 밝혀야 통과한다. 실수로 나가는 걸 막는 이중 잠금.
    if (req.headers['x-radar-intent'] !== 'write') {
      return send(res, 403, { error: '변경 의도가 표시되지 않은 요청입니다.' })
    }
  }

  const token = await loadToken()
  const body = READ_ONLY_METHODS.has(method) ? undefined : await readBody(req)

  const ghRes = await fetch(target, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gitmoru',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  })

  const text = await ghRes.text()
  res.writeHead(ghRes.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'x-ratelimit-remaining': ghRes.headers.get('x-ratelimit-remaining') ?? '',
    'x-ratelimit-reset': ghRes.headers.get('x-ratelimit-reset') ?? '',
  })
  res.end(text || '{}')
  return true
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 1_000_000) {
        reject(new Error('요청 본문이 너무 큽니다.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined))
    req.on('error', reject)
  })
}

function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin)
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return false
  }
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
  return true
}

/**
 * 페이지에 걸 CSP.
 *
 * `connect-src 'self'` 가 핵심이다. 페이로드에 박힌 C2 주소로
 * 브라우저가 요청을 보내는 것 자체가 불가능해진다.
 */
export const CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * 개발 서버용 CSP.
 *
 * Vite 는 인라인 스크립트(HMR 프리앰블)와 eval 을 쓴다. 운영용 CSP 를 그대로 걸면
 * React 가 아예 안 붙는다 - 화면이 비어버리고 원인도 안 보인다.
 * **느슨해지는 건 여기 두 가지뿐이고, 바깥으로 나가는 길(connect-src)은 그대로 막는다.**
 */
export const DEV_CSP = CSP.replace(
  "script-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
).replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*")

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
}
