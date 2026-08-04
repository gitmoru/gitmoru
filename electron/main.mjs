/**
 * gitmoru 데스크톱 앱 (Electron 메인 프로세스).
 *
 * 웹 모드보다 격리가 강하다.
 *   - **열린 포트가 없다** - 같은 컴퓨터의 다른 프로그램이 접근할 경로 자체가 없다
 *   - 화면(렌더러)은 샌드박스에서 돌고 Node 를 못 만진다
 *   - GitHub 호출은 IPC 로 이 프로세스에 요청하고, 토큰은 여기 밖으로 안 나간다
 *   - 외부 주소로의 이동, 팝업을 전부 막는다 (SAFETY.md 3번)
 */

import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
import { callGitHub, CSP, loadToken, maskToken, whoami } from '../server/proxy.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.RADAR_DEV_URL

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    // 화면이 좁아지면 UI 가 접히도록 만들어뒀으니 작은 창도 허용한다
    minWidth: 720,
    minHeight: 520,
    show: false,
    icon: join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#070a1c',
    /*
      창틀을 통째로 없앤다. OS 버튼은 얇은 선 아이콘이라
      우리 도트 화면 옆에 두면 혼자 따로 논다. 버튼도 직접 그린다.
    */
    frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  win.once('ready-to-show', () => win?.show())

  /*
    최대화를 풀 때 돌아갈 크기.
    한 번도 크기를 바꾼 적 없는 창은 복원 크기가 비어 있어서
    작업 표시줄만 한 크기로 쪼그라들 수 있다. 쓸 만한 크기로 잡아준다.
  */
  win.on('unmaximize', () => {
    if (!win) return
    const [w, h] = win.getSize()
    if (w < 900 || h < 600) {
      win.setSize(1200, 800)
      win.center()
    }
  })

  // ── 바깥으로 나가는 길을 전부 막는다 ──────────────────────
  // 페이로드에 박힌 주소로 우리가 먼저 접속하는 사고를 구조적으로 없앤다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isGitHubWeb(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (e, url) => {
    const allowed = DEV_URL && url.startsWith(DEV_URL)
    if (!allowed) {
      e.preventDefault()
      if (isGitHubWeb(url)) shell.openExternal(url)
    }
  })

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

/** 사용자가 근거 링크를 눌렀을 때만 기본 브라우저로 연다. github.com 만 허용. */
function isGitHubWeb(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.host === 'github.com' || u.host === 'www.github.com')
  } catch {
    return false
  }
}

// ── IPC - 화면이 GitHub 에 닿는 유일한 통로 ─────────────────
ipcMain.handle('radar:whoami', async () => {
  try {
    return { ok: true, data: await whoami() }
  } catch (err) {
    return { ok: false, error: maskToken(err?.message ?? String(err)) }
  }
})

/**
 * Claude 에 붙이기.
 *
 * 설정 파일을 우리가 직접 고치지 않는다. `claude mcp add` 를 대신 실행할 뿐이라
 * 무엇이 등록되는지는 그 명령이 정한다 - 우리가 남의 설정을 몰래 만지지 않는다.
 */
const APP_DIR = resolve(__dirname, '..')
const MCP_ARGS = ['tsx', join(APP_DIR, 'src', 'mcp', 'index.ts')]

function mcpCommand() {
  return `claude mcp add gitmoru -- npx ${MCP_ARGS.join(' ')}`
}

/**
 * 도구마다 설정 파일이 어디 있는지.
 *
 * 경로를 화면에 그대로 보여주려고 여기서 만든다.
 * "~/.cursor/mcp.json" 이라고만 하면 사람은 그걸 또 찾아 헤맨다.
 * 파일이 이미 있는지도 같이 알려준다 - 새로 만들지, 고쳐 넣을지가 갈리기 때문이다.
 */
function clientPaths() {
  const home = homedir()
  const mac = process.platform === 'darwin'
  const p = (...bits) => join(...bits)

  const list = {
    'claude-desktop': mac
      ? p(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : p(process.env.APPDATA ?? p(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json'),
    cursor: p(home, '.cursor', 'mcp.json'),
    windsurf: p(home, '.codeium', 'windsurf', 'mcp_config.json'),
    codex: p(home, '.codex', 'config.toml'),
    gemini: p(home, '.gemini', 'settings.json'),
  }

  return Object.fromEntries(
    Object.entries(list).map(([k, v]) => [k, { path: v, exists: existsSync(v) }]),
  )
}

/** 설정 파일이 있는 폴더를 열어준다. 읽기만 하고 아무것도 안 바꾼다. */
ipcMain.handle('radar:reveal', async (_e, target) => {
  try {
    if (typeof target !== 'string' || !target) return { ok: false }
    if (existsSync(target)) shell.showItemInFolder(target)
    else await shell.openPath(dirname(target))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) }
  }
})

ipcMain.handle('radar:mcp-status', async () => {
  try {
    const { stdout } = await run('claude', ['mcp', 'list'], {
      windowsHide: true,
      timeout: 20_000,
      shell: process.platform === 'win32',
    })
    return {
      ok: true,
      hasCli: true,
      registered: /(^|\s)gitmoru[:\s]/.test(stdout),
      command: mcpCommand(),
      scriptPath: MCP_ARGS[1],
      paths: clientPaths(),
    }
  } catch (err) {
    const missing = String(err?.message ?? '').match(/ENOENT|not found|not recognized/i)
    return {
      ok: true,
      hasCli: !missing,
      registered: false,
      command: mcpCommand(),
      scriptPath: MCP_ARGS[1],
      paths: clientPaths(),
      error: missing ? null : String(err?.message ?? err).slice(0, 200),
    }
  }
})

ipcMain.handle('radar:mcp-register', async () => {
  try {
    const { stdout } = await run('claude', ['mcp', 'add', 'gitmoru', '--', 'npx', ...MCP_ARGS], {
      cwd: APP_DIR,
      windowsHide: true,
      timeout: 30_000,
      shell: process.platform === 'win32',
    })
    return { ok: true, message: stdout.trim().slice(0, 300) }
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 300) }
  }
})

// 창 조작 - 우리가 그린 버튼이 이걸 부른다
ipcMain.handle('radar:win', (_e, action) => {
  if (!win) return { ok: false }
  if (action === 'minimize') win.minimize()
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
  else if (action === 'close') win.close()
  return { ok: true }
})

ipcMain.handle('radar:gh', async (_e, req) => {
  try {
    const res = await callGitHub({
      path: String(req?.path ?? ''),
      method: req?.method ?? 'GET',
      body: req?.body,
      intent: req?.intent,
    })
    return { ok: true, data: res }
  } catch (err) {
    return { ok: false, error: maskToken(err?.message ?? String(err)) }
  }
})

app.whenReady().then(async () => {
  // 렌더러에도 웹 모드와 같은 CSP 를 건다. connect-src 'self' 라 바깥으로 못 나간다.
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [DEV_URL ? devCsp() : CSP],
      },
    })
  })

  // gh 로그인이 없으면 화면을 띄우기 전에 알린다.
  try {
    await loadToken()
  } catch (err) {
    console.error(`\n  ${err.message}\n`)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** 개발 중에는 Vite 의 HMR 소켓만 추가로 허용한다. 그 외는 운영과 동일. */
function devCsp() {
  return CSP.replace("connect-src 'self'", `connect-src 'self' ${DEV_URL} ws://127.0.0.1:*`).replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-inline'",
  )
}
