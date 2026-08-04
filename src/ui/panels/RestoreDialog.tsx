import { useTr } from '../../i18n'
import { useEffect, useState } from 'react'

import type { GitHubClient } from '../../core/github'
import { Modal } from '../chrome/Modal'
import {
  backupText,
  buildPlan,
  canRestore,
  executePlan,
  markProtected,
  summarizeRestore,
  type RestoreProgress,
} from '../../core/restore'
import type { CaseFile, RestoreEntry, RestorePlan, RestoreRecord } from '../../core/types'

/**
 * 되돌리기 창.
 *
 * 이 프로그램에서 **유일하게 저장소를 바꾸는 화면**이라
 * 되돌아올 수 없는 길로 가기 전에 세 개의 문을 세웠다.
 *
 *   1. 백업을 받아야 다음으로 못 넘어간다
 *   2. 잠금을 직접 풀어야 실행 버튼이 살아난다
 *   3. 보호 규칙이 걸린 브랜치는 미리 세어서 보여준다 (우리가 풀지 않는다)
 *
 * 문을 줄이고 싶은 유혹이 생기면, 이게 남의 저장소 히스토리를
 * 되돌리는 일이라는 걸 떠올리면 된다.
 */

type Step = 'check' | 'review' | 'running' | 'done'

interface Props {
  caseFile: CaseFile
  gh: GitHubClient
  onClose: () => void
  onFinished: (r: RestoreRecord) => void
}

