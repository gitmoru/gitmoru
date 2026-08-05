import { tr, useTr } from '../../i18n'
import type { Dict } from '../../i18n/locales/ko'
import { useRef, useState } from 'react'

/**
 * 시간대 고르기.
 *
 * 브라우저 기본 날짜 입력을 쓰지 않는다. 브라우저가 그리는 물건이라
 * 우리 도트 화면 위에서 혼자 튄다.
 *
 * 그리고 **끝 시각을 직접 치게 하지 않는다.**
 * 사고를 떠올릴 때 "3시 0분부터 4시 0분까지"라고 생각하는 사람은 없다.
 * "새벽 3시쯤부터 한 시간" 이라고 생각하니, 시작 시각 + 길이로 받는다.
 *
 * 값은 `YYYY-MM-DDTHH:mm` (한국시간) 으로 주고받는다.
 */

interface Props {
  since: string
  until: string
  onChange: (since: string, until: string) => void
  onFocus?: () => void
  onBlur?: () => void
}

/** 지금. 이 컴퓨터의 시간대 그대로 다룬다. */
function now(): Date {
  return new Date()
}

const p2 = (n: number) => String(n).padStart(2, '0')

function fmt(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** `YYYY-MM-DDTHH:mm` → Date (이 컴퓨터의 시간대로 해석) */
function parse(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
}

/** 자주 쓰는 구간 */
const PRESETS: Array<{ key: keyof Dict['timeRange']['presets']; make: () => [Date, number] }> = [
  {
    key: 'lastNight',
    make: () => {
      const a = now()
      a.setHours(0, 0, 0, 0)
      return [a, 7 * 60]
    },
  },
  {
    key: 'yesterdayNight',
    make: () => {
      const a = now()
      a.setDate(a.getDate() - 1)
      a.setHours(20, 0, 0, 0)
      return [a, 11 * 60]
    },
  },
  {
    key: 'last6h',
    make: () => [new Date(now().getTime() - 6 * 3600_000), 6 * 60],
  },
  {
    key: 'last24h',
    make: () => [new Date(now().getTime() - 24 * 3600_000), 24 * 60],
  },
]

/** 고른 구간을 사람이 읽는 문장으로 */
function describe(since: string, until: string): string {
  const t = tr().timeRange
  const a = parse(since)
  const b = parse(until)
  if (!a || !b) return t.notSet

  const mins = Math.round((b.getTime() - a.getTime()) / 60_000)
  const span =
    mins % 1440 === 0 && mins >= 1440
      ? t.days(mins / 1440)
      : mins % 60 === 0
        ? t.hours(mins / 60)
        : t.minutes(mins)

  const sameDay = a.toDateString() === b.toDateString()
  const head = t.startAt(a.getMonth() + 1, a.getDate(), p2(a.getHours()), p2(a.getMinutes()))
  return sameDay || mins <= 1440
    ? t.startFor(head, span)
    : t.startToEnd(head, b.getMonth() + 1, b.getDate())
}

/** 길이 후보 (분) */
const SPANS: Array<{ key: keyof Dict['timeRange']['spans']; m: number }> = [
  { key: 'min30', m: 30 },
  { key: 'hour1', m: 60 },
  { key: 'hour3', m: 180 },
  { key: 'hour6', m: 360 },
  { key: 'day1', m: 1440 },
]

export function TimeRange({ since, until, onChange, onFocus, onBlur }: Props) {
  const t = useTr()
  const [open, setOpen] = useState(false)
  const start = parse(since)
  const end = parse(until)
  const spanMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : 0

  const setStart = (v: string) => {
    const s = parse(v)
    if (!s) {
      onChange(v, until)
      return
    }
    // 길이를 유지한 채 시작만 옮긴다
    onChange(v, fmt(new Date(s.getTime() + Math.max(1, spanMin) * 60_000)))
  }

  const setSpan = (m: number) => {
    if (!start) return
    onChange(since, fmt(new Date(start.getTime() + m * 60_000)))
  }

  const applyPreset = (make: () => [Date, number]) => {
    const [a, m] = make()
    onChange(fmt(a), fmt(new Date(a.getTime() + m * 60_000)))
    setOpen(false) // 대부분 여기서 끝난다. 계속 펼쳐둘 이유가 없다.
  }

  const activePreset = PRESETS.find((x) => {
    const [a, m] = x.make()
    return fmt(a) === since && fmt(new Date(a.getTime() + m * 60_000)) === until
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="field flex w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[12px]">{describe(since, until)}</span>
        <span className="shrink-0 text-[10.5px] text-[var(--color-faint)]">{t.timeRange.change}</span>
      </button>
    )
  }

  return (
    <div className="px bg-[var(--color-ink)] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10.5px] text-[var(--color-faint)]">{t.timeRange.presetsLabel}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10.5px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          {t.common.collapse}
        </button>
      </div>

      {/* 2×2 로 고정해서 줄바꿈이 들쭉날쭉하지 않게 */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {PRESETS.map((x) => (
          <Pill key={x.key} on={activePreset?.key === x.key} onClick={() => applyPreset(x.make)}>
            {t.timeRange.presets[x.key]}
          </Pill>
        ))}
      </div>

      <p className="mb-2 text-[10.5px] text-[var(--color-faint)]">{t.timeRange.custom}</p>
      <StartRow value={since} onChange={setStart} onFocus={onFocus} onBlur={onBlur} />

      <div className="mt-2">
        <div className="mb-1.5 flex items-baseline gap-1.5">
          <span className="text-[11px] text-[var(--color-muted)]">{t.timeRange.forDuration}</span>
          {end && (
            <span className="font-mono text-[10.5px] text-[var(--color-faint)]">
              → {p2(end.getMonth() + 1)}-{p2(end.getDate())} {p2(end.getHours())}:
              {p2(end.getMinutes())} {t.timeRange.until}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SPANS.map((s) => (
            <Pill key={s.m} on={spanMin === s.m} onClick={() => setSpan(s.m)} small>
              {t.timeRange.spans[s.key]}
            </Pill>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 시작 시각 한 줄. 칸을 채우면 다음 칸으로 알아서 넘어간다. */
function StartRow({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string
  onChange: (v: string) => void
  onFocus?: () => void
  onBlur?: () => void
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const [datePart = '', timePart = ''] = value.split('T')
  const [y = '', mo = '', d = ''] = datePart.split('-')
  const [h = '', mi = ''] = timePart.split(':')

  const set = (next: Partial<{ y: string; mo: string; d: string; h: string; mi: string }>) => {
    const pad = (v: string, len: number) => v.padStart(len, '0').slice(-len)
    const Y = next.y ?? (y || String(now().getFullYear()))
    const MO = next.mo ?? (mo || '01')
    const D = next.d ?? (d || '01')
    const H = next.h ?? (h || '00')
    const MI = next.mi ?? (mi || '00')
    onChange(`${pad(Y, 4)}-${pad(MO, 2)}-${pad(D, 2)}T${pad(H, 2)}:${pad(MI, 2)}`)
  }

  /** 칸이 다 차면 다음 칸으로 */
  const advance = (i: number) => refs.current[i + 1]?.focus()

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[11px] text-[var(--color-muted)]">{tr().timeRange.from}</span>
      <div className="field flex items-center gap-0.5 px-2 py-1.5" onFocus={onFocus} onBlur={onBlur}>
        <Seg i={0} refs={refs} v={y} w={34} len={4} max={2999} hint="YYYY" onSet={(v) => set({ y: v })} onFull={advance} />
        <Sep>-</Sep>
        <Seg i={1} refs={refs} v={mo} w={20} len={2} max={12} hint="MM" onSet={(v) => set({ mo: v })} onFull={advance} />
        <Sep>-</Sep>
        <Seg i={2} refs={refs} v={d} w={20} len={2} max={31} hint="DD" onSet={(v) => set({ d: v })} onFull={advance} />
        <span className="w-2.5" />
        <Seg i={3} refs={refs} v={h} w={20} len={2} max={23} hint="HH" onSet={(v) => set({ h: v })} onFull={advance} />
        <Sep>:</Sep>
        <Seg i={4} refs={refs} v={mi} w={20} len={2} max={59} hint="mm" onSet={(v) => set({ mi: v })} onFull={advance} />
      </div>
    </div>
  )
}

function Sep({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--color-faint)]">{children}</span>
}

function Seg({
  i,
  refs,
  v,
  w,
  len,
  max,
  hint,
  onSet,
  onFull,
}: {
  i: number
  refs: React.RefObject<Array<HTMLInputElement | null>>
  v: string
  w: number
  len: number
  max: number
  hint: string
  onSet: (v: string) => void
  onFull: (i: number) => void
}) {
  const step = (delta: number) => {
    const cur = Number(v || 0)
    let next = cur + delta
    if (next > max) next = 0
    if (next < 0) next = max
    onSet(String(next))
  }

  return (
    <input
      ref={(el) => {
        refs.current[i] = el
      }}
      inputMode="numeric"
      value={v}
      style={{ width: w }}
      className="bg-transparent text-center font-mono text-[12.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)]"
      placeholder={hint}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, len)
        onSet(digits)
        // 다 채우면 다음 칸으로 - 탭을 누르게 만들면 손이 바쁘다
        if (digits.length === len) onFull(i)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          step(1)
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          step(-1)
        }
      }}
    />
  )
}

function Pill({
  on,
  onClick,
  small,
  children,
}: {
  on: boolean
  onClick: () => void
  small?: boolean
  children: React.ReactNode
}) {
  const c = on ? 'var(--color-moss)' : 'var(--color-edge)'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`text-[11px] hover:brightness-125 ${small ? 'px-2 py-1' : 'py-1.5'}`}
      style={{
        background: on ? 'var(--color-moss)' : 'transparent',
        color: on ? '#16241c' : 'var(--color-muted)',
        boxShadow: `0 -2px 0 ${c}, 0 2px 0 ${c}, -2px 0 0 ${c}, 2px 0 0 ${c}`,
      }}
    >
      {children}
    </button>
  )
}
