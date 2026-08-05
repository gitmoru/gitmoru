import { useEffect, useState } from 'react'

import type { GitHubClient } from '../../core/github'
import { diffLines } from '../../core/lineDiff'
import { collapseHiddenPadding, defang, formatBytes } from '../../core/safeText'
import { useTr } from '../../i18n'

/**
 * 공격 직전 파일과 지금 파일을 나란히 보여준다.
 *
 * 전체 내용만 보여주면 사람이 "원래 이랬을 것 같다" 를 머리로 맞춰봐야 한다.
 * 설정 파일처럼 원래도 낯선 코드가 있는 자리에서는 그 짐작이 자주 틀린다.
 * 우리는 공격 직전 커밋을 이미 알고 있으니, **무슨 줄이 새로 생겼는지** 를 바로 짚어준다.
 *
 * 그리면서 지키는 것 (SAFETY.md 7번):
 *   - 문자열을 그대로 텍스트 노드로만 그린다. HTML 로 해석하지 않는다
 *   - 페이로드 안의 주소는 눌리지 않게 무력화한다
 *   - 공백으로 밀어낸 코드는 접어서, 숨겨둔 꼬리가 제 줄을 갖게 한다
 *
 * **양을 줄이지는 않는다.** 에이전트에게 넘길 때는 토큰을 아끼려고 자르지만,
 * 여기는 사람이 읽는 자리다. 읽으려고 연 화면에서 내용을 잘라내면 안 된다.
 * 아래 상한은 전부 화면이 멈추는 걸 막는 용도이고, 실제 코드가 걸릴 일은 없다.
 */

/**
 * 한 줄이 이보다 길면 잘라서 보여준다.
 *
 * 읽을 양을 줄이려는 게 아니다. 화면은 길어도 스크롤하면 그만이고,
 * 공백으로 밀어낸 부분은 이미 접어서 넘어온다. 남은 건 진짜 코드라 자를 이유가 없다.
 *
 * 이 상한은 **한 줄짜리 번들** 하나를 위한 것이다. 압축된 js 는 파일 전체가 한 줄이라
 * 수백만 자가 될 수 있고, 그걸 그대로 그리면 줄바꿈 계산하다 화면이 멈춘다.
 * 그 경우만 막으면 되므로 넉넉하게 잡는다. 사람이 쓴 코드가 여기 걸릴 일은 없다.
 */
const MAX_LINE = 20_000

/**
 * 한 번에 그릴 줄 수.
 *
 * 이건 내용을 줄이는 게 아니라 나눠 그리는 것이다. 나머지는 버튼 한 번으로 다 보인다.
 * 줄 하나가 DOM 하나라, 수만 줄을 한꺼번에 그리면 여는 순간 멈춘다.
 */
const MAX_LINES = 500

type Loaded = {
  before: string
  after: string
  padding: number
}

export function DiffView({
  gh,
  repo,
  path,
  baseRef,
  headRef,
  kind,
  sizeAfter,
  autoLoad = false,
}: {
  gh: GitHubClient | null
  repo: string
  path: string
  baseRef: string
  headRef: string
  kind: 'added' | 'modified' | 'removed'
  sizeAfter?: number
  /** 열자마자 가져올지. 파일을 보려고 연 화면이면 한 번 더 누르게 할 이유가 없다. */
  autoLoad?: boolean
}) {
  const t = useTr()
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [expanded, setExpanded] = useState(false)

  const load = async () => {
    if (!gh) return
    setState('loading')
    try {
      const [before, after] = await Promise.all([
        kind === 'added' ? Promise.resolve('') : gh.getTextFile(repo, path, baseRef),
        kind === 'removed' ? Promise.resolve('') : gh.getTextFile(repo, path, headRef),
      ])
      if (before === null || after === null) {
        setState('failed')
        return
      }
      // 접는 것이 먼저다. 접기 전에 비교하면 숨겨둔 코드가 긴 줄 하나에 묻힌다.
      const foldedBefore = collapseHiddenPadding(before)
      const foldedAfter = collapseHiddenPadding(after)
      setLoaded({
        before: foldedBefore.display,
        after: foldedAfter.display,
        padding: foldedAfter.paddingFound,
      })
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  // 파일이 바뀌면 접힌 상태로 되돌린다. 앞 파일에서 펼쳐둔 게 따라오면 안 된다.
  useEffect(() => {
    setLoaded(null)
    setState('idle')
    setExpanded(false)
    if (autoLoad) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, path, baseRef, headRef])

  if (!loaded) {
    return (
      <div className="border border-[var(--color-edge)] bg-black/25 p-3">
        <p className="mb-2.5 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
          {t.diffView.intro}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={state === 'loading'}
          className="border border-[var(--color-edge)] px-2.5 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-40"
        >
          {state === 'loading' ? t.common.loading : t.diffView.open}
        </button>
        {state === 'failed' && (
          <p className="mt-2 text-[10.5px] text-[var(--color-sand)]">{t.diffView.failed}</p>
        )}
      </div>
    )
  }

  const diff = diffLines(loaded.before, loaded.after)
  const rows = [
    ...diff.removed.map((line) => ({ sign: '-' as const, line })),
    ...diff.added.map((line) => ({ sign: '+' as const, line })),
  ]
  const shown = expanded ? rows : rows.slice(0, MAX_LINES)

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 text-[10.5px]">
        <span className="truncate text-[var(--color-muted)]">
          {t.diffView.counts(diff.removed.length, diff.added.length, diff.startsAtLine)}
        </span>
        {sizeAfter !== undefined && (
          <span className="shrink-0 text-[var(--color-faint)]">{formatBytes(sizeAfter)}</span>
        )}
      </div>

      <p className="mb-2 font-mono text-[9.5px] text-[var(--color-faint)]">
        {baseRef.slice(0, 8)} → {headRef.slice(0, 8)}
      </p>

      {loaded.padding > 0 && (
        <p className="mb-2 bg-[var(--color-sand)]/10 p-2 text-[10.5px] leading-relaxed text-[var(--color-sand)]">
          {t.detail.padding(loaded.padding.toLocaleString())}
        </p>
      )}

      <div
        className="payload-text overflow-auto bg-black/40"
        style={{ maxHeight: autoLoad ? undefined : 384 }}
      >
        {shown.map((row, i) => (
          <div
            key={i}
            className="flex gap-2 px-2 py-px"
            style={{
              background:
                row.sign === '+'
                  ? 'color-mix(in srgb, var(--color-moss) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-clay) 12%, transparent)',
            }}
          >
            <span
              className="shrink-0 select-none"
              style={{ color: row.sign === '+' ? 'var(--color-moss)' : 'var(--color-clay)' }}
            >
              {row.sign}
            </span>
            {/* 문자열 그대로 텍스트 노드로만 그린다. 주소는 눌리지 않게 무력화한다. */}
            <span className="min-w-0 break-all whitespace-pre-wrap">
              {defang(
                row.line.length > MAX_LINE
                  ? `${row.line.slice(0, MAX_LINE)} ${t.diffView.longLine(row.line.length - MAX_LINE)}`
                  : row.line,
              )}
            </span>
          </div>
        ))}
      </div>

      {rows.length > MAX_LINES && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[10.5px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          {expanded ? t.common.collapse : t.diffView.showAll(rows.length - MAX_LINES)}
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-muted)]">
        {t.detail.textOnly}
      </p>
    </div>
  )
}
