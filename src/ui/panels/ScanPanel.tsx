import { useTr } from '../../i18n'
import { useState } from 'react'
import { DETECTORS } from '../../core/detectors'
import type { GitHubClient } from '../../core/github'
import type { ScanProgress } from '../../core/scan'
import { ActorPicker } from '../fields/ActorPicker'
import { ScopePicker, type Scope } from '../fields/ScopePicker'
import { TimeRange } from '../fields/TimeRange'

/**
 * 왼쪽 설정 칸.
 *
 * 입력 부품은 전부 직접 만든 것을 쓴다. 브라우저 기본 날짜 입력 같은 걸 섞으면
 * 그것만 우리 화면에서 혼자 튄다.
 */

export interface ScanForm {
  title: string
  scope: Scope
  actor: string
  sinceKst: string
  untilKst: string
  detectors: Record<string, boolean>
}

interface Props {
  form: ScanForm
  onChange: (f: ScanForm) => void
  onScan: () => void
  scanning: boolean
  progress: ScanProgress | null
  onFocusField: (field: string | null) => void
  gh: GitHubClient
}

export function ScanPanel({
  form,
  onChange,
  onScan,
  scanning,
  progress,
  onFocusField,
  gh,
}: Props) {
  const [showRules, setShowRules] = useState(false)
  const set = <K extends keyof ScanForm>(k: K, v: ScanForm[K]) => onChange({ ...form, [k]: v })

  const ready =
    (form.scope.orgs.length > 0 || form.scope.repos.length > 0) &&
    Boolean(form.sinceKst && form.untilKst)
  const t = useTr()
  const onCount = Object.values(form.detectors).filter(Boolean).length

  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--color-edge)] bg-[var(--color-slate)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h1 className="mb-4 text-[13.5px] font-semibold">{t.scanPanel.heading}</h1>

        <Field label={t.scanPanel.where}>
          <ScopePicker
            gh={gh}
            value={form.scope}
            onChange={(v) => set('scope', v)}
            onFocus={() => onFocusField('orgs')}
            onBlur={() => onFocusField(null)}
          />
        </Field>

        <Field label={t.scanPanel.when} hint={t.scanPanel.whenHint}>
          <TimeRange
            since={form.sinceKst}
            until={form.untilKst}
            onChange={(s, u) => onChange({ ...form, sinceKst: s, untilKst: u })}
            onFocus={() => onFocusField('sinceKst')}
            onBlur={() => onFocusField(null)}
          />
        </Field>

        <Field label={t.scanPanel.actor} hint={t.scanPanel.actorHint}>
          <ActorPicker
            value={form.actor}
            onChange={(v) => set('actor', v)}
            gh={gh}
            orgs={form.scope.orgs}
            repos={form.scope.repos}
            onFocus={() => onFocusField('actor')}
            onBlur={() => onFocusField(null)}
          />
        </Field>

        <Field label={t.scanPanel.name} hint={t.scanPanel.nameHint}>
          <input
            className="field"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            onFocus={() => onFocusField('title')}
            onBlur={() => onFocusField(null)}
            placeholder={t.scanPanel.namePlaceholder}
          />
        </Field>

        <div className="px-rule my-4" />

        <button
          type="button"
          onClick={() => setShowRules((v) => !v)}
          className="flex w-full items-center justify-between py-1 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <span>{t.scanPanel.rules(onCount)}</span>
          <span className="text-[var(--color-faint)]">
            {showRules ? t.common.collapse : t.common.expand}
          </span>
        </button>

        {showRules && (
          <div className="animate-rise px mt-3 bg-[var(--color-ink)] p-3">
            {/*
              체크박스를 앞세우면 "고른 것만 검사한다"로 읽힌다. 사실은 반대다.
              그래서 먼저 무엇인지 설명하고, 끄는 건 부수적인 동작으로 둔다.
            */}
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-muted)]">
              {t.scanPanel.rulesNote}
            </p>

            <ul className="space-y-2.5">
              {DETECTORS.map((d) => {
                const on = form.detectors[d.id] ?? d.enabledByDefault
                return (
                  <li key={d.id} className="flex items-start gap-2">
                    <span
                      className="mt-[3px] shrink-0"
                      style={{
                        width: 5,
                        height: 5,
                        background: on ? 'var(--color-moss)' : 'var(--color-edge)',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[11.5px]"
                        style={{ color: on ? 'var(--color-text)' : 'var(--color-faint)' }}
                      >
                        {d.name}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-[var(--color-faint)]">
                        {d.rationale}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => set('detectors', { ...form.detectors, [d.id]: !on })}
                      className="shrink-0 text-[10.5px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
                    >
                      {on ? t.common.off : t.common.on}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="shrink-0 p-4">
        <div className="px-rule mb-4" />
        <button
          type="button"
          disabled={scanning || !ready}
          onClick={onScan}
          className="px-btn w-full bg-[var(--color-moss)] py-2.5 text-[12.5px] font-semibold text-[#16241c] hover:brightness-105 disabled:cursor-not-allowed disabled:bg-[var(--color-edge)] disabled:text-[var(--color-faint)]"
        >
          {scanning ? t.scanPanel.scanning : t.scanPanel.scan}
        </button>

        {progress && scanning ? (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[10.5px] text-[var(--color-muted)]">
              <span className="truncate">{progress.message}</span>
              <span className="ml-2 shrink-0 font-mono">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="dots">
              {Array.from({ length: 16 }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < Math.round((progress.current / Math.max(1, progress.total)) * 16)
                      ? 'dot dot-on'
                      : 'dot'
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 flex items-baseline gap-1.5">
        <span className="text-[11.5px]">{label}</span>
        {hint && <span className="text-[10.5px] text-[var(--color-faint)]">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
