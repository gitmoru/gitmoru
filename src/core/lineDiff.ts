/**
 * 줄 단위 비교.
 *
 * 완전한 diff 알고리즘을 넣지 않는다. 이 도구가 보는 공격은 대개 **기존 파일 끝이나
 * 중간에 덩어리를 끼워 넣는** 모양이라, 앞뒤로 똑같은 부분을 걷어내면 남는 게 곧 그 덩어리다.
 *
 * 정확한 LCS 를 돌리면 큰 파일에서 느려지고, 여기서 얻는 이득이 없다.
 * 우리가 답해야 할 질문은 "무슨 줄이 새로 생겼나" 하나뿐이다.
 */

export interface LineDiff {
  /** 앞쪽에서 그대로인 줄 수 */
  commonHead: number
  /** 뒤쪽에서 그대로인 줄 수 */
  commonTail: number
  /** 사라진 줄 */
  removed: string[]
  /** 새로 생긴 줄 */
  added: string[]
  /** 바뀐 부분이 원본 몇 번째 줄부터인지 (1부터 셈) */
  startsAtLine: number
}

export function diffLines(before: string, after: string): LineDiff {
  const a = before.split('\n')
  const b = after.split('\n')

  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++

  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++
  }

  return {
    commonHead: head,
    commonTail: tail,
    removed: a.slice(head, a.length - tail),
    added: b.slice(head, b.length - tail),
    startsAtLine: head + 1,
  }
}

/**
 * 바뀐 부분만 골라 글로 만든다.
 *
 * 아주 긴 한 줄은 잘라서 준다. 공백 수천 자 뒤에 코드를 숨기는 수법이 있어서,
 * 원문을 그대로 흘리면 받는 쪽이 그 공백을 읽느라 예산을 다 쓴다 (SAFETY.md 7번).
 */
export function renderDiff(
  diff: LineDiff,
  longLine: (n: number) => string,
  maxLineChars = 400,
): string {
  const clip = (line: string) =>
    line.length <= maxLineChars
      ? line
      : `${line.slice(0, maxLineChars)} ${longLine(line.length - maxLineChars)}`

  const out: string[] = []
  for (const line of diff.removed) out.push(`- ${clip(line)}`)
  for (const line of diff.added) out.push(`+ ${clip(line)}`)
  return out.join('\n')
}
