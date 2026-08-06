import { useEffect, useState } from 'react'

import { DETECTORS } from '../core/detectors'
import { localeWasChosen, tr } from '../i18n'
import { summarize } from '../core/scan'
import type { BranchState, FileTarget, Finding } from '../core/types'

import { Dock } from './chrome/Dock'
import { DockResizer } from './chrome/DockResizer'
import { LanguageGate } from './chrome/LanguageGate'
import { Preloader } from './chrome/Preloader'
import { StatusBar } from './chrome/StatusBar'
import { TitleBar } from './chrome/TitleBar'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useScanSession } from './hooks/useScanSession'
import { useViewport } from './hooks/useViewport'
import { AccessModal } from './panels/AccessModal'
import { CaseHistory } from './panels/CaseHistory'
import { ConnectAgent } from './panels/ConnectAgent'
import { DetailPanel } from './panels/DetailPanel'
import { FileModal } from './panels/FileModal'
import { RestoreDialog } from './panels/RestoreDialog'
import { ScanPanel, type ScanForm } from './panels/ScanPanel'
import { Celebrate } from './scene/Celebrate'
import { Ground, GROUND_H } from './scene/Ground'
import { Mole } from './scene/Mole'
import { moleVoice } from './scene/moleVoice'
import { reactMole, useMoleReaction } from './scene/moleReactions'
import { PIXEL } from './scene/PixelArt'

/**
 * 창 전체.
 *
 * 여기 남는 상태는 **화면에 관한 것뿐**이다. 무엇을 골랐는지, 칸이 얼마나 열렸는지 같은 것들.
 * 훑기 자체(로그인, 진행, 기록, 내보내기)는 `useScanSession` 이 들고 있다.
 */

/** 아래 칸 기본 높이와, 위쪽 풍경에 남겨둘 최소 높이 */
const DOCK_DEFAULT = 260
const SCENE_MIN = 260
/** 창이 짧을 때 아래 칸을 눌러둘 높이 */
const DOCK_WHEN_SHORT = 200

/** 오늘 새벽 0시~7시. 사고는 대개 이 시간대다. 시각은 이 컴퓨터의 시간대로 읽는다. */
function defaultRange(): { since: string; until: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return { since: `${day}T00:00`, until: `${day}T07:00` }
}

/** 탐지 규칙은 기본으로 켜진 상태에서 시작한다. */
function initialDetectors(): Record<string, boolean> {
  return Object.fromEntries(DETECTORS.map((d) => [d.id, d.enabledByDefault]))
}

