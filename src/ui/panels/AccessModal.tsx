import { useEffect, useState } from 'react'

import {
  checkAccess,
  DEFAULT_RECENT_DAYS,
  narrowRepos,
  ORG_HOOK_SCOPE_CMD,
} from '../../core/access'
import type { GitHubClient } from '../../core/github'
import { defang } from '../../core/safeText'
import type { AccessKind, AccessReport, RepoRef } from '../../core/types'
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
  // 러너만 다른 색이다. 여기서 유일하게 저장소 밖으로 나간다.
  runner: 'var(--color-ember)',
  secret: 'var(--color-sand)',
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

  /*
    누르기 전에 몇 개나 볼 수 있는지 알려준다.

    여기서 보는 것은 거의 다 저장소 관리자여야 조회된다. 3개만 관리자인 사람이
    버튼을 누르면 한참 기다린 끝에 대부분 "못 봤다" 인 화면을 받는다.
    **그걸 누르기 전에 알 수 있었는데 안 알려준 것이다.**

    목록을 여기서 미리 받는다고 요청이 느는 건 아니다. 누르면 어차피 받던 것을
    앞으로 옮긴 것뿐이고, 눌렀을 때는 이미 받아둔 걸 쓴다.
  */
  const [scope, setScope] = useState<RepoRef[] | null>(null)

  useEffect(() => {
    if (!gh) return
    let alive = true
    gh.listAccessibleRepos()
      .then((all) => alive && setScope(narrowRepos(all, { repos, orgs })))
      .catch(() => alive && setScope([]))
    return () => {
      alive = false
    }
  }, [gh, repos, orgs])

  const canCheck = scope?.filter((r) => r.isAdmin).length ?? 0
  const nothingToCheck = scope !== null && scope.length > 0 && canCheck === 0

  const run = async () => {
    if (!gh) return
    setBusy(true)
    setFailed(false)
    try {
      const picked = scope ?? narrowRepos(await gh.listAccessibleRepos(), { repos, orgs })

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
            {/*
              무엇을 보는지 돌리기 전에 알려준다.

              결과가 "없음" 으로 나올 때가 대부분인데, 무엇을 확인했는지 모르면
              그 "없음" 이 아무 뜻도 안 된다. 세 가지가 무엇이고 왜 알아야 하는지를
              먼저 읽고 나서 누르게 한다.
            */}
            <p className="mb-1.5 text-[10.5px] font-semibold text-[var(--color-faint)]">
              {t.access.looksFor}
            </p>
            <ul className="mb-4 space-y-1.5">
              {(['deployKey', 'webhook', 'invitation', 'runner', 'secret'] as const).map((kind) => (
                <li key={kind} className="bg-black/25 p-2.5">
                  <p className="text-[11px]" style={{ color: TONE[kind] }}>
                    {t.access.kinds[kind]}
                  </p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
                    {t.access.why[kind]}
                  </p>
                </li>
              ))}
            </ul>

            {/* 무엇을 볼 수 있는지가 무엇을 보는지만큼 중요하다 */}
            {scope !== null && (
              <p
                className="mb-3 p-2.5 text-[10.5px] leading-relaxed"
                style={{
                  background: 'rgba(0,0,0,.25)',
                  color: nothingToCheck ? 'var(--color-sand)' : 'var(--color-muted)',
                }}
              >
                {nothingToCheck
                  ? t.access.noneAdmin
                  : t.access.adminScope(canCheck, scope.length)}
              </p>
            )}

            <button
              type="button"
              onClick={run}
              disabled={busy || !gh || nothingToCheck}
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
                        {(item.changedAt ?? item.createdAt ?? '').slice(0, 10)}
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

            {/*
              언제 생겼는지 모르는 것.

              러너가 여기 온다. '최근' 에 넣으면 오래된 것을 이번 사고로 만들고,
              '이미 있던 것' 에 넣으면 방금 심은 것을 원래 있던 걸로 만든다.
            */}
            {report.undated.length > 0 && (
              <>
                <SectionTitle>{t.access.undatedTitle}</SectionTitle>
                <ul className="mb-2 space-y-1.5">
                  {report.undated.map((item, i) => (
                    <li key={`${item.repo}-${item.label}-${i}`} className="bg-black/25 p-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0 text-[10px]" style={{ color: TONE[item.kind] }}>
                          {t.access.kinds[item.kind]}
                        </span>
                        <span className="truncate font-mono text-[11px]">{item.repo}</span>
                      </div>
                      <p className="mt-1 font-mono text-[10.5px] text-[var(--color-muted)]">
                        {item.label}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mb-4 text-[10.5px] leading-relaxed text-[var(--color-sand)]">
                  {t.access.undatedNote}
                </p>
              </>
            )}

            <SectionTitle>{t.access.existingTitle}</SectionTitle>
            <p className="mb-4 text-[11px] text-[var(--color-muted)]">
              {(['deployKey', 'webhook', 'invitation', 'runner', 'secret'] as const)
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

              {/* 어떤 권한이 없는지를 먼저 이름으로 말한다. "권한이 더 필요해요" 만으로는 뭘 할지 모른다. */}
              <p className="mt-1.5 text-[10px] text-[var(--color-faint)]">
                <span
                  className="px-1 py-0.5 font-mono"
                  style={{ background: 'var(--color-ink)', color: 'var(--color-sand)' }}
                >
                  {t.access.orgHookScope}
                </span>
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-faint)]">
                {t.access.orgHookWhy}
              </p>
              <p className="mt-1.5 mb-2 text-[10px] leading-relaxed text-[var(--color-faint)]">
                {t.access.orgHookWhyNotAsk}
              </p>
              <p
                className="px-2 py-1.5 font-mono text-[10px] break-all"
                style={{ background: 'var(--color-ink)' }}
              >
                {ORG_HOOK_SCOPE_CMD}
              </p>
              <p className="mt-1.5 text-[10px] text-[var(--color-faint)]">
                {t.access.orgHookRunAgain}
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
