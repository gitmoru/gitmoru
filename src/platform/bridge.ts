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
import type { CaseFile, CaseListing } from '../core/types'

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
  /** 사건 기록 보관. 파일 시스템은 메인만 만진다. */
  caseSave(caseFile: CaseFile): Promise<{ ok: boolean; path?: string; error?: string }>
  caseList(): Promise<{ ok: boolean; cases?: CaseListing['cases']; unreadable?: string[] }>
  caseRead(id: string): Promise<{ ok: boolean; caseFile?: CaseFile | null }>
  caseDelete(id: string): Promise<{ ok: boolean; removed?: boolean }>
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

export const isDesktopApp = () => Boolean(desktop()?.isApp)

/**
 * 앱이 열어준 창구. 없으면 null.
 *
 * `window` 를 직접 만지지 않는다. 이 파일은 MCP 서버에서도 불려 오는데,
 * 거기는 Node 라 `window` 가 아예 없다. 속성을 읽는 게 아니라 **이름 자체가 없어서**
 * 참조하는 순간 터진다. 한 군데로 모아서 그 함정을 없앤다.
 */
function desktop(): NonNullable<Window['radar']> | null {
  if (typeof window === 'undefined') return null
  return window.radar ?? null
}

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
  void desktop()?.win(action)
}

/** Claude 연결 상태. 앱 모드가 아니면 확인할 수 없다. */
export async function mcpStatus(): Promise<McpStatus | null> {
  const app = desktop()
  if (!app) return null
  return app.mcpStatus()
}

/** 지난번에 고른 언어. 앱이 아니면 null 이고, 그때는 브라우저 저장소를 쓴다. */
export function savedLocale(): string | null {
  return desktop()?.startupLocale || null
}

/**
 * 사건 기록 보관.
 *
 * 앱 모드는 IPC 로, 웹 모드는 로컬 서버로 간다. 어느 쪽이든 같은 폴더에 쌓이고,
 * MCP 서버도 그 폴더를 읽는다. 그래서 앱에서 훑은 걸 에이전트가 다시 안 훑고 본다.
 *
 * 저장은 조용히 실패해도 된다. 기록이 안 남는 건 아쉬운 일이지만,
 * 그것 때문에 지금 눈앞의 조사 결과를 못 보게 되면 그게 더 나쁘다.
 */
export async function saveCaseFile(caseFile: CaseFile): Promise<boolean> {
  const app = desktop()
  if (app) return (await app.caseSave(caseFile)).ok

  const res = await fetch('/api/cases', {
    method: 'POST',
    headers: { 'x-radar-session': sessionKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(caseFile),
  })
  return res.ok
}

export async function listCaseFiles(): Promise<CaseListing> {
  const app = desktop()
  if (app) {
    const res = await app.caseList()
    return { cases: res.cases ?? [], unreadable: res.unreadable ?? [] }
  }

  const res = await fetch('/api/cases', { headers: { 'x-radar-session': sessionKey } })
  if (!res.ok) return { cases: [], unreadable: [] }
  return res.json()
}

export async function readCaseFile(id: string): Promise<CaseFile | null> {
  const app = desktop()
  if (app) return (await app.caseRead(id)).caseFile ?? null

  const res = await fetch(`/api/cases?id=${encodeURIComponent(id)}`, {
    headers: { 'x-radar-session': sessionKey },
  })
  if (!res.ok) return null
  return (await res.json()).caseFile ?? null
}

export async function deleteCaseFile(id: string): Promise<boolean> {
  const app = desktop()
  if (app) return (await app.caseDelete(id)).ok

  const res = await fetch(`/api/cases?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-radar-session': sessionKey },
  })
  return res.ok
}

/** 고른 언어를 남긴다. 앱 밖에서는 아무 일도 하지 않는다. */
export function rememberLocale(locale: string) {
  void desktop()?.setLocale(locale)
}

/** 설정 파일이 있는 폴더 열기 */
export async function revealPath(target: string) {
  const app = desktop()
  if (!app) return { ok: false }
  return app.reveal(target)
}

export async function mcpRegister() {
  const app = desktop()
  if (!app) return { ok: false, error: tr().reasons.desktopOnly }
  return app.mcpRegister()
}

/** 로컬 세션 키 (웹 모드에서만 필요). GitHub 토큰이 아니다. */
let sessionKey = ''
export function setSessionKey(key: string) {
  sessionKey = key
}

export async function whoami(): Promise<{ login: string; name: string }> {
  const app = desktop()
  if (app) {
    const res = await app.whoami()
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

  const app = desktop()
  if (app) {
    const res = await app.gh({ path, ...opts })
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
