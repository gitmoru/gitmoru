import { tr, useTr } from '../../i18n'
import { useEffect, useRef } from 'react'

/**
 * 관제 콘솔 로그.
 *
 * 게임 느낌을 내는 장치이기도 하지만, 실제 역할이 있다.
 * **실패가 눈앞에서 흘러가게** 만드는 것이다.
 *
 * 조용히 삼켜진 실패가 "이상 없음"으로 둔갑하는 게 이 도구가 가장 경계하는 일이다
 * (SAFETY.md 0번, 10번). 로그에 WARN 이 흘러가면 사람이 알아챈다.
 */

export type LogLevel = 'boot' | 'scan' | 'diff' | 'sig' | 'warn'

export interface LogLine {
  id: number
  at: string
  level: LogLevel
  text: string
}

/**
 * 줄마다 붙는 표식.
 *
 * 글자 태그를 쓰지 않는다. `팜`, `띄네` 같은 건 라벨로 읽히지 않고,
 * 영어 대문자(SCAN, WARN)는 우리 톤이 아니다.
 * 색 도트 하나면 훑을 때 충분히 구분된다 - 내용은 문장이 말한다.
 *
 * 눈여겨볼 것(신호, 실패)만 도트를 키워서 스크롤 중에도 걸리게 한다.
 */
const LEVEL_STYLE: Record<LogLevel, { color: string; size: number }> = {
  boot: { color: 'var(--color-faint)', size: 3 },
  scan: { color: 'var(--color-moss)', size: 3 },
  diff: { color: 'var(--color-muted)', size: 3 },
  sig: { color: 'var(--color-apricot)', size: 5 },
  warn: { color: 'var(--color-sand)', size: 5 },
}

interface Props {
  lines: LogLine[]
  busy: boolean
}

export function ConsoleLog({ lines, busy }: Props) {
  const t = useTr()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  return (
    <div className="px-3 py-2.5 font-mono text-[10.5px] leading-[1.95]">
      {lines.length === 0 && <p className="text-[var(--color-muted)]">{t.console.empty}</p>}

      {lines.map((l) => {
        const s = LEVEL_STYLE[l.level]
        return (
          <div key={l.id} className="animate-log flex items-baseline gap-2">
            <span className="shrink-0 text-[var(--color-faint)]">{l.at}</span>
            <span
              className="shrink-0 self-center"
              style={{ width: s.size, height: s.size, background: s.color }}
            />
            <span
              className="min-w-0 break-all"
              style={{
                color:
                  l.level === 'warn' || l.level === 'sig'
                    ? 'var(--color-text)'
                    : 'var(--color-muted)',
              }}
            >
              {l.text}
            </span>
          </div>
        )
      })}

      {busy && (
        <div className="flex items-baseline gap-2">
          <span className="text-[var(--color-faint)]">{clock()}</span>
          <span
            className="shrink-0 self-center"
            style={{ width: 3, height: 3, background: 'var(--color-moss)' }}
          />
          <span className="caret text-[var(--color-moss)]">▌</span>
        </div>
      )}

      <div ref={endRef} />
    </div>
  )
}

export function clock(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}

let seq = 0
export function logLine(level: LogLevel, text: string): LogLine {
  return { id: ++seq, at: clock(), level, text }
}

/** 처음 켰을 때 흘러가는 부팅 로그. 실제로 확인한 것만 적는다. */
export const bootLines = () => tr().console.boot
