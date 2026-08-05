import { useState } from 'react'

import { checkAccess, DEFAULT_RECENT_DAYS, ORG_HOOK_SCOPE_CMD } from '../../core/access'
import type { GitHubClient } from '../../core/github'
import { defang } from '../../core/safeText'
import type { AccessKind, AccessReport } from '../../core/types'
import { useTr } from '../../i18n'
import { Modal } from '../chrome/Modal'
import { useViewport } from '../hooks/useViewport'
import { reactMole } from '../scene/moleReactions'

/**
 * 문단속 - 브랜치를 안 건드리고 들어오는 문을 본다.
 *
 * 훑기와 따로 두는 이유는 성격이 달라서다. 훑기는 시간대 안에 무엇이 바뀌었나를 보고,
 * 여기는 지금 어떤 문이 열려 있나를 본다. 같은 결과에 섞으면 "이 사고에서 뭐가 바뀌었나" 가 흐려지고,
 * 이건 사고가 없을 때 돌려도 값이 있는 것이라 굳이 사고에 묶을 이유가 없다.
 */

const TONE: Record<AccessKind, string> = {
  deployKey: 'var(--color-sand)',
  webhook: 'var(--color-apricot)',
  invitation: 'var(--color-moss)',
}

export function AccessModal({
  gh,
  orgs,
  repos,
  onClose,
}: {
  gh: GitHubClient | null
  /** 설정 칸에서 고른 조직. 조직 초대까지 본다 */
  orgs: string[]
  /** 설정 칸에서 고른 저장소. 비어 있으면 접근 가능한 전부를 본다 */
  repos: string[]
  onClose: () => void
}) {
  const t = useTr()
  const view = useViewport()
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState<{ done: number; total: number } | null>(null)
  const [report, setReport] = useState<AccessReport | null>(null)
  const [failed, setFailed] = useState(false)

  const run = async () => {
    if (!gh) return
    setBusy(true)
    setFailed(false)
    try {
      const all = await gh.listAccessibleRepos()
      const picked = repos.length
        ? all.filter((r) => repos.includes(r.fullName))
        : orgs.length
          ? all.filter((r) => orgs.includes(r.owner))
          : all

      const since = new Date(Date.now() - DEFAULT_RECENT_DAYS * 86_400_000).toISOString()
      const result = await checkAccess(gh, { repos: picked, orgs, since }, (done, total) =>
        setAt({ done, total }),
      )
      setReport(result)
      reactMole(result.recent.length > 0 ? 'doorsFound' : 'nothingOpen')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
      setAt(null)
    }
  }

  const gapCount = (why: string) => report?.gaps.filter((g) => g.why === why).length ?? 0

  return (
    <Modal
      title={t.access.title}
      onClose={onClose}
      width={Math.min(720, Math.max(520, view.w - 96))}
      height={Math.max(360, Math.min(640, view.h - 120))}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
          {t.access.hint}
        </p>

        {!report && (
          <>
            <button
              type="button"
              onClick={run}
              disabled={busy || !gh}
              className="px-btn bg-[var(--color-moss)] px-4 py-2 text-[12px] font-semibold text-[#16241c] disabled:bg-[var(--color-edge)] disabled:text-[var(--color-faint)]"
            >
              {busy ? t.access.running : t.access.run}
            </button>
            {at && (
              <p className="mt-2 font-mono text-[10.5px] text-[var(--color-muted)]">
                {t.access.progress(at.done, at.total)}
              </p>
            )}
            {failed && (
              <p className="mt-2 text-[10.5px] text-[var(--color-sand)]">{t.diffView.failed}</p>
            )}
          </>
        )}

        {report && (
          <>
            <p className="mb-3 text-[11px] text-[var(--color-muted)]">
              {t.access.checked(report.checked)}
            </p>

            <SectionTitle>{t.access.recentTitle(DEFAULT_RECENT_DAYS)}</SectionTitle>
            {report.recent.length === 0 ? (
              <p className="mb-4 text-[11.5px] text-[var(--color-muted)]">
                {t.access.nothingRecent(DEFAULT_RECENT_DAYS)}
              </p>
            ) : (
              <ul className="mb-4 space-y-1.5">
                {report.recent.map((item, i) => (
                  <li key={i} className="bg-black/25 p-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-[10px]" style={{ color: TONE[item.kind] }}>
                        {t.access.kinds[item.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">
                        {item.repo}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-faint)]">
                        {item.createdAt.slice(0, 10)}
                      </span>
                    </div>

                    <p className="mt-1 font-mono text-[10.5px] text-[var(--color-text)]">
                      {item.label}
                      {item.readOnly && (
                        <span className="ml-1.5 text-[9.5px] text-[var(--color-faint)]">
                          {t.access.readOnly}
                        </span>
                      )}
                    </p>

                    {/* 웹훅 주소는 페이로드다. 눌리지 않는 형태로만 그린다. */}
                    {item.target && (
                      <p className="payload-text mt-1 break-all text-[10px] text-[var(--color-muted)]">
                        {defang(item.target)}
                      </p>
                    )}

                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-faint)]">
                      {t.access.why[item.kind]}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <SectionTitle>{t.access.existingTitle}</SectionTitle>
            <p className="mb-4 text-[11px] text-[var(--color-muted)]">
              {(['deployKey', 'webhook', 'invitation'] as const)
                .map((kind) => `${t.access.kinds[kind]} ${report.existing[kind]}`)
                .join(', ')}
            </p>

            {(gapCount('notAdmin') > 0 || gapCount('failed') > 0) && (
              <p className="mb-3 bg-[var(--color-sand)]/10 p-2.5 text-[10.5px] leading-relaxed text-[var(--color-sand)]">
                {gapCount('notAdmin') > 0 && t.access.gapNotAdmin(gapCount('notAdmin'))}
                {gapCount('notAdmin') > 0 && gapCount('failed') > 0 && ', '}
                {gapCount('failed') > 0 && t.access.gapFailed(gapCount('failed'))}
              </p>
            )}

            <div className="bg-black/25 p-2.5">
              <p className="text-[10.5px] text-[var(--color-muted)]">{t.access.orgHookTitle}</p>
              <p className="mt-1 mb-2 text-[10px] leading-relaxed text-[var(--color-faint)]">
                {t.access.orgHookNote}
              </p>
              <p
                className="px-2 py-1.5 font-mono text-[10px] break-all"
                style={{ background: 'var(--color-ink)' }}
              >
                {ORG_HOOK_SCOPE_CMD}
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10.5px] font-semibold text-[var(--color-faint)]">{children}</h3>
  )
}
