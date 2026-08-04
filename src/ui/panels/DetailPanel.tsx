import { useTr } from '../../i18n'
import { reactMole } from '../scene/moleReactions'
import { useState } from 'react'
import type { GitHubClient } from '../../core/github'
import { collapseHiddenPadding, defang, formatBytes, wrapUntrusted } from '../../core/safeText'
import type { BranchState, Finding } from '../../core/types'

/**
 * 오른쪽 상세 패널.
 *
 * 페이로드 원문을 보여주는 유일한 곳이라 SAFETY.md 6번이 여기서 지켜져야 한다.
 *   - React 텍스트 노드로만 그린다 (dangerouslySetInnerHTML 없음)
 *   - URL 은 defang 해서 눌러지지 않게
 *   - 숨김 공백은 접어서 "빈 파일처럼 보이는 착시"를 없앰
 *   - 파일은 눌렀을 때만 가져온다. 열자마자 자동으로 받지 않는다
 */

const STATUS_DOT: Record<BranchState['status'], string> = {
  changed: 'var(--color-apricot)',
  reverted: 'var(--color-moss)',
  untouched: 'var(--color-faint)',
  unknown: 'var(--color-sand)',
}

interface Props {
  finding: Finding | null
  branch: BranchState | null
  gh: GitHubClient | null
  onClose: () => void
}

export function DetailPanel({ finding, branch, gh, onClose }: Props) {
  const t = useTr()
  const [sample, setSample] = useState<{ text: string; padding: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!finding && !branch) return null

  const loadSample = async () => {
    if (!finding?.sampleRef || !gh) return
    setLoading(true)
    try {
      const raw = await gh.getTextFile(
        finding.sampleRef.repo,
        finding.sampleRef.path,
        finding.sampleRef.ref,
      )
      if (raw === null) {
        setSample({ text: t.detail.binary, padding: 0 })
      } else {
        const { display, paddingFound } = collapseHiddenPadding(raw)
        setSample({ text: defang(display), padding: paddingFound })
      }
    } catch (err) {
      setSample({ text: t.detail.fetchFailed(String(err)), padding: 0 })
    } finally {
      setLoading(false)
    }
  }

  const copyForAgent = async () => {
    if (!finding?.sampleRef || !sample) return
    await navigator.clipboard.writeText(
      wrapUntrusted(sample.text, {
        repo: finding.sampleRef.repo,
        path: finding.sampleRef.path,
      }),
    )
    reactMole('copied')
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[var(--color-edge)] bg-[var(--color-slate)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--color-edge)] p-4">
        <div className="min-w-0">
          {finding ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <AttentionChip finding={finding} />
                <span className="truncate font-mono text-[10.5px] text-[var(--color-muted)]">
                  {finding.repo}
                </span>
              </div>
              <h2 className="text-[13.5px] font-semibold">{finding.title}</h2>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2"
                  style={{ background: STATUS_DOT[branch!.status], borderRadius: 2 }}
                />
                <span className="text-[11px]">{t.detail.branchStatus[branch!.status]}</span>
              </div>
              <h2 className="truncate font-mono text-[13px] font-semibold">{branch!.branch}</h2>
              <p className="truncate font-mono text-[10.5px] text-[var(--color-muted)]">
                {branch!.repo}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0  px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-white/5"
        >
          {t.common.close}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {finding && (
          <>
            <p className="mb-4 text-[12px] leading-relaxed text-[var(--color-text)]">{finding.summary}</p>

            <SectionTitle>{t.detail.evidence}</SectionTitle>
            <ul className="mb-4 space-y-2">
              {finding.evidence.map((ev, i) => (
                <li key={i} className=" bg-black/25 p-2.5">
                  {ev.href ? (
                    <a
                      href={ev.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[11.5px] text-[var(--color-moss)] hover:underline"
                    >
                      {ev.label} ↗
                    </a>
                  ) : (
                    <span className="text-[11.5px] font-medium">{ev.label}</span>
                  )}
                  {ev.detail && (
                    <p className="mt-1 text-[10.5px] leading-relaxed whitespace-pre-wrap text-[var(--color-muted)]">
                      {ev.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {finding.sampleRef && (
              <>
                <SectionTitle>{t.detail.fileContent}</SectionTitle>
                <div className="mb-2 flex items-center justify-between text-[10.5px] text-[var(--color-muted)]">
                  <span className="truncate font-mono">{finding.sampleRef.path}</span>
                  <span className="ml-2 shrink-0">{formatBytes(finding.sampleRef.sizeBytes)}</span>
                </div>

                {!sample ? (
                  <div className=" border border-[var(--color-edge)] bg-black/25 p-3">
                    <p className="mb-2.5 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
                      {t.detail.textOnly}
                    </p>
                    <button
                      type="button"
                      onClick={loadSample}
                      disabled={loading}
                      className=" border border-[var(--color-edge)] px-2.5 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-40"
                    >
                      {loading ? t.common.loading : t.detail.open}
                    </button>
                  </div>
                ) : (
                  <>
                    {sample.padding > 0 && (
                      <p className="mb-2  bg-[var(--color-sand)]/10 p-2 text-[10.5px] leading-relaxed text-[var(--color-sand)]">
                        {t.detail.padding(sample.padding.toLocaleString())}
                      </p>
                    )}
                    <pre className="payload-text max-h-72 overflow-auto  bg-black/40 p-3">
                      {sample.text}
                    </pre>
                    <button
                      type="button"
                      onClick={copyForAgent}
                      className="mt-2 w-full  border border-[var(--color-moss)] py-2 text-[11.5px] text-[var(--color-moss)] hover:bg-[var(--color-moss)]/10"
                    >
                      {copied ? t.common.copied : t.detail.copyForAgent}
                    </button>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-muted)]">
                      {t.detail.copyForAgentHint}
                    </p>
                  </>
                )}
              </>
            )}
          </>
        )}

        {branch && !finding && (
          <div className="space-y-3">
            <Row label={t.detail.currentCommit} value={branch.currentSha?.slice(0, 12) ?? '-'} mono />
            <Row label={t.detail.restoreTarget} value={branch.restoreTarget?.slice(0, 12) ?? '-'} mono />
            {branch.unknownReason && (
              <div className=" bg-[var(--color-sand)]/10 p-2.5">
                <p className="text-[11px] text-[var(--color-sand)]">{t.detail.unknownReason}</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
                  {branch.unknownReason}
                </p>
              </div>
            )}
            <Row label={t.detail.changedFiles} value={t.detail.changedFilesValue(branch.changedFiles)} />
            <p className=" bg-black/25 p-2.5 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
              {t.detail.branchNote(branch.findingIds.length)}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] tracking-[0.12em] text-[var(--color-muted)] uppercase">
      {children}
    </h3>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      <span className={`text-[11.5px] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

/**
 * 주목도 뱃지.
 *
 * "위험/안전"이 아니라 "먼저 볼 것/나중에 볼 것"이다.
 * 이 도구는 판정하지 않으므로 문구도 판정처럼 읽히면 안 된다.
 */
function AttentionChip({ finding }: { finding: Finding }) {
  const t = useTr()
  const COLOR = {
    first: 'var(--color-apricot)',
    soon: 'var(--color-sand)',
    later: 'var(--color-muted)',
  } as const
  const text = t.detail.attention[finding.attention]
  const color = COLOR[finding.attention]
  const conf = t.detail.confidence[finding.confidence]
  return (
    <>
      <span
        className=" px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      >
        {text}
      </span>
      <span className="text-[10px] text-[var(--color-muted)]">{conf}</span>
    </>
  )
}
