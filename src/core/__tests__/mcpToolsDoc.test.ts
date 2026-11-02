import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
  에이전트는 이 문서를 읽고 도구를 고른다. 문서가 뒤처지면 있는 도구를 못 쓴다.

  실제로 뒤처진 적이 있다. 도구를 세 개 더하는 동안 영어 README 와 연결 안내의
  목록은 그대로여서, 영어로 읽은 사람은 `open_case` 가 있는지도 몰랐다.
*/
const TOOLS_DIR = join(process.cwd(), 'src/mcp/tools')
const DOC = join(process.cwd(), 'docs/guides/mcp-tools.md')

function registeredTools(): string[] {
  return readdirSync(TOOLS_DIR).flatMap((file) => {
    const source = readFileSync(join(TOOLS_DIR, file), 'utf8')
    return [...source.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((match) => match[1] ?? '')
  })
}

/** 도구 하나의 입력 칸 이름을 소스에서 뽑는다. 들여쓰기 8칸이 inputSchema 의 바로 아래다 */
function inputsOf(tool: string): string[] {
  for (const file of readdirSync(TOOLS_DIR)) {
    // 윈도우에서 받은 소스는 줄끝이 CRLF 라, 그대로 두면 아래 정규식이 조용히 아무것도 못 찾는다
    const source = readFileSync(join(TOOLS_DIR, file), 'utf8').replace(/\r/g, '')
    const start = source.indexOf(`'${tool}',`)
    if (start < 0) continue
    const schema = source.slice(start).match(/inputSchema: \{([\s\S]*?)\n\s*\},?\n\s*\},/)
    const body = schema?.[1] ?? ''
    if (!body.includes('\n')) return [...body.matchAll(/(\w+): z\./g)].map((match) => match[1] ?? '')
    return [...body.matchAll(/^ {8}(\w+): z/gm)].map((match) => match[1] ?? '')
  }
  return []
}

describe('MCP 도구 레퍼런스', () => {
  const doc = readFileSync(DOC, 'utf8').replace(/\r/g, '')

  it('등록된 도구를 전부 다룬다', () => {
    const tools = registeredTools()
    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) expect(doc).toContain(`### \`${tool}\``)
  })

  it('없는 도구를 적지 않는다', () => {
    const documented = [...doc.matchAll(/^### `([a-z_]+)`/gm)].map((match) => match[1])
    expect(documented.sort()).toEqual(registeredTools().sort())
  })

  it('도구마다 입력 칸을 빠뜨리지 않는다', () => {
    for (const tool of registeredTools()) {
      const section = doc.split(`### \`${tool}\``)[1]?.split(/^##/m)[0] ?? ''
      for (const input of inputsOf(tool)) expect(section, `${tool}.${input}`).toContain(`\`${input}\``)
    }
  })
})
