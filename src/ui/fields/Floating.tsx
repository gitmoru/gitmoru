import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * 입력칸 아래에 붙여 띄우는 목록.
 *
 * 그냥 `absolute` 로 두면 사이드바가 스크롤 영역이라 잘려 나간다.
 * 그렇다고 인라인으로 두면 아래 내용을 밀어내서 몇 개만 보여줄 수밖에 없다.
 *
 * 그래서 화면 최상단으로 빼서(portal) 좌표만 따라가게 한다.
 * 잘리지도 않고 밀어내지도 않으며, 길면 그 안에서 스크롤한다.
 */

interface Props {
  /** 기준이 되는 입력칸 */
  anchor: HTMLElement | null
  open: boolean
  children: React.ReactNode
  /** 목록 최대 높이 */
  maxHeight?: number
}

export function Floating({ anchor, open, children, maxHeight = 220 }: Props) {
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null)

  const measure = () => {
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    setBox({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  useLayoutEffect(() => {
    if (open) measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor])

  // 창을 굴리거나 크기를 바꾸면 따라간다
  useEffect(() => {
    if (!open) return
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor])

  if (!open || !box) return null

  return createPortal(
    <div
      className="fixed z-[80] overflow-y-auto bg-[var(--color-panel)]"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        maxHeight,
        boxShadow:
          '0 -2px 0 var(--color-edge), 0 2px 0 var(--color-edge), -2px 0 0 var(--color-edge), 2px 0 0 var(--color-edge), 4px 6px 0 rgb(0 0 0 / 0.4)',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
