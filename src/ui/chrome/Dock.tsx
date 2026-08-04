import { useTr } from '../../i18n'
import { reactMole, type MoleEvent } from '../scene/moleReactions'
import { useState } from 'react'
import type { CaseFile, Finding } from '../../core/types'
import { ChangeList, SignalList } from '../panels/ChangeList'
import { ConsoleLog, type LogLine } from './ConsoleLog'

/**
 * 왼쪽 아래 도크.
 *
 * 원본 사이트의 "활동 로그 / 출몰 제보 / 웹 감시" 탭 구조를 가져왔다.
 * 다만 탭 순서에 의도가 있다 - **변경 목록이 가운데가 아니라 기본값**이다.
 *
 * 이 도구의 답은 신호가 아니라 변경 목록이기 때문이다.
 * 신호 탭을 먼저 보게 만들면 "신호 없음 = 안전"이라는 착각을 부추기게 된다.
 */

type Tab = 'changes' | 'signals' | 'log'

interface Props {
  caseFile: CaseFile | null
  log: LogLine[]
  busy: boolean
  onOpenFinding: (f: Finding) => void
}

export function Dock({ caseFile, log, busy, onOpenFinding }: Props) {
  const t = useTr()
  const [tab, setTab] = useState<Tab>('changes')

  const changedFiles = caseFile?.changes.reduce((n, c) => n + c.files.length, 0) ?? 0
  const signals = caseFile?.findings.length ?? 0

  /** 탭마다 모루가 하는 말이 다르다. 무엇을 보고 있는지 옆에서 같이 읽어주는 느낌으로. */
  const SAY: Record<Tab, MoleEvent> = {
    changes: 'tabChanges',
    signals: 'tabSignals',
    log: 'tabLog',
  }

  const TABS: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'changes', label: t.dock.changes, count: changedFiles },
    { id: 'signals', label: t.dock.signals, count: signals },
    { id: 'log', label: t.dock.log, count: log.length },
  ]

  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-[var(--color-slate)]">
      <nav className="flex shrink-0 border-b border-[var(--color-edge)]">
        {TABS.map((item) => {
          const on = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id)
                if (item.id !== tab) reactMole(SAY[item.id])
              }}
              className="relative flex items-center gap-1.5 px-3 py-2 transition"
              style={{ color: on ? 'var(--color-moss)' : 'var(--color-muted)' }}
            >
              <span className="text-[11.5px]">{item.label}</span>
              <span className="font-mono text-[9.5px] opacity-70">{item.count}</span>
              {on && (
                <span className="absolute inset-x-2 bottom-0 h-px bg-[var(--color-moss)]" />
              )}
            </button>
          )
        })}

        {busy && (
          <span className="caret ml-auto self-center px-3 text-[10px] text-[var(--color-moss)]">
            █
          </span>
        )}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'changes' && <ChangeList caseFile={caseFile} onOpenFinding={onOpenFinding} />}
        {tab === 'signals' && <SignalList caseFile={caseFile} onOpenFinding={onOpenFinding} />}
        {tab === 'log' && <ConsoleLog lines={log} busy={busy} />}
      </div>
    </div>
  )
}
