/**
 * 화면과 메인 프로세스 사이의 유일한 창구.
 *
 * 여기서 노출하는 것만 화면이 쓸 수 있다.
 * Node API, 파일 시스템, 셸은 절대 넘기지 않는다. GitHub 토큰도 넘기지 않는다.
 * 화면은 "이 경로로 요청해줘"라고 부탁만 할 수 있고, 실제 호출은 메인이 한다.
 *
 * CommonJS 인 이유 - 샌드박스(`sandbox: true`)가 켜진 preload 는 ESM 을 못 쓴다.
 * 샌드박스를 끄면 ESM 을 쓸 수 있지만, 그건 격리를 낮추는 거라 반대 방향이다.
 */

const { contextBridge, ipcRenderer } = require('electron')

/** 메인이 창을 만들 때 실어 보낸 값. 화면이 뜨기 전에 이미 여기 있다. */
const startupLocale =
  process.argv.find((a) => a.startsWith('--gitmoru-locale='))?.split('=')[1] || null

contextBridge.exposeInMainWorld('radar', {
  /** 데스크톱 앱으로 실행 중인지. 화면이 통신 방식을 고르는 데 쓴다. */
  isApp: true,

  /** 지난번에 고른 언어. 없으면 null 이고, 그때는 처음 실행이라 물어본다. */
  startupLocale,
  setLocale: (locale) => ipcRenderer.invoke('radar:set-locale', locale),

  /**
   * 사건 기록 보관. 훑고 나면 자동으로 저장되고, 다음에 열면 목록에 남아 있다.
   * 화면은 파일 시스템에 못 닿으니 여기로 부탁만 한다.
   */
  caseSave: (caseFile) => ipcRenderer.invoke('radar:case-save', caseFile),
  caseList: () => ipcRenderer.invoke('radar:case-list'),
  caseRead: (id) => ipcRenderer.invoke('radar:case-read', id),
  caseDelete: (id) => ipcRenderer.invoke('radar:case-delete', id),

  /** Claude 에 붙이기 - 상태 확인과 등록. */
  mcpStatus: () => ipcRenderer.invoke('radar:mcp-status'),
  mcpRegister: () => ipcRenderer.invoke('radar:mcp-register'),
  reveal: (target) => ipcRenderer.invoke('radar:reveal', target),

  /** 창 조작. 우리가 그린 버튼에서만 부른다. */
  win: (action) => ipcRenderer.invoke('radar:win', action),

  /** gh CLI 로 로그인된 계정 확인. 토큰 자체는 넘어오지 않는다. */
  whoami: () => ipcRenderer.invoke('radar:whoami'),

  /**
   * GitHub API 호출.
   * 목적지 고정과 쓰기 화이트리스트는 메인 프로세스가 강제한다.
   */
  gh: (req) =>
    ipcRenderer.invoke('radar:gh', {
      path: req && req.path,
      method: req && req.method,
      body: req && req.body,
      intent: req && req.intent,
    }),
})
