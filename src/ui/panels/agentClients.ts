import type { Dict } from '../../i18n/locales/ko'

/**
 * 붙일 수 있는 도구 목록.
 *
 * 화면과 떼어놓는다. 도구가 하나 늘 때 손대는 곳이 여기 한 군데여야 하고,
 * 화면 코드는 목록이 몇 개든 그대로여야 한다.
 */

export type Client = {
  id: string
  name: string
  /** 터미널 한 줄로 끝나는지, 설정 파일을 고쳐야 하는지 */
  kind: 'cli' | 'file'
  /** 실제 경로를 아는 도구면 main 이 알려준 키 */
  pathKey?: string
  /** 경로가 프로젝트마다 달라서 고정할 수 없을 때. 설명은 화면에서 사전을 본다. */
  hasNoFixedPath?: boolean
  /** 붙여넣을 내용 */
  snippet: (path: string) => string
  /** 붙인 다음 뭘 껐다 켜야 하는지. 사전의 어느 문장인지만 가리킨다. */
  restart: keyof Dict['connect']['restart']
  /** 우리가 대신 실행해줄 수 있는지 */
  auto?: boolean
}

const json = (body: object) => JSON.stringify(body, null, 2)
const mcpServers = (p: string) => json({ mcpServers: { gitmoru: { command: 'npx', args: ['tsx', p] } } })

export const CLIENTS: Client[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'cli',
    auto: true,
    snippet: (p) => `claude mcp add gitmoru -- npx tsx ${p}`,
    restart: 'claudeCode',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    kind: 'file',
    pathKey: 'codex',
    snippet: (p) =>
      `[mcp_servers.gitmoru]\ncommand = "npx"\nargs = ["tsx", "${p.replace(/\\/g, '\\\\')}"]`,
    restart: 'codex',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'file',
    pathKey: 'gemini',
    snippet: mcpServers,
    restart: 'gemini',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    kind: 'file',
    pathKey: 'claude-desktop',
    snippet: mcpServers,
    restart: 'claudeDesktop',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    kind: 'file',
    pathKey: 'cursor',
    snippet: mcpServers,
    restart: 'cursor',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    kind: 'file',
    pathKey: 'windsurf',
    snippet: mcpServers,
    restart: 'windsurf',
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    kind: 'file',
    hasNoFixedPath: true,
    snippet: (p) => json({ servers: { gitmoru: { type: 'stdio', command: 'npx', args: ['tsx', p] } } }),
    restart: 'vscode',
  },
]
