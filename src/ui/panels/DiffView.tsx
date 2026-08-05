import { useEffect, useState } from 'react'

import type { GitHubClient } from '../../core/github'
import { diffLines, unifiedRows, type DiffRow } from '../../core/lineDiff'
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
 * 여기는 사람이 읽는 자리다. 아래 상한은 전부 화면이 멈추는 걸 막는 용도다.
 */

/**
 * 한 줄이 이보다 길면 잘라서 보여준다.
 *
 * 압축된 js 는 파일 전체가 한 줄이라 수백만 자가 될 수 있고, 그대로 그리면
 * 줄바꿈 계산하다 화면이 멈춘다. 그 경우만 막으면 되므로 넉넉하게 잡는다.
 */
const MAX_LINE = 20_000

/** 한 번에 그릴 줄 수. 내용을 줄이는 게 아니라 나눠 그리는 것이다. */
const MAX_ROWS = 500

/** 바뀐 줄 앞뒤로 같이 보여줄 줄 수 */
const CONTEXT = 3

type Loaded = { before: string; after: string; padding: number }

const TONE = {
  added: 'var(--color-moss)',
  removed: 'var(--color-clay)',
  context: 'var(--color-faint)',
} as const

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
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(false)
  /** 긴 줄을 접을지 가로로 흘릴지. 코드는 접으면 들여쓰기가 무너져서 읽기 어렵다. */
  const [wrap, setWrap] = useState(true)

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

  // 파일이 바뀌면 처음 상태로 되돌린다. 앞 파일에서 펼쳐둔 게 따라오면 안 된다.
  useEffect(() => {
    setLoaded(null)
    setState('idle')
    setShowAll(false)
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
  const rows = unifiedRows(loaded.before, loaded.after, showAll ? Infinity : CONTEXT)
  const shown = expanded ? rows : rows.slice(0, MAX_ROWS)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10.5px]">
        <span className="font-mono" style={{ color: TONE.added }}>
          +{diff.added.length}
        </span>
        <span className="font-mono" style={{ color: TONE.removed }}>
          −{diff.removed.length}
        </span>
        <span className="font-mono text-[9.5px] text-[var(--color-faint)]">
          {baseRef.slice(0, 8)} → {headRef.slice(0, 8)}
        </span>
        {sizeAfter !== undefined && (
          <span className="text-[var(--color-faint)]">{formatBytes(sizeAfter)}</span>
        )}

        <span className="ml-auto flex shrink-0 gap-2">
          <Toggle on={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? t.diffView.onlyChanged : t.diffView.wholeFile}
          </Toggle>
          <Toggle on={!wrap} onClick={() => setWrap((v) => !v)}>
            {t.diffView.noWrap}
          </Toggle>
        </span>
      </div>

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
          <Row key={i} row={row} wrap={wrap} skipped={t.diffView.skipped} longLine={t.diffView.longLine} />
        ))}
      </div>

      {rows.length > MAX_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[10.5px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          {expanded ? t.common.collapse : t.diffView.showRest(rows.length - MAX_ROWS)}
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-muted)]">
        {t.detail.textOnly}
      </p>
    </div>
  )
}

/** 한 줄. 줄 번호 두 칸(이전/지금)을 앞에 붙인다. */
function Row({
  row,
  wrap,
  skipped,
  longLine,
}: {
  row: DiffRow
  wrap: boolean
  skipped: (n: number) => string
  longLine: (n: number) => string
}) {
  if (row.kind === 'skipped') {
    return (
      <div className="border-y border-[var(--color-edge-soft)] bg-black/20 px-2 py-1 text-[10px] text-[var(--color-faint)]">
        {skipped(row.count)}
      </div>
    )
  }

  const sign = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '
  const tone = TONE[row.kind]
  const tint =
    row.kind === 'context' ? undefined : `color-mix(in srgb, ${tone} 12%, transparent)`

  return (
    <div className="flex gap-2 px-2 py-px" style={{ background: tint }}>
      {/* 줄 번호. 지워진 줄은 이전 쪽에만, 생긴 줄은 지금 쪽에만 번호가 있다. */}
      <span className="w-9 shrink-0 select-none text-right text-[var(--color-faint)]">
        {row.kind === 'added' ? '' : row.before}
      </span>
      <span className="w-9 shrink-0 select-none text-right text-[var(--color-faint)]">
        {row.kind === 'removed' ? '' : row.after}
      </span>
      <span className="shrink-0 select-none" style={{ color: tone }}>
        {sign}
      </span>

      {/* 문자열 그대로 텍스트 노드로만 그린다. 주소는 눌리지 않게 무력화한다. */}
      <span
        className={`min-w-0 ${wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre'}`}
        style={{ color: row.kind === 'context' ? 'var(--color-muted)' : undefined }}
      >
        {defang(
          row.text.length > MAX_LINE
            ? `${row.text.slice(0, MAX_LINE)} ${longLine(row.text.length - MAX_LINE)}`
            : row.text,
        )}
      </span>
    </div>
  )
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-1.5 py-0.5 text-[10px] hover:brightness-125"
      style={{
        color: on ? 'var(--color-moss)' : 'var(--color-faint)',
        boxShadow: `inset 0 0 0 1px ${on ? 'var(--color-moss)' : 'var(--color-edge)'}`,
      }}
    >
      {children}
    </button>
  )
}