export function RestoreDialog({ caseFile, gh, onClose, onFinished }: Props) {
  const [step, setStep] = useState<Step>('check')
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [checking, setChecking] = useState(true)
  const [backedUp, setBackedUp] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [progress, setProgress] = useState<RestoreProgress | null>(null)
  const [record, setRecord] = useState<RestoreRecord | null>(null)
  /** 이미 처리한 브랜치. 하나만 먼저 해본 경우를 위해 따로 센다. */
  const [done, setDone] = useState<RestoreEntry[]>([])

  const gate = canRestore(caseFile)

  // 계획을 세우고 보호 규칙을 미리 확인한다
  useEffect(() => {
    if (!gate.ok) {
      setChecking(false)
      return
    }
    const base = buildPlan(caseFile)
    markProtected(gh, base)
      .then((p) => {
        setPlan(p)
        setStep('review')
      })
      .catch(() => setPlan(base))
      .finally(() => setChecking(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const downloadBackup = () => {
    if (!plan) return
    const blob = new Blob([backupText(plan)], { type: 'text/tab-separated-values' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.id}-backup.tsv`
    a.click()
    URL.revokeObjectURL(url)
    setBackedUp(true)
  }

  const key = (e: { repo: string; branch: string }) => `${e.repo}/${e.branch}`
  const doneKeys = new Set(done.map(key))
  const remaining = plan?.entries.filter((e) => !doneKeys.has(key(e))) ?? []

  /**
   * 고른 것들만 되돌린다.
   *
   * `trial` 이면 한 건만 하고 멈춘다 - 처음 쓰는 사람이
   * 한 번 확인하고 나머지를 진행할 수 있게.
   */
  const run = async (trial: boolean) => {
    if (!plan) return

    // 시험은 보호 규칙에 안 걸린 것으로 고른다. 막힐 걸 골라봐야 확인이 안 된다.
    const picked = trial
      ? remaining.filter((e) => !e.isProtected).slice(0, 1)
      : remaining
    if (picked.length === 0) return

    setStep('running')
    const r = await executePlan(gh, { ...plan, entries: picked }, setProgress)
    const merged = [...done, ...r.entries]
    setDone(merged)

    const full: RestoreRecord = { ...r, entries: merged }
    setRecord(full)
    onFinished(r)

    // 시험이고 아직 남았으면 다시 목록으로 돌아간다
    const leftover = plan.entries.filter((e) => !new Set(merged.map(key)).has(key(e)))
    setStep(trial && leftover.length > 0 ? 'review' : 'done')
  }

  const t = useTr()
  const protectedCount = plan?.entries.filter((e) => e.isProtected).length ?? 0

  return (
    <Modal title={t.restore.title} onClose={onClose} width={560}>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {checking && <p className="text-[12px] text-[var(--color-muted)]">{t.restore.planning}</p>}

          {/* 되돌리면 안 되는 상황 */}
          {!checking && !gate.ok && (
            <div
              className="p-3"
              style={{
                background: 'var(--color-ink)',
                boxShadow:
                  '0 -2px 0 var(--color-sand), 0 2px 0 var(--color-sand), -2px 0 0 var(--color-sand), 2px 0 0 var(--color-sand)',
              }}
            >
              <p className="mb-1.5 text-[12px] font-semibold text-[var(--color-sand)]">
                {t.restore.blocked}
              </p>
              <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">{gate.reason}</p>
            </div>
          )}

          {step === 'review' && plan && (
            <>
              {done.length > 0 && (
                <p
                  className="mb-3 p-2.5 text-[11.5px] leading-relaxed"
                  style={{ background: 'var(--color-ink)', color: 'var(--color-moss)' }}
                >
                  {t.restore.partialDone(done.filter((d) => d.outcome === 'ok').length)}
                </p>
              )}

              <p className="mb-3 text-[12px] leading-relaxed">{t.restore.warn(remaining.length)}</p>

              {protectedCount > 0 && (
                <p className="mb-3 p-2.5 text-[11px] leading-relaxed text-[var(--color-sand)]"
                  style={{ background: 'var(--color-ink)' }}
                >
                  {t.restore.protectedNote(protectedCount)}
                </p>
              )}

              <ul className="mb-4 max-h-52 overflow-y-auto">
                {plan.entries.map((e) => (
                  <li
                    key={`${e.repo}/${e.branch}`}
                    className="flex items-center gap-2 border-b border-[var(--color-edge-soft)] py-1.5 font-mono text-[10.5px]"
                    style={{ opacity: doneKeys.has(key(e)) ? 0.35 : 1 }}
                  >
                    <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]">
                      {e.repo}
                    </span>
                    <span className="w-32 shrink-0 truncate">{e.branch}</span>
                    <span className="shrink-0 text-[var(--color-faint)]">
                      {e.from.slice(0, 7)} → {e.to.slice(0, 7)}
                    </span>
                    {e.isProtected && (
                      <span className="shrink-0 text-[var(--color-sand)]">{t.restore.protectedTag}</span>
                    )}
                  </li>
                ))}
              </ul>

              {/* 문 1 - 백업 */}
              <Gate n={1} done={backedUp} label={t.restore.gateBackup}>
                <button
                  type="button"
                  onClick={downloadBackup}
                  className="px-btn bg-[var(--color-edge)] px-3 py-1.5 text-[11px] hover:brightness-125"
                >
                  {backedUp ? t.restore.backupAgain : t.restore.backup}
                </button>
              </Gate>

              {/* 문 2 - 잠금 */}
              <Gate n={2} done={unlocked} label={t.restore.gateConfirm}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="px-check shrink-0"
                    checked={unlocked}
                    disabled={!backedUp}
                    onChange={(e) => setUnlocked(e.target.checked)}
                  />
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {backedUp ? t.restore.confirmLabel : t.restore.confirmNeedBackup}
                  </span>
                </label>
              </Gate>
            </>
          )}

          {step === 'running' && progress && (
            <div>
              <p className="mb-2 text-[12px]">{t.restore.running}</p>
              <p className="mb-2 truncate font-mono text-[10.5px] text-[var(--color-muted)]">
                {progress.current}
              </p>
              <div className="dots">
                {Array.from({ length: 20 }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < Math.round((progress.done / progress.total) * 20) ? 'dot dot-on' : 'dot'
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'done' && record && <Result record={record} />}
        </div>

        {step === 'review' && plan && (
          <footer className="flex items-center gap-3 border-t border-[var(--color-edge)] p-4">
            <span className="text-[10.5px] text-[var(--color-faint)]">
              {backedUp && unlocked ? t.restore.ready : t.restore.notReady}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* 하나뿐이면 '하나만 먼저'가 곧 '전부'라 보여줄 이유가 없다 */}
              {done.length === 0 &&
                remaining.length > 1 &&
                remaining.some((e) => !e.isProtected) && (
                  <button
                    type="button"
                    disabled={!backedUp || !unlocked}
                    onClick={() => run(true)}
                    className="px-btn bg-[var(--color-edge)] px-3 py-2 text-[11.5px] hover:brightness-125 disabled:text-[var(--color-faint)]"
                  >
                    {t.restore.justOne}
                  </button>
                )}
              <button
                type="button"
                disabled={!backedUp || !unlocked || remaining.length === 0}
                onClick={() => run(false)}
                className="px-btn bg-[var(--color-apricot)] px-4 py-2 text-[12px] font-semibold text-[#241a10] hover:brightness-105 disabled:bg-[var(--color-edge)] disabled:text-[var(--color-faint)]"
              >
                {t.restore.restoreN(remaining.length)}
              </button>
            </div>
          </footer>
        )}
    </Modal>
  )
}

function Gate({
  n,
  done,
  label,
  children,
}: {
  n: number
  done: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[9.5px] font-semibold"
        style={{
          background: done ? 'var(--color-moss)' : 'transparent',
          color: done ? '#16241c' : 'var(--color-faint)',
          boxShadow: done ? undefined : 'inset 0 0 0 2px var(--color-edge)',
        }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[11.5px]">{label}</p>
        {children}
      </div>
    </div>
  )
}

function Result({ record }: { record: RestoreRecord }) {
  const t = useTr()
  const s = summarizeRestore(record)
  const failed = record.entries.filter((e) => e.outcome === 'failed')

  return (
    <div>
      <p className="mb-3 text-[12.5px] font-semibold">
        {t.restore.doneCount(s.ok)}
        {s.already > 0 && (
          <span className="text-[var(--color-muted)]">{t.restore.alreadyCount(s.already)}</span>
        )}
      </p>

      {failed.length > 0 && (
        <>
          <p className="mb-2 text-[11.5px] text-[var(--color-sand)]">
            {t.restore.failedCount(failed.length)}
          </p>
          <ul className="max-h-48 overflow-y-auto">
            {failed.map((e) => (
              <li key={`${e.repo}/${e.branch}`} className="border-b border-[var(--color-edge-soft)] py-1.5">
                <p className="font-mono text-[10.5px]">
                  {e.repo} / {e.branch}
                </p>
                <p className="mt-0.5 text-[10.5px] text-[var(--color-muted)]">{e.error}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {failed.length === 0 && (
        <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
          {t.restore.checkAgain}
        </p>
      )}
    </div>
  )
}
