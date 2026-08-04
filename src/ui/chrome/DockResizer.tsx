import { useRef } from 'react'

import { reactMole } from '../scene/moleReactions'

/** 아래 칸이 가질 수 있는 최소 높이 */
const MIN_HEIGHT = 150

/**
 * 아래 칸이 위로 올릴 수 있는 한계의 이만큼을 넘으면 '많이 올렸다' 로 본다.
 * 끌 때마다 모루가 말을 걸면 시끄러우니, 이 선을 넘고 내려올 때만 한 번씩 반응한다.
 */
const TALL_AT = 0.75

/**
 * 아래 칸 높이 조절 손잡이.
 *
 * 목록이 길 때는 넓히고, 풍경을 보고 싶을 때는 줄인다.
 * 화면마다 보고 싶은 비중이 다르니 고정값으로 두지 않는다.
 */
export function DockResizer({
  height,
  max,
  onChange,
}: {
  height: number
  max: number
  onChange: (next: number) => void
}) {
  const wasTall = useRef(height > max * TALL_AT)

  /** 선을 넘나들 때만 모루에게 알린다 */
  const tellMole = (next: number) => {
    const tall = next > max * TALL_AT
    if (tall === wasTall.current) return
    wasTall.current = tall
    reactMole(tall ? 'dockTall' : 'dockShort')
  }

  return (
    <div
      className="group relative h-[7px] cursor-row-resize bg-[var(--color-edge-soft)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        const startY = e.clientY
        const startHeight = height

        const move = (ev: PointerEvent) => {
          const next = Math.min(max, Math.max(MIN_HEIGHT, startHeight - (ev.clientY - startY)))
          onChange(next)
          tellMole(next)
        }
        const stop = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', stop)
        }

        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', stop)
      }}
    >
      {/* 잡는 자리 표시 */}
      <div className="absolute inset-x-0 top-[2px] flex justify-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[3px] w-[3px] bg-[var(--color-faint)] group-hover:bg-[var(--color-moss)]"
          />
        ))}
      </div>
    </div>
  )
}
