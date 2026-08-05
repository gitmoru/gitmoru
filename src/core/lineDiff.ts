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

/**
 * 글을 줄로 나눈다.
 *
 * 빈 문자열은 **0줄**이다. 그냥 `split` 하면 `['']` 이 나와서, 새로 생긴 파일이
 * "빈 줄 하나가 사라졌다" 로 보인다. 없던 파일에서 사라질 줄은 없다.
 */
const toLines = (text: string) => (text === '' ? [] : text.split('\n'))

export function diffLines(before: string, after: string): LineDiff {
  const a = toLines(before)
  const b = toLines(after)

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
 * 화면에 그릴 한 줄.
 *
 * `skipped` 는 접어둔 구간이다. 몇 줄을 건너뛰었는지 알려주지 않으면
 * 사람은 그 사이에 뭐가 있었는지 몰라서 결과를 못 믿는다.
 */
export type DiffRow =
  | { kind: 'context'; before: number; after: number; text: string }
  | { kind: 'removed'; before: number; text: string }
  | { kind: 'added'; after: number; text: string }
  | { kind: 'skipped'; count: number }

/**
 * 문맥을 붙인 줄 목록.
 *
 * 바뀐 줄만 떼어놓으면 그게 어디에 끼워진 건지 알 수가 없다.
 * `if` 안인지 파일 끝인지에 따라 같은 코드도 뜻이 달라진다.
 * 그래서 앞뒤 몇 줄을 같이 보여주고, 그 바깥은 몇 줄인지만 적어서 접는다.
 *
 * `context` 를 `Infinity` 로 주면 파일 전체가 나온다. 접힌 데 뭐가 있었는지
 * 의심스러울 때 통째로 펼쳐볼 수 있어야 한다.
 */
export function unifiedRows(before: string, after: string, context = 3): DiffRow[] {
  const a = toLines(before)
  const b = toLines(after)
  const diff = diffLines(before, after)
  const { commonHead: head, commonTail: tail } = diff

  const rows: DiffRow[] = []

  // 앞쪽 문맥
  const headFrom = Math.max(0, head - context)
  if (headFrom > 0) rows.push({ kind: 'skipped', count: headFrom })
  for (let i = headFrom; i < head; i++) {
    rows.push({ kind: 'context', before: i + 1, after: i + 1, text: a[i]! })
  }

  // 바뀐 부분. 사라진 줄을 먼저 보여야 "무엇이 무엇으로" 가 순서대로 읽힌다.
  diff.removed.forEach((text, i) => rows.push({ kind: 'removed', before: head + i + 1, text }))
  diff.added.forEach((text, i) => rows.push({ kind: 'added', after: head + i + 1, text }))

  // 뒤쪽 문맥
  const tailShown = Math.min(context, tail)
  for (let i = 0; i < tailShown; i++) {
    const ai = a.length - tail + i
    const bi = b.length - tail + i
    rows.push({ kind: 'context', before: ai + 1, after: bi + 1, text: a[ai]! })
  }
  if (tail > tailShown) rows.push({ kind: 'skipped', count: tail - tailShown })

  return rows
}

/** 나란히 볼 때의 한 줄. 왼쪽이 이전, 오른쪽이 지금이다. */
export type SplitRow =
  | {
      kind: 'context' | 'changed'
      left: { line: number; text: string }
      right: { line: number; text: string }
    }
  | { kind: 'removed'; left: { line: number; text: string } }
  | { kind: 'added'; right: { line: number; text: string } }
  | { kind: 'skipped'; count: number }

/**
 * 왼쪽 이전, 오른쪽 지금으로 짝지은 줄 목록.
 *
 * 위아래로 늘어놓으면 사라진 줄 다섯 개를 다 읽고 나서 새로 생긴 줄 다섯 개를 읽게 된다.
 * 그러면 무엇이 무엇으로 바뀌었는지를 사람이 머릿속에서 맞춰야 한다.
 * 나란히 두면 같은 자리끼리 눈으로 바로 비교된다.
 *
 * 짝은 순서대로 맞춘다. 우리 비교는 앞뒤 공통 부분을 걷어낸 덩어리 하나라,
 * 그 안에서 첫 줄끼리 둘째 줄끼리 놓는 게 대개 맞다. 수가 안 맞으면 남는 쪽만 한쪽에 둔다.
 */
export function splitRows(before: string, after: string, context = 3): SplitRow[] {
  const a = toLines(before)
  const b = toLines(after)
  const diff = diffLines(before, after)
  const { commonHead: head, commonTail: tail } = diff

  const rows: SplitRow[] = []

  const headFrom = Math.max(0, head - context)
  if (headFrom > 0) rows.push({ kind: 'skipped', count: headFrom })
  for (let i = headFrom; i < head; i++) {
    rows.push({
      kind: 'context',
      left: { line: i + 1, text: a[i]! },
      right: { line: i + 1, text: a[i]! },
    })
  }

  const pairs = Math.max(diff.removed.length, diff.added.length)
  for (let i = 0; i < pairs; i++) {
    const gone = diff.removed[i]
    const born = diff.added[i]
    if (gone !== undefined && born !== undefined) {
      rows.push({
        kind: 'changed',
        left: { line: head + i + 1, text: gone },
        right: { line: head + i + 1, text: born },
      })
    } else if (gone !== undefined) {
      rows.push({ kind: 'removed', left: { line: head + i + 1, text: gone } })
    } else if (born !== undefined) {
      rows.push({ kind: 'added', right: { line: head + i + 1, text: born } })
    }
  }

  const tailShown = Math.min(context, tail)
  for (let i = 0; i < tailShown; i++) {
    const ai = a.length - tail + i
    const bi = b.length - tail + i
    rows.push({
      kind: 'context',
      left: { line: ai + 1, text: a[ai]! },
      right: { line: bi + 1, text: b[bi]! },
    })
  }
  if (tail > tailShown) rows.push({ kind: 'skipped', count: tail - tailShown })

  return rows
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
