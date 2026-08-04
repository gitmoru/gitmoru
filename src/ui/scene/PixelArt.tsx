import type { CSSProperties, ReactNode } from 'react'

import { PALETTE } from './sprites'

/** 도트 한 칸을 화면에서 몇 픽셀로 그릴지. 장면 전체가 이 배율을 기준으로 맞춰져 있다. */
export const PIXEL = 3

type Props = {
  /** 한 줄이 한 행인 도트 그림. `.` 은 투명. */
  rows: string[]
  /** 도트 한 칸의 크기 */
  scale?: number
  /**
   * 색 갈아끼우기.
   * 같은 구름 그림을 낮에는 흰색으로, 밤에는 남색으로 쓰는 식이다.
   */
  swap?: Record<string, string>
  /** 팔레트를 무시하고 전부 한 색으로. 흙두덩처럼 단색인 그림에 쓴다. */
  fill?: string
  className?: string
  style?: CSSProperties
  /** 그림 위에 덧그릴 것. 좌표는 도트 칸 단위다. */
  children?: ReactNode
}

/**
 * 도트 그림을 SVG 사각형으로 그린다.
 *
 * 장면에 있는 것들(모루, 구름, 흙, 두덩)이 전부 이걸 쓴다.
 * 예전에는 파일마다 같은 이중 반복문을 따로 두고 있었는데,
 * 그러면 `shapeRendering` 하나 빠뜨린 곳만 뿌옇게 나오고 원인을 찾기 어렵다.
 */
export function PixelArt({ rows, scale = PIXEL, swap, fill, className, style, children }: Props) {
  const width = rows[0]?.length ?? 0

  return (
    <svg
      width={width * scale}
      height={rows.length * scale}
      viewBox={`0 0 ${width} ${rows.length}`}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {rows.map((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={fill ?? swap?.[ch] ?? PALETTE[ch]}
            />
          ),
        ),
      )}
      {children}
    </svg>
  )
}
