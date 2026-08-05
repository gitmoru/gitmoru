import type { GitHubClient } from '../../core/github'
import type { FileTarget } from '../../core/types'
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
 * 그래서 창 가운데에 크게 띄운다. 읽고 나면 닫고 원래 보던 목록으로 돌아간다.
 * 옆 칸과 달리 목록을 밀어내지도 않는다.
 */
export function FileModal({
  file,
  gh,
  onClose,
}: {
  file: FileTarget
  gh: GitHubClient | null
  onClose: () => void
}) {
  const t = useTr()
  const view = useViewport()

  // 창이 작으면 창에 맞추고, 크면 읽기 편한 폭에서 멈춘다. 너무 넓으면 눈이 줄을 놓친다.
  const width = Math.min(1040, Math.max(560, view.w - 96))
  const height = Math.max(360, view.h - 120)

  return (
    <Modal title={t.detail.whatChanged} onClose={onClose} width={width} height={height}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3">
          <p className="truncate font-mono text-[12px] text-[var(--color-text)]">{file.path}</p>
          <p className="truncate font-mono text-[10.5px] text-[var(--color-muted)]">
            {file.repo} / {file.branch}
          </p>
        </div>

        <DiffView
          gh={gh}
          repo={file.repo}
          path={file.path}
          baseRef={file.baseSha}
          headRef={file.headSha}
          kind={file.kind}
          sizeAfter={file.sizeAfter}
          autoLoad
        />
      </div>
    </Modal>
  )
}
