/**
 * 사건 기록을 디스크에 남긴다.
 *
 * 앱을 닫으면 조사한 내용이 사라지는 게 원래 문제였다. 그냥 불편한 정도가 아니라,
 * GitHub 활동 기록이 90일까지만 남아서 **나중에 다시 만들 방법이 없다.**
 * 새벽에 훑고 창을 닫으면 그걸로 끝이었다.
 *
 * SAFETY.md 8번이 케이스 파일(JSON)을 내보내도 되는 유일한 것으로 정해뒀다.
 * 여기에는 경로, 크기, 해시, 근거만 들어가고 **페이로드 원문은 안 들어간다.**
 * 그래서 이 파일을 디스크에 둬도 내 컴퓨터에 악성 코드를 남기는 게 아니다.
 *
 * 앱과 MCP 서버가 같은 폴더를 본다. Electron 의 userData 를 안 쓰는 이유가 이거다.
 * MCP 는 Electron 이 아니라 그 경로를 알아낼 수 없어서, 양쪽이 계산할 수 있는 곳에 둔다.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(homedir(), '.gitmoru', 'cases')

/**
 * 파일 이름이 될 값이라 우리가 만든 모양인지 반드시 확인한다.
 *
 * 이걸 안 하면 `../../` 같은 게 섞였을 때 엉뚱한 파일을 읽거나 지운다.
 * 지금은 우리 코드만 id 를 만들지만, 나중에 밖에서 들어올 자리라 여기서 막는다.
 */
const ID = /^case-[a-z0-9]{1,40}$/

/** 이만큼 넘으면 뭔가 잘못된 것이다. 케이스 파일은 요약이지 사본이 아니다. */
const MAX_BYTES = 64 * 1024 * 1024

export function casesDir() {
  return ROOT
}

function ensureDir() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true })
}

function pathOf(id) {
  if (!ID.test(String(id ?? ''))) throw new Error(`사건 번호 모양이 아니에요: ${id}`)
  return join(ROOT, `${id}.json`)
}

/**
 * 하나 저장한다. 같은 id 면 덮어쓴다.
 *
 * 훑기가 끝날 때마다 자동으로 부른다. 사고 한복판에서 저장 버튼을 기억하라고
 * 하는 건 안 되는 요구다.
 */
export function saveCase(caseFile) {
  const text = JSON.stringify(caseFile, null, 2)
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('사건 기록이 너무 큽니다. 페이로드가 섞여 들어갔는지 확인해주세요.')
  }
  ensureDir()
  const target = pathOf(caseFile?.id)
  writeFileSync(target, text, 'utf8')
  return target
}

/** 요약 한 줄. 목록에 필요한 것만 뽑는다. */
function summaryOf(caseFile) {
  return {
    id: caseFile.id,
    title: caseFile.title,
    createdAt: caseFile.createdAt,
    window: caseFile.window,
    scope: caseFile.scope,
    branches: caseFile.branches?.length ?? 0,
    changedFiles: (caseFile.changes ?? []).reduce((n, c) => n + (c.files?.length ?? 0), 0),
    findings: caseFile.findings?.length ?? 0,
    failures: caseFile.failures?.length ?? 0,
  }
}

/**
 * 저장된 것들을 최근 순으로.
 *
 * 못 읽은 파일을 조용히 빼지 않고 같이 돌려준다 (SAFETY.md 11번).
 * 목록에서 사라지면 사람은 그게 원래 없었다고 읽는다.
 */
export function listCases() {
  if (!existsSync(ROOT)) return { cases: [], unreadable: [] }

  const cases = []
  const unreadable = []

  for (const name of readdirSync(ROOT)) {
    if (!name.endsWith('.json')) continue
    try {
      cases.push(summaryOf(JSON.parse(readFileSync(join(ROOT, name), 'utf8'))))
    } catch {
      unreadable.push(name)
    }
  }

  cases.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { cases, unreadable }
}

/** 하나를 통째로 읽는다. 없으면 null. */
export function readCase(id) {
  const target = pathOf(id)
  if (!existsSync(target)) return null
  return JSON.parse(readFileSync(target, 'utf8'))
}

/**
 * 하나 지운다.
 *
 * 오래됐다고 우리가 알아서 지우지 않는다. 사고 기록을 도구가 임의로 없애면
 * 그게 곧 증거 인멸이고, 무엇이 사라졌는지도 아무도 모른다. 지우는 건 사람이 한다.
 */
export function deleteCase(id) {
  const target = pathOf(id)
  if (!existsSync(target)) return false
  rmSync(target)
  return true
}
