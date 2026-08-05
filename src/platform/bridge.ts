/**
 * 화면이 GitHub 에 닿는 유일한 통로.
 *
 * 실행 방식에 따라 두 가지 경로가 있는데, 화면 코드는 이 차이를 몰라도 된다.
 *
 *   앱 모드   - Electron IPC. 열린 포트가 없어 가장 안전하다.
 *   웹 모드   - 로컬 프록시(`/api/gh/*`). 브라우저에서 볼 때만 쓴다.
 *
 * 어느 쪽이든 **토큰은 화면으로 내려오지 않는다.** 목적지 고정과 쓰기 제한도
 * 전부 반대편(메인 프로세스 / 로컬 서버)에서 강제한다.
 */

import { tr } from '../i18n'

export interface GhResponse {
  status: number
  ok: boolean
  body: string
  rateRemaining: string | null
  rateReset: string | null
}

export type WinAction = 'minimize' | 'maximize' | 'close'

export interface McpStatus {
  ok: boolean
  hasCli: boolean
  registered: boolean
  command: string
  /** MCP 서버 스크립트의 절대 경로. 클라이언트마다 설정 모양이 달라 이게 필요하다. */
  scriptPath: string
  /** 도구별 설정 파일 위치와 존재 여부 */
  paths: Record<string, { path: string; exists: boolean }>
  error?: string | null
}

interface RadarBridge {
  isApp: true
  win(action: WinAction): Promise<{ ok: boolean }>
  mcpStatus(): Promise<McpStatus>
  mcpRegister(): Promise<{ ok: boolean; message?: string; error?: string }>
  reveal(target: string): Promise<{ ok: boolean }>
  /** 지난번에 고른 언어. 창이 뜨기 전에 메인이 실어 보낸 값이다. */
  startupLocale: string | null
  setLocale(locale: string): Promise<{ ok: boolean }>
  whoami(): Promise<{ ok: boolean; data?: { login: string; name: string }; error?: string }>
  gh(req: {
    path: string
    method?: string
    body?: string
    intent?: 'write'
  }): Promise<{ ok: boolean; data?: GhResponse; error?: string }>
}

declare global {
  interface Window {
    radar?: RadarBridge
  }
}

export const isDesktopApp = () =>
  typeof window !== 'undefined' && Boolean(window.radar?.isApp)

/**
 * GitHub 을 실제로 부르는 방식.
 *
 * 화면에서는 앱 다리(IPC)나 로컬 프록시를 쓰지만,
 * MCP 서버처럼 Node 에서 돌 때는 프록시 함수를 직접 꽂는다.
 * 어느 쪽이든 **목적지 고정과 쓰기 제한은 반대편이 강제한다.**
 */
export type GhTransport = (
  path: string,
  opts: { method?: string; body?: string; intent?: 'write' },
) => Promise<GhResponse>

let transport: GhTransport | null = null

export function setGhTransport(t: GhTransport) {
  transport = t
}

/** 창 조작. 앱 모드가 아니면 아무 일도 안 한다. */
export function windowAction(action: WinAction) {
  void window.radar?.win(action)
}

/** Claude 연결 상태. 앱 모드가 아니면 확인할 수 없다. */
export async function mcpStatus(): Promise<McpStatus | null> {
  if (!window.radar) return null
  return window.radar.mcpStatus()
}

/** 지난번에 고른 언어. 앱이 아니면 null 이고, 그때는 브라우저 저장소를 쓴다. */
export function savedLocale(): string | null {
  return window.radar?.startupLocale || null
}

/** 고른 언어를 남긴다. 앱 밖에서는 아무 일도 하지 않는다. */
export function rememberLocale(locale: string) {
  void window.radar?.setLocale(locale)
}

/** 설정 파일이 있는 폴더 열기 */
export async function revealPath(target: string) {
  if (!window.radar) return { ok: false }
  return window.radar.reveal(target)
}

export async function mcpRegister() {
  if (!window.radar) return { ok: false, error: tr().reasons.desktopOnly }
  return window.radar.mcpRegister()
}

/** 로컬 세션 키 (웹 모드에서만 필요). GitHub 토큰이 아니다. */
let sessionKey = ''
export function setSessionKey(key: string) {
  sessionKey = key
}

export async function whoami(): Promise<{ login: string; name: string }> {
  if (typeof window !== 'undefined' && window.radar) {
    const res = await window.radar.whoami()
    if (!res.ok || !res.data) throw new Error(res.error ?? tr().reasons.authFailed)
    return res.data
  }

  const res = await fetch('/api/whoami', { headers: { 'x-radar-session': sessionKey } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? tr().reasons.authFailed)
  }
  return res.json()
}

export async function ghCall(
  path: string,
  opts: { method?: string; body?: string; intent?: 'write' } = {},
): Promise<GhResponse> {
  if (transport) return transport(path, opts)

  if (typeof window !== 'undefined' && window.radar) {
    const res = await window.radar.gh({ path, ...opts })
    if (!res.ok || !res.data) throw new Error(res.error ?? tr().reasons.callFailed)
    return res.data
  }

  const res = await fetch(`/api/gh/${path.replace(/^\/+/, '')}`, {
    method: opts.method ?? 'GET',
    body: opts.body,
    headers: {
      'x-radar-session': sessionKey,
      ...(opts.intent ? { 'x-radar-intent': opts.intent } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

  return {
    status: res.status,
    ok: res.ok,
    body: await res.text(),
    rateRemaining: res.headers.get('x-ratelimit-remaining'),
    rateReset: res.headers.get('x-ratelimit-reset'),
  }
}
