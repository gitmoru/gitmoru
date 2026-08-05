import type { GitHubClient } from '../../core/github'
import { formatBytes } from '../../core/safeText'
import type { CaseFile, FileTarget } from '../../core/types'
import { useTr } from '../../i18n'
import { Modal } from '../chrome/Modal'
import { useViewport } from '../hooks/useViewport'
import { DiffView } from './DiffView'

/**
 * 파일 하나를 크게 펼쳐 보는 자리.
 *
 * 처음에는 오른쪽 칸에 넣었는데 그게 틀렸다. 파일은 **가로가 필요하다.**
 * 380px 짜리 칸에 코드를 넣으면 거의 모든 줄이 접히고, 접힌 줄은 diff 로 못 읽는다.
 * 어디가 바뀌었는지 보려고 여는 화면인데 정작 그걸 못 보게 된다.
 *
 * 왼쪽에 같은 브랜치의 바뀐 파일을 늘어놓는다. 한 브랜치에 수십 개가 바뀐 경우가 흔한데,
 * 하나 보고 닫고 다시 찾아 누르게 하면 목록에서 어디까지 봤는지를 사람이 외워야 한다.
 */

/** 파일 목록 칸 너비. 경로가 길어서 이보다 좁으면 뒷부분만 보인다. */
const NAV_WIDTH = 260

export function FileModal({
  caseFile,
  target,
  gh,
  onPick,
  onClose,
}: {
  caseFile: CaseFile | null
  target: FileTarget
  gh: GitHubClient | null
  onPick: (next: FileTarget) => void
  onClose: () => void
}) {
  const t = useTr()
  const view = useViewport()

  // 창이 작으면 창에 맞추고, 크면 읽기 편한 폭에서 멈춘다. 너무 넓으면 눈이 줄을 놓친다.
  const width = Math.min(1160, Math.max(560, view.w - 96))
  const height = Math.max(360, view.h - 120)

  const change = caseFile?.changes.find(
    (c) => c.repo === target.repo && c.branch === target.branch,
  )
  const siblings = change?.files ?? []
  /** 파일이 하나뿐이면 목록 칸은 자리만 차지한다 */
  const showNav = siblings.length > 1 && view.w >= 900

  return (
    <Modal title={target.branch} onClose={onClose} width={width} height={height}>
      <div className="flex min-h-0 flex-1">
        {showNav && (
          <nav
            className="min-h-0 shrink-0 overflow-y-auto border-r border-[var(--color-edge)] py-2"
            style={{ width: NAV_WIDTH }}
          >
            <p className="truncate px-3 pb-2 font-mono text-[10px] text-[var(--color-faint)]">
              {target.repo}
            </p>
            {siblings.map((file) => {
              const on = file.path === target.path
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() =>
                    onPick({
                      repo: target.repo,
                      branch: target.branch,
                      path: file.path,
                      kind: file.kind,
                      baseSha: target.baseSha,
                      headSha: target.headSha,
                      sizeAfter: file.sizeAfter,
                    })
                  }
                  className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                  style={{ background: on ? 'var(--color-edge-soft)' : undefined }}
                >
                  <span
                    className="block truncate font-mono text-[10.5px]"
                    style={{ color: on ? 'var(--color-text)' : 'var(--color-muted)' }}
                  >
                    {/* 경로는 뒤쪽이 중요하다. 자를 때는 앞을 잘라야 파일명이 남는다. */}
                    {file.path.length > 34 ? `...${file.path.slice(-31)}` : file.path}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] text-[var(--color-faint)]">
                    {t.changeList.kinds[file.kind]}
                    {file.sizeAfter !== undefined && ` · ${formatBytes(file.sizeAfter)}`}
                  </span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          <p className="mb-3 truncate font-mono text-[12px] text-[var(--color-text)]">
            {target.path}
          </p>

          <DiffView
            gh={gh}
            repo={target.repo}
            path={target.path}
            baseRef={target.baseSha}
            headRef={target.headSha}
            kind={target.kind}
            sizeAfter={target.sizeAfter}
            autoLoad
          />
        </div>
      </div>
    </Modal>
  )
}
