/**
 * 워크플로 파일이 실제로 무엇을 열어두는지 읽는다.
 *
 * 경로로 "여기는 자동 실행되는 자리" 까지는 이미 표시하고 있었다. 그런데 정작
 * **파일 안을 안 봤다.** 잘 알려진 구멍 셋이 전부 그 안에 있다.
 *
 * 판정하지 않는다. 여기 걸리는 모양을 정당하게 쓰는 곳도 있다.
 * 우리가 말하는 건 "이 시간대에 이게 생겼다" 까지다.
 *
 * **YAML 로 파싱하지 않는다.** 줄 단위로 읽는다. 공격자가 쓴 파일을 라이브러리에
 * 넣는 결정은 그 자체로 따로 따져야 하는 일이고, `uses:` 도 이미 같은 방식으로 읽는다.
 * 대신 진짜 파서라면 잡을 것을 여기서는 놓친다. 여러 줄로 흩어 쓰거나 앵커를 쓰면 안 보인다.
 */

/** 워크플로가 열어두는 자리 */
export type WorkflowRisk =
  /**
   * 남의 PR 코드가 비밀에 닿는 자리.
   *
   * `pull_request_target` 은 **대상 저장소의 권한과 비밀을 들고** 돈다.
   * 거기서 PR 쪽 코드를 체크아웃하면 남이 쓴 코드가 그 권한으로 실행된다.
   */
  | 'pr-target-checkout'
  /**
   * PR 제목이 명령이 되는 자리.
   *
   * `${{ github.event.* }}` 는 셸이 돌기 전에 그 자리에 글자로 박힌다.
   * 제목에 명령을 적어 보내면 그대로 실행된다.
   */
  | 'event-in-run'
  /** 토큰이 필요 이상으로 넓은 자리 */
  | 'write-all'

const has = (text: string, re: RegExp) => re.test(text)

/** `on:` 에 pull_request_target 이 있는가 */
const PR_TARGET = /^\s*(?:-\s*)?pull_request_target\s*:?\s*$/m

/** 체크아웃이 PR 쪽을 가리키는가 */
const HEAD_REF = /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\./

/** `permissions: write-all` */
const WRITE_ALL = /^\s*permissions:\s*write-all\s*$/m

/**
 * `run:` 블록 안에서 `github.event.*` 를 쓰는가.
 *
 * `github.event_name` 은 아니다. 그건 값이 정해져 있어서 넣을 자리가 없다.
 * 그래서 뒤에 점이 오는 것만 본다.
 *
 * 들여쓰기로 블록 끝을 가늠한다. YAML 을 안 읽으니 이게 우리가 할 수 있는 최선이고,
 * 흩어 쓴 것은 못 잡는다.
 */
function eventInRun(text: string): boolean {
  const lines = text.split('\n')
  let runIndent: number | null = null

  for (const line of lines) {
    const indent = line.length - line.trimStart().length

    if (runIndent !== null) {
      // 덜 들여쓴 줄이 나오면 블록이 끝난 것이다. 빈 줄은 블록 안일 수 있어서 넘긴다.
      if (line.trim() !== '' && indent <= runIndent) runIndent = null
      else if (/\$\{\{\s*github\.event\./.test(line)) return true
    }

    if (runIndent === null && /^\s*(?:-\s*)?run:\s*[|>]/.test(line)) {
      runIndent = indent
      continue
    }

    // 한 줄짜리 `run: echo ...` 도 있다
    if (/^\s*(?:-\s*)?run:\s*[^|>\s]/.test(line) && /\$\{\{\s*github\.event\./.test(line)) {
      return true
    }
  }

  return false
}

/** 이 글에서 열려 있는 자리들 */
export function readWorkflowRisks(text: string): WorkflowRisk[] {
  const out: WorkflowRisk[] = []

  // 두 조건이 같이 있어야 의미가 있다. 트리거만으로는 남의 코드가 안 돈다.
  if (has(text, PR_TARGET) && has(text, HEAD_REF)) out.push('pr-target-checkout')
  if (eventInRun(text)) out.push('event-in-run')
  if (has(text, WRITE_ALL)) out.push('write-all')

  return out
}

/**
 * 이 시간대에 **새로 생긴** 것만 골라낸다.
 *
 * 지금 열려 있는 걸 전부 올리면 몇 년째 그랬던 저장소에서도 뜨고,
 * 우리가 물어본 시간대 밖의 이야기가 된다. 그건 이 도구가 하는 말이 아니다.
 */
export function newWorkflowRisks(before: WorkflowRisk[], after: WorkflowRisk[]): WorkflowRisk[] {
  const had = new Set(before)
  return after.filter((r) => !had.has(r))
}
