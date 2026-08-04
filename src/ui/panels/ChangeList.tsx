import { useTr } from '../../i18n'
import { growth } from '../../core/changes'
import { formatBytes } from '../../core/safeText'
import { verdictOf, verdictText } from '../../core/scan'
import type { BranchChanges, CaseFile, FileChange, Finding } from '../../core/types'

/**
 * 변경 목록 - 이 도구가 실제로 내놓는 답.
 *
 * "감염됐다"가 아니라 **"이 시간대에 이 파일들이 이렇게 바뀌었다"** 를 보여준다.
 * 신호가 붙은 것이 위로 오지만, **신호 없는 변경도 절대 목록에서 빠지지 않는다.**
 * 빠지게 만들면 우리 규칙이 놓친 공격을 사람도 못 보게 된다.
 */

const KIND_COLOR: Record<FileChange['kind'], string> = {
  added: 'var(--color-apricot)',
  modified: 'var(--color-moss)',
  removed: 'var(--color-muted)',
}

interface Props {
  caseFile: CaseFile | null
  onOpenFinding: (f: Finding) => void
}

export function ChangeList({ caseFile, onOpenFinding }: Props) {
  const t = useTr()
  if (!caseFile) {
    return <p className="px-3 py-3 text-[11px] text-[var(--color-muted)]">{t.changeList.empty}</p>
  }

  // 아무것도 안 나왔을 때야말로 말이 정확해야 한다.
  // "0건" 만 띄우면 사람은 그걸 "안전하다" 로 읽는다.
  if (caseFile.changes.length === 0) {
    const v = verdictText(caseFile)
    const worry = verdictOf(caseFile) !== 'no-changes'
    return (
      <div className="px-3 py-3">
        <div
          className="p-3"
          style={{
            background: 'var(--color-ink)',
            boxShadow: `0 -2px 0 ${worry ? 'var(--color-sand)' : 'var(--color-edge)'}, 0 2px 0 ${worry ? 'var(--color-sand)' : 'var(--color-edge)'}, -2px 0 0 ${worry ? 'var(--color-sand)' : 'var(--color-edge)'}, 2px 0 0 ${worry ? 'var(--color-sand)' : 'var(--color-edge)'}`,
          }}
        >
          <p
            className="mb-1.5 text-[12px] font-semibold"
            style={{ color: worry ? 'var(--color-sand)' : 'var(--color-text)' }}
          >
            {v.title}
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">{v.detail}</p>
        </div>
      </div>
    )
  }

  // 신호가 많이 붙은 브랜치부터
  const sorted = [...caseFile.changes].sort((a, b) => {
    const sig = (c: BranchChanges) => c.files.reduce((n, f) => n + f.signalIds.length, 0)
    return sig(b) - sig(a) || b.files.length - a.files.length
  })

  return (
    <div className="px-3 py-2">
      {sorted.map((c) => (
        <section key={`${c.repo}/${c.branch}`} className="mb-3">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-mono text-[11px] font-semibold">{c.branch}</span>
            <span className="truncate font-mono text-[10px] text-[var(--color-faint)]">
              {c.repo}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">
              {t.changeList.fileCount(c.files.length)}
            </span>
          </div>

          <ul className="space-y-0.5">
            {c.files.slice(0, 40).map((f) => {
              const kindColor = KIND_COLOR[f.kind]
              const kindText = t.changeList.kinds[f.kind]
              const ratio = growth(f)
              const finding = caseFile.findings.find((s) => f.signalIds.includes(s.id))
              const grew = f.kind === 'modified' && ratio >= 2

              return (
                <li key={f.path}>
                  <button
                    type="button"
                    disabled={!finding}
                    onClick={() => finding && onOpenFinding(finding)}
                    className="flex w-full items-center gap-2  px-1.5 py-1 text-left hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span
                      className="shrink-0 font-mono text-[9.5px]"
                      style={{ color: kindColor }}
                    >
                      {kindText}
                    </span>

                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[var(--color-text)]">
                      {f.path}
                    </span>

                    {grew && (
                      <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-apricot)]">
                        ×{Math.round(ratio)}
                      </span>
                    )}

                    <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-muted)]">
                      {f.sizeAfter !== undefined
                        ? formatBytes(f.sizeAfter)
                        : f.sizeBefore !== undefined
                          ? `−${formatBytes(f.sizeBefore)}`
                          : ''}
                    </span>

                    {/* 신호가 붙은 것만 표시. 없다고 안전하다는 뜻은 아니다 */}
                    <span
                      className="w-3 shrink-0 text-center text-[9.5px]"
                      style={{ color: 'var(--color-apricot)' }}
                      title={finding ? finding.title : t.changeList.noSignalHint}
                    >
                      {finding ? '●' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {c.files.length > 40 && (
            <p className="mt-1 px-1.5 text-[10px] text-[var(--color-sand)]">
              {t.changeList.folded(c.files.length - 40)}
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

/** 신호 목록 - 먼저 볼 것부터 */
export function SignalList({ caseFile, onOpenFinding }: Props) {
  const t = useTr()
  if (!caseFile || caseFile.findings.length === 0) {
    return (
      <p className="px-3 py-3 text-[11px] leading-relaxed text-[var(--color-muted)]">
        {caseFile ? t.changeList.noSignals : t.changeList.empty}
      </p>
    )
  }

  const order = { first: 0, soon: 1, later: 2 } as const
  const sorted = [...caseFile.findings].sort((a, b) => order[a.attention] - order[b.attention])

  return (
    <ul className="px-3 py-2">
      {sorted.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => onOpenFinding(f)}
            className="mb-1 w-full  px-1.5 py-1.5 text-left hover:bg-white/5"
          >
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 text-[9.5px]"
                style={{
                  color:
                    f.attention === 'first'
                      ? 'var(--color-apricot)'
                      : 'var(--color-sand)',
                }}
              >
                {t.changeList.attention[f.attention]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px]">{f.title}</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[9.5px] text-[var(--color-faint)]">
              {f.repo}
              {f.branch ? ` / ${f.branch}` : ''}
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}