export function App() {
  const session = useScanSession()
  const view = useViewport()
  const idleMs = useIdleTimer()

  const [form, setForm] = useState<ScanForm>(() => {
    const range = defaultRange()
    return {
      title: '',
      scope: { orgs: [], repos: [], branches: [] },
      actor: '',
      sinceKst: range.since,
      untilKst: range.until,
      detectors: initialDetectors(),
    }
  })

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<BranchState | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileTarget | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  /** 처음 켠 사람에게만 한 번 묻는다 */
  const [askLanguage, setAskLanguage] = useState(() => !localeWasChosen())
  const [dockHeightWanted, setDockHeightWanted] = useState(DOCK_DEFAULT)
  /** 좁은 화면에서 설정 칸을 접었는지 */
  const [asideOpen, setAsideOpen] = useState(true)
  const [restoring, setRestoring] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [checkingAccess, setCheckingAccess] = useState(false)
  const [browsingHistory, setBrowsingHistory] = useState(false)

  const stats = session.caseFile ? summarize(session.caseFile) : null
  const detailOpen = Boolean(selectedFinding || selectedBranch)

  const reaction = useMoleReaction()

  const ambient = moleVoice({
    scanning: session.scanning,
    progress: session.progress,
    hasCase: Boolean(session.caseFile),
    changed: stats?.changed ?? 0,
    unknown: stats?.unknown ?? 0,
    unreviewed: stats?.unreviewed ?? 0,
    focusedField,
    reading: detailOpen,
    idleMs,
    error: session.authError ?? session.error,
  })

  // 방금 벌어진 일이 있으면 그게 먼저다. 없으면 평소 표정으로 돌아간다.
  const mole = reaction ?? ambient

  // 첫 화면이 걷히면 인사한다. 앱이 켜졌다는 걸 캐릭터가 알려주는 자리다.
  useEffect(() => {
    if (booting || askLanguage) return
    reactMole('greet')
  }, [booting, askLanguage])

  // 창이 짧아지면 아래 칸이 화면을 다 먹지 않게 눌러준다
  const maxDock = Math.max(150, view.h - SCENE_MIN)
  const dockHeight = Math.min(view.short ? DOCK_WHEN_SHORT : dockHeightWanted, maxDock)

  /** 좁으면 상세를 칸으로 못 놓는다. 위에 겹쳐 띄운다. */
  const detailFloats = view.narrow
  const showAside = !view.tight || asideOpen

  const openFinding = (finding: Finding) => {
    setSelectedFinding(finding)
    setSelectedBranch(null)
  }
  /** 파일은 옆 칸이 아니라 모달로 연다. 보던 목록을 밀어내지 않는다. */
  const openFile = (target: FileTarget) => setSelectedFile(target)
  const closeDetail = () => {
    setSelectedFinding(null)
    setSelectedBranch(null)
  }

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-ink)]">
      <TitleBar
        viewer={session.viewer}
        caseFile={session.caseFile}
        onToggleAside={view.tight ? () => setAsideOpen((open) => !open) : undefined}
        asideOpen={asideOpen}
        onConnectAgent={() => setConnecting(true)}
        onCheckAccess={() => setCheckingAccess(true)}
        onOpenHistory={() => setBrowsingHistory(true)}
      />

      {/*
        칸 목록을 실제로 그리는 것만으로 만든다.

        예전에는 설정 칸이 접혀도 `0px` 짜리 칸을 남겨뒀는데, 그 자리에 들어갈 요소는
        안 그렸다. 그러면 나머지가 한 칸씩 앞으로 밀려서 본문이 `0px` 칸에 들어가고
        화면이 통째로 비어 보인다.
      */}
      <div
        className="relative grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: [
            showAside ? (view.narrow ? '264px' : '300px') : null,
            'minmax(0,1fr)',
            detailOpen && !detailFloats ? '380px' : null,
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >
        {showAside && (
          <ScanPanel
            form={form}
            onChange={setForm}
            onScan={() => {
              closeDetail()
              void session.run(form)
            }}
            scanning={session.scanning}
            progress={session.progress}
            onFocusField={setFocusedField}
            gh={session.github}
          />
        )}

        <main
          className="grid min-h-0"
          style={{ gridTemplateRows: `minmax(0,1fr) 7px ${dockHeight}px` }}
        >
          {/* 하늘 + 땅. 모루는 지표면 위를 다닌다 */}
          <div className="relative min-h-0 overflow-hidden">
            <Ground
              caseFile={session.caseFile}
              scanning={session.scanning}
              progress={session.progress}
              selectedRepo={selectedBranch?.repo ?? selectedFinding?.repo ?? null}
              onSelectRepo={(repo) => {
                const first = session.caseFile?.branches.find((b) => b.repo === repo)
                if (!first) return
                setSelectedBranch(first)
                setSelectedFinding(null)
              }}
              onSelectFinding={openFinding}
            />

            <Celebrate kind={session.finale?.kind ?? null} seed={session.finale?.seed ?? 0} />

            <Mole
              mood={mole.mood}
              say={mole.say}
              progress={
                session.progress
                  ? session.progress.current / Math.max(1, session.progress.total)
                  : undefined
              }
              bottom={GROUND_H - PIXEL}
            />
          </div>

          <DockResizer height={dockHeight} max={maxDock} onChange={setDockHeightWanted} />

          <Dock
            caseFile={session.caseFile}
            log={session.log}
            busy={session.scanning}
            onOpenFinding={openFinding}
            onOpenFile={openFile}
          />
        </main>

        {detailOpen &&
          (detailFloats ? (
            <div className="absolute inset-y-0 right-0 z-40 w-[360px] shadow-[-14px_0_28px_rgb(0_0_0/0.45)]">
              <DetailPanel
                finding={selectedFinding}
                branch={selectedBranch}
                caseFile={session.caseFile}
                gh={session.github}
                onClose={closeDetail}
                onOpenFile={openFile}
              />
            </div>
          ) : (
            <DetailPanel
              finding={selectedFinding}
              branch={selectedBranch}
              caseFile={session.caseFile}
              gh={session.github}
              onClose={closeDetail}
              onOpenFile={openFile}
            />
          ))}
      </div>

      <StatusBar
        caseFile={session.caseFile}
        onExport={() => {
          session.exportCase()
          reactMole('exported')
        }}
        onRestore={() => setRestoring(true)}
        error={session.authError ?? session.error}
      />

      {restoring && session.caseFile && (
        <RestoreDialog
          caseFile={session.caseFile}
          gh={session.github}
          onClose={() => setRestoring(false)}
          onFinished={(result) => {
            const done = result.entries.filter((e) => e.outcome === 'ok').length
            const failed = result.entries.filter((e) => e.outcome === 'failed')
            session.push('diff', tr().console.restored(done))
            for (const entry of failed) {
              session.push('warn', `${entry.repo}/${entry.branch}: ${entry.error}`)
            }
            reactMole(failed.length > 0 ? 'restoreFailed' : 'restored')
          }}
        />
      )}

      {selectedFile && (
        <FileModal
          caseFile={session.caseFile}
          target={selectedFile}
          gh={session.github}
          onPick={setSelectedFile}
          onClose={() => setSelectedFile(null)}
        />
      )}

      {browsingHistory && (
        <CaseHistory
          onOpen={(caseFile) => {
            session.setCaseFile(caseFile)
            setBrowsingHistory(false)
            // 지난 사건을 열면 지금 골라둔 것들은 그 사건의 것이 아니다
            setSelectedFinding(null)
            setSelectedBranch(null)
            setSelectedFile(null)
          }}
          onClose={() => setBrowsingHistory(false)}
        />
      )}

      {checkingAccess && (
        <AccessModal
          gh={session.github}
          orgs={form.scope.orgs}
          repos={form.scope.repos}
          onClose={() => setCheckingAccess(false)}
        />
      )}

      {connecting && <ConnectAgent onClose={() => setConnecting(false)} />}

      {askLanguage && <LanguageGate onPick={() => setAskLanguage(false)} />}

      {booting && (
        <Preloader
          viewer={session.viewer}
          authError={session.authError}
          onRetry={session.checkAuth}
          onDone={() => setBooting(false)}
        />
      )}
    </div>
  )
}
