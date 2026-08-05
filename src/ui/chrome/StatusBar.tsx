import { useTr } from '../../i18n'
import { reactMole } from '../scene/moleReactions'
import { useState } from 'react'
import { summarize } from '../../core/scan'
import { shareText } from '../../core/share'
import type { CaseFile } from '../../core/types'

/**
 * 맨 아래 상태 줄.
 *
 * 여기에 "이상 없음" 같은 결론은 쓰지 않는다.
 * 대신 **사람이 아직 안 읽은 변경이 몇 개인지**를 항상 띄운다.
 *
 * 버튼은 '요약 복사'가 먼저다. 결과를 본 다음 실제로 하는 일은
 * 파일을 내려받는 게 아니라 **팀에 알리는 것**이기 때문이다.
 */

interface Props {
  caseFile: CaseFile | null
  onExport: () => void
  onRestore: () => void
  error: string | null
}

export function StatusBar({ caseFile, onExport, onRestore, error }: Props) {
  const t = useTr()
  const [copied, setCopied] = useState(false)

  if (error) {
    return (
      <Bar>
        <span className="text-[11.5px] text-[var(--color-sand)]">{error}</span>
      </Bar>
    )
  }

  if (!caseFile) {
    return (
      <Bar>
        <span className="label">{t.statusBar.idle}</span>
      </Bar>
    )
  }

  const s = summarize(caseFile)

  const copy = async () => {
    await navigator.clipboard.writeText(shareText(caseFile))
    reactMole('copied')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Bar>
      <span className="shrink-0 font-medium">{caseFile.title}</span>
      <span className="label shrink-0">{t.statusBar.scope(caseFile.stats.reposScanned, s.total)}</span>

      {s.changedFiles > 0 && (
        <span className="truncate text-[var(--color-apricot)]">
          {t.statusBar.changedFiles(s.changedFiles, s.unreviewed)}
        </span>
      )}

      {s.forcedBranches > 0 && (
        <span className="shrink-0 text-[var(--color-apricot)]">
          {t.statusBar.forced(s.forcedBranches, s.droppedCommits)}
        </span>
      )}

      {!s.complete && (
        <span className="shrink-0 text-[var(--color-sand)]">{t.statusBar.failures(s.failures)}</span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {/* 기록용 파일. 자주 쓸 일이 아니라 글자로만 둔다. */}
        <button
          type="button"
          onClick={onExport}
          title={t.statusBar.exportHint}
          className="text-[10.5px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          {t.statusBar.exportLabel}
        </button>

        {s.changed > 0 && (
          <button
            type="button"
            onClick={onRestore}
            className="px-btn bg-[var(--color-apricot)] px-3 py-1 text-[11px] font-semibold text-[#241a10] hover:brightness-105"
          >
            {t.statusBar.restore}
          </button>
        )}

        <button
          type="button"
          onClick={copy}
          className="px-btn bg-[var(--color-moss)] px-3 py-1 text-[11px] font-semibold text-[#16241c] hover:brightness-105"
        >
          {copied ? t.common.copied : t.statusBar.copySummary}
        </button>
      </div>
    </Bar>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <footer className="flex h-9 shrink-0 items-center gap-4 border-t border-[var(--color-edge)] bg-[var(--color-slate)] px-3 text-[11.5px]">
      {children}
    </footer>
  )
}
