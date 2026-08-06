import { useState } from 'react'

import { useTr } from '../../i18n'
import { titleOf } from '../../core/findingText'
import { growth } from '../../core/changes'
import { roleOf } from '../../core/fileRole'
import { formatBytes } from '../../core/safeText'
import { verdictOf, verdictText } from '../../core/scan'
import type { BranchChanges, CaseFile, FileChange, FileTarget, Finding } from '../../core/types'

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

interface ListProps extends Props {
  /** 신호가 없는 파일도 열 수 있어야 한다 */
  onOpenFile: (target: FileTarget) => void
}

export function ChangeList({ caseFile, onOpenFile }: ListProps) {
  const t = useTr()
  /*
    브랜치를 처음에는 접어둔다.

    브랜치 스무 개에 파일이 이백 개씩 달리는 게 흔한데, 다 펼쳐 놓으면
    어느 브랜치가 어디까지인지가 안 읽힌다. 먼저 "어느 브랜치가 몇 개" 를 보고
    들어갈 곳을 고르는 게 순서다.
  */
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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

  const workflows = caseFile.changes.flatMap((c) =>
    c.files.filter((f) => roleOf(f.path) === 'workflow').map((f) => ({ change: c, file: f })),
  )

  return (
    <div className="px-3 py-2">
      {/*
        CI 정의는 맨 위에 따로 올린다. 임계값이 없는 사실이라 매번 보여줘도 소음이 아니고,
        자체 호스팅 러너를 쓰는 곳에서는 이 파일 한 줄이 곧 그 서버의 셸이다.
      */}
      {workflows.length > 0 && (
        <div className="mb-3 p-2.5" style={{ background: 'var(--color-apricot)/10' }}>
          <p className="text-[11px] text-[var(--color-apricot)]">
            {t.role.workflowChanged(workflows.length)}
          </p>
          <p className="mt-1 mb-1.5 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
            {t.role.workflowNote}
          </p>
          {workflows.slice(0, 6).map(({ change, file }) => (
            <button
              key={`${change.branch}/${file.path}`}
              type="button"
              onClick={() =>
                onOpenFile({
                  repo: change.repo,
                  branch: change.branch,
                  path: file.path,
                  kind: file.kind,
                  baseSha: change.baseSha,
                  headSha: change.headSha,
                  sizeAfter: file.sizeAfter,
                })
              }
              className="block w-full truncate px-1 py-0.5 text-left font-mono text-[10px] text-[var(--color-text)] hover:bg-white/5"
            >
              {change.branch} :: {file.path}
            </button>
          ))}
        </div>
      )}

      {sorted.map((c) => {
        const key = `${c.repo}/${c.branch}`
        const expanded = open.has(key) || sorted.length === 1
        const signals = c.files.reduce((n, f) => n + f.signalIds.length, 0)

        return (
        <section key={key} className="mb-3">
          <button
            type="button"
            onClick={() => toggle(key)}
            className="mb-1 flex w-full items-baseline gap-2 py-0.5 text-left hover:bg-white/5"
          >
            <span className="shrink-0 select-none text-[9px] text-[var(--color-faint)]">
              {expanded ? '▼' : '▶'}
            </span>
            <span className="font-mono text-[11px] font-semibold">{c.branch}</span>
            <span className="truncate font-mono text-[10px] text-[var(--color-faint)]">
              {c.repo}
            </span>
            {signals > 0 && (
              <span className="shrink-0 text-[9.5px] text-[var(--color-apricot)]">●</span>
            )}
            <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">
              {t.changeList.fileCount(c.files.length)}
            </span>
          </button>

          {expanded && (
          <ul className="space-y-0.5">
            {c.files.slice(0, 40).map((f) => {
              const kindColor = KIND_COLOR[f.kind]
              const kindText = t.changeList.kinds[f.kind]
              const ratio = growth(f)
              const finding = caseFile.findings.find((s) => f.signalIds.includes(s.id))
              const grew = f.kind === 'modified' && ratio >= 2
              const role = roleOf(f.path)

              return (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenFile({
                        repo: c.repo,
                        branch: c.branch,
                        path: f.path,
                        kind: f.kind,
                        baseSha: c.baseSha,
                        headSha: c.headSha,
                        sizeAfter: f.sizeAfter,
                      })
                    }
                    className="flex w-full items-center gap-2  px-1.5 py-1 text-left hover:bg-white/5"
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

                    {/* 자동으로 실행되는 자리면 표시한다. 위험하다는 뜻이 아니라 성격이다. */}
                    {role && (
                      <span
                        className="shrink-0 text-[9px]"
                        style={{ color: 'var(--color-sand)' }}
                        title={t.role.autoRunTag}
                      >
                        {t.role[role]}
                      </span>
                    )}

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
                      title={finding ? titleOf(finding) : t.changeList.noSignalHint}
                    >
                      {finding ? '●' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          )}

          {expanded && c.files.length > 40 && (
            <p className="mt-1 px-1.5 text-[10px] text-[var(--color-sand)]">
              {t.changeList.folded(c.files.length - 40)}
            </p>
          )}
        </section>
        )
      })}
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
              <span className="min-w-0 flex-1 truncate text-[11px]">{titleOf(f)}</span>
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
