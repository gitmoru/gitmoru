import { useTr } from '../../i18n'
import { LanguagePicker } from './LanguagePicker'
import { isDesktopApp, windowAction, type WinAction } from '../../platform/bridge'
import { summarize } from '../../core/scan'
import type { CaseFile } from '../../core/types'
import { Wordmark } from '../brand/Wordmark'

/**
 * 창 상단 바.
 *
 * 가운데를 비워두지 않는다. **지금 무엇을 보고 있는지**가 항상 여기 떠 있어야
 * 아래로 스크롤하거나 다른 걸 열어봐도 맥락을 잃지 않는다.
 *
 * 창 버튼도 직접 그린다. OS 것은 얇은 선 아이콘이라 도트 화면 옆에서 혼자 매끈하게 튄다.
 * 대신 창을 끄는 동작이 전부 우리 IPC 를 타므로 `no-drag` 를 빠뜨리면 안 눌린다.
 */

export function TitleBar({
  viewer,
  caseFile,
  onToggleAside,
  asideOpen,
  onConnectAgent,
  onCheckAccess,
  onOpenHistory,
}: {
  viewer: { login: string } | null
  caseFile: CaseFile | null
  /** 화면이 좁을 때만 넘어온다. 설정 칸을 접었다 편다. */
  onToggleAside?: () => void
  asideOpen?: boolean
  onConnectAgent?: () => void
  onCheckAccess?: () => void
  onOpenHistory?: () => void
}) {
  const t = useTr()
  const s = caseFile ? summarize(caseFile) : null

  return (
    <header
      className="drag flex h-9 shrink-0 items-center gap-2.5 border-b border-[var(--color-edge)] bg-[var(--color-slate)] pr-0 pl-3"
    >
      {onToggleAside && (
        <button
          type="button"
          onClick={onToggleAside}
          title={asideOpen ? t.titleBar.asideOpen : t.titleBar.asideClose}
          className="no-drag flex h-6 w-6 shrink-0 items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <svg width={10} height={10} viewBox="0 0 10 10" shapeRendering="crispEdges">
            <rect x={0} y={1} width={10} height={1} fill="currentColor" />
            <rect x={0} y={4} width={10} height={1} fill="currentColor" />
            <rect x={0} y={7} width={10} height={1} fill="currentColor" />
          </svg>
        </button>
      )}

      <div className="shrink-0 pt-[1px]">
        <Wordmark scale={2} ground={false} />
      </div>

      {caseFile && s ? (
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[var(--color-faint)]">, </span>
          <span className="min-w-0 truncate text-[11.5px] text-[var(--color-muted)]">
            {caseFile.title}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-[var(--color-faint)]">
            {t.titleBar.branches(s.total)}
          </span>
          {s.unknown > 0 && (
            <span className="shrink-0 text-[10.5px] text-[var(--color-sand)]">
              {t.titleBar.unknown(s.unknown)}
            </span>
          )}
          {s.changed > 0 && (
            <span className="shrink-0 text-[10.5px] text-[var(--color-apricot)]">
              {t.titleBar.changed(s.changed)}
            </span>
          )}
        </div>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            title={t.history.hint}
            className="no-drag px-2 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            style={{ boxShadow: '0 -2px 0 var(--color-edge), 0 2px 0 var(--color-edge), -2px 0 0 var(--color-edge), 2px 0 0 var(--color-edge)' }}
          >
            {t.history.title}
          </button>
        )}

        {onCheckAccess && (
          <button
            type="button"
            onClick={onCheckAccess}
            title={t.access.hint}
            className="no-drag px-2 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            style={{ boxShadow: '0 -2px 0 var(--color-edge), 0 2px 0 var(--color-edge), -2px 0 0 var(--color-edge), 2px 0 0 var(--color-edge)' }}
          >
            {t.access.title}
          </button>
        )}

        {onConnectAgent && (
          <button
            type="button"
            onClick={onConnectAgent}
            title={t.titleBar.connectAgentHint}
            className="no-drag mr-1 px-2 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            style={{ boxShadow: '0 -2px 0 var(--color-edge), 0 2px 0 var(--color-edge), -2px 0 0 var(--color-edge), 2px 0 0 var(--color-edge)' }}
          >
            {t.titleBar.connectAgent}
          </button>
        )}

        <span
          className="inline-block"
          style={{
            width: 5,
            height: 5,
            background: viewer ? 'var(--color-moss)' : 'var(--color-sand)',
          }}
        />
        <span className="pr-2 text-[10.5px] text-[var(--color-muted)]">
          {viewer ? viewer.login : t.titleBar.checkingAuth}
        </span>

        <LanguagePicker />

        {/* 창 버튼도 도트로. OS 것을 쓰면 혼자 매끈해서 튄다. */}
        {isDesktopApp() && (
          <div className="no-drag flex">
            <WinBtn action="minimize" label={t.titleBar.minimize}>
              <rect x={1} y={4} width={8} height={1} fill="currentColor" />
            </WinBtn>
            <WinBtn action="maximize" label={t.titleBar.maximize}>
              <rect x={1} y={1} width={8} height={1} fill="currentColor" />
              <rect x={1} y={8} width={8} height={1} fill="currentColor" />
              <rect x={1} y={2} width={1} height={6} fill="currentColor" />
              <rect x={8} y={2} width={1} height={6} fill="currentColor" />
            </WinBtn>
            <WinBtn action="close" label={t.common.close} danger>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <rect key={i} x={1 + i} y={1 + i} width={1} height={1} fill="currentColor" />
              ))}
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <rect key={`b${i}`} x={8 - i} y={1 + i} width={1} height={1} fill="currentColor" />
              ))}
            </WinBtn>
          </div>
        )}
      </div>
    </header>
  )
}

/** 도트로 그린 창 버튼 */
function WinBtn({
  action,
  label,
  danger,
  children,
}: {
  action: WinAction
  label: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => windowAction(action)}
      className={`flex h-9 w-11 items-center justify-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] ${
        danger ? 'hover:bg-[var(--color-apricot)] hover:!text-[#241a10]' : 'hover:bg-white/8'
      }`}
    >
      <svg width={10} height={10} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}
