import { useEffect, useState } from 'react'

import type { CaseFile, CaseSummary } from '../../core/types'
import { utcToZoned, localZone } from '../../core/time'
import { deleteCaseFile, listCaseFiles, readCaseFile } from '../../platform/bridge'
import { useTr } from '../../i18n'
import { Modal } from '../chrome/Modal'
import { useViewport } from '../hooks/useViewport'

/**
 * 지난 기록.
 *
 * 예전에는 창을 닫으면 조사한 게 전부 사라졌다. 그게 그냥 불편한 정도가 아니었던 건,
 * GitHub 활동 기록이 90일까지만 남아서 **나중에 다시 만들 방법이 없기 때문**이다.
 * 새벽에 훑고 노트북을 덮으면 그걸로 끝이었다.
 *
 * 목록에 실패 건수를 같이 띄운다. 여기서부터 완전하지 않은 조사가 보여야,
 * 몇 달 뒤에 열어본 사람이 그걸 "그때 다 봤구나" 로 읽지 않는다 (SAFETY.md 11번).
 */
export function CaseHistory({
  onOpen,
  onClose,
}: {
  onOpen: (caseFile: CaseFile) => void
  onClose: () => void
}) {
  const t = useTr()
  const view = useViewport()
  const zone = localZone()
  const [listing, setListing] = useState<{ cases: CaseSummary[]; unreadable: string[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    listCaseFiles()
      .then(setListing)
      .catch(() => setListing({ cases: [], unreadable: [] }))
  }, [])

  const open = async (id: string) => {
    setBusy(id)
    try {
      const caseFile = await readCaseFile(id)
      if (caseFile) onOpen(caseFile)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    await deleteCaseFile(id)
    setListing((prev) =>
      prev ? { ...prev, cases: prev.cases.filter((c) => c.id !== id) } : prev,
    )
  }

  return (
    <Modal
      title={t.history.title}
      onClose={onClose}
      width={Math.min(720, Math.max(520, view.w - 96))}
      height={Math.max(360, Math.min(640, view.h - 120))}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
          {t.history.hint}
        </p>

        {listing === null && (
          <p className="text-[11px] text-[var(--color-muted)]">{t.history.loading}</p>
        )}

        {listing?.cases.length === 0 && listing.unreadable.length === 0 && (
          <p className="text-[11.5px] text-[var(--color-muted)]">{t.history.empty}</p>
        )}

        <ul className="space-y-1.5">
          {listing?.cases.map((c) => (
            <li key={c.id} className="bg-black/25 p-2.5">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px]">{c.title}</span>
                <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-faint)]">
                  {utcToZoned(c.createdAt, zone)}
                </span>
              </div>

              <p className="mt-1 font-mono text-[10px] text-[var(--color-muted)]">
                {utcToZoned(c.window.since, zone)} - {utcToZoned(c.window.until, zone)}
              </p>

              <p className="mt-1 text-[10.5px] text-[var(--color-muted)]">
                {t.history.counts(c.branches, c.changedFiles, c.findings)}
                {/* 확인 못 한 게 있으면 목록에서부터 보여야 한다 */}
                {c.failures > 0 && (
                  <span className="ml-1.5 text-[var(--color-sand)]">
                    {t.history.failures(c.failures)}
                  </span>
                )}
              </p>

              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => open(c.id)}
                  disabled={busy === c.id}
                  className="px-btn bg-[var(--color-moss)] px-2.5 py-1 text-[10.5px] font-semibold text-[#16241c] disabled:bg-[var(--color-edge)] disabled:text-[var(--color-faint)]"
                >
                  {busy === c.id ? t.history.opening : t.history.open}
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="px-btn px-2.5 py-1 text-[10.5px] text-[var(--color-faint)]"
                >
                  {t.history.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* 못 읽은 파일을 조용히 빼지 않는다. 목록에서 사라지면 없었던 것이 된다. */}
        {listing && listing.unreadable.length > 0 && (
          <p className="mt-3 bg-[var(--color-sand)]/10 p-2.5 text-[10.5px] leading-relaxed text-[var(--color-sand)]">
            {t.history.unreadable(listing.unreadable.length)}
          </p>
        )}
      </div>
    </Modal>
  )
}
