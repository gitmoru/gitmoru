import { useEffect, useState } from 'react'

/**
 * 창 크기.
 *
 * 화면을 넓을 때 기준으로만 짜두면 좁힌 순간 다 무너진다.
 * 어디서 무엇을 접을지 한 곳에서 정한다.
 */

export interface Viewport {
  w: number
  h: number
  /** 사이드바와 상세를 나란히 두기엔 좁다 */
  narrow: boolean
  /** 사이드바까지 접어야 할 만큼 좁다 */
  tight: boolean
  /** 위아래로 짧다 - 풍경과 아래 칸을 줄인다 */
  short: boolean
}

export function useViewport(): Viewport {
  const [size, setSize] = useState(() => ({
    w: typeof window === 'undefined' ? 1440 : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))

  useEffect(() => {
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() =>
        setSize({ w: window.innerWidth, h: window.innerHeight }),
      )
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return {
    ...size,
    narrow: size.w < 1180,
    tight: size.w < 900,
    short: size.h < 720,
  }
}
