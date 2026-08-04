import { useTr } from '../../i18n'
import { useEffect, type ReactNode } from 'react'

/**
 * 창 위에 뜨는 상자.
 *
 * 닫는 길을 세 개 둔다. 바깥 누르기, Esc, 닫기 버튼.
 * 하나만 있으면 사람은 자기가 아는 방법으로 시도했다가 안 닫히면 갇혔다고 느낀다.
 *
 * 바깥 누르기는 **누른 곳과 뗀 곳이 모두 바깥일 때만** 닫는다.
 * 안에서 글자를 드래그하다가 바깥에서 손을 떼면 닫히는 게 제일 짜증나는 동작이라서다.
 */
export function Modal({
  title,
  onClose,
  children,
  width = 580,
  height,
  closeLabel,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
  /** 정해두면 내용이 바뀌어도 상자가 안 늘었다 줄었다 한다 */
  height?: number
  closeLabel?: string
}) {
  const t = useTr()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return
        const backdrop = e.currentTarget
        const finish = (up: PointerEvent) => {
          backdrop.removeEventListener('pointerup', finish)
          if (up.target === backdrop) onClose()
        }
        backdrop.addEventListener('pointerup', finish)
      }}
    >
      <div
        className="flex flex-col bg-[var(--color-panel)]"
        style={{
          width,
          height,
          maxHeight: '100%',
          boxShadow:
            '0 -3px 0 var(--color-edge), 0 3px 0 var(--color-edge), -3px 0 0 var(--color-edge), 3px 0 0 var(--color-edge)',
        }}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-edge)] px-4 py-3">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
          >
            {closeLabel ?? t.common.close}
          </button>
        </header>

        {children}
      </div>
    </div>
  )
}
