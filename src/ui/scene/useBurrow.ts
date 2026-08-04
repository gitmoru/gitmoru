import { useEffect, useRef, useState } from 'react'

import type { MoleMood } from './moleMotion'

/** 굴을 파는 데 걸리는 시간표 (밀리초) */
const DIVE_TO_MOVE = 280 // 들어가고 나서 자리를 옮기기까지
const MOVE_TO_SURFACE = 940 // 옮기고 나서 올라오기까지
const STUCK_LIMIT = 2600 // 이보다 오래 땅속에 있으면 억지로 올린다
const CURSOR_SETTLE = 450 // 마우스가 멈춘 걸로 치는 시간

/** 화면 가장자리에 끼지 않게 하는 여유 */
const LEFT_EDGE = 0.06
const RIGHT_EDGE = 0.92

type Result = {
  /** 가로 위치. 0 이 왼쪽 끝, 1 이 오른쪽 끝. */
  x: number
  /** 바라보는 쪽. 1 이 오른쪽. */
  facing: number
  /** 지금 땅속에 있는지 */
  underground: boolean
  /** 올라온 횟수. 흙알갱이를 다시 튀게 하는 신호로 쓴다. */
  landings: number
}

/**
 * 모루를 자리에서 자리로 옮긴다.
 *
 * 걸어서 가지 않고 **땅속으로 들어갔다가 목표 지점에서 올라온다.**
 * 두더지가 화면을 가로질러 걸어가면 두더지로 안 보이기 때문이다.
 *
 * 옮기는 이유는 두 가지다.
 *   - 훑는 중이면 진행률만큼 오른쪽으로 (`progress`)
 *   - 그 외에는 마우스가 **멈춘 뒤에** 그쪽으로
 *
 * 마우스를 따라 실시간으로 움직이면 커서에 붙은 장식처럼 보인다.
 * 멈춘 다음에 따라와야 스스로 온 것처럼 읽힌다.
 */
export function useBurrow(
  hostRef: React.RefObject<HTMLElement | null>,
  mood: MoleMood,
  progress: number | undefined,
  followCursor: boolean,
): Result {
  const [x, setX] = useState(0.5)
  const [facing, setFacing] = useState(1)
  const [underground, setUnderground] = useState(false)
  const [landings, setLandings] = useState(0)

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const currentX = useRef(x)
  currentX.current = x

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const burrowTo = (target: number) => {
    const from = currentX.current
    if (Math.abs(target - from) < 0.05) return

    clearTimers()
    setFacing(target >= from ? 1 : -1)
    setUnderground(true)
    timers.current.push(
      setTimeout(() => setX(target), DIVE_TO_MOVE),
      setTimeout(() => {
        setUnderground(false)
        setLandings((n) => n + 1)
      }, MOVE_TO_SURFACE),
    )
  }

  // 훑는 동안에는 진행률만큼 오른쪽으로 옮겨간다
  useEffect(() => {
    if (mood !== 'digging' || progress === undefined) return
    burrowTo(LEFT_EDGE + 0.02 + progress * 0.82)
    // 진행률을 8단계로 뭉뚱그린다. 매 % 마다 굴을 파면 계속 땅속에만 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, progress && Math.round(progress * 8)])

  // 마우스가 멈춘 뒤에 그쪽으로 굴을 판다
  useEffect(() => {
    if (!followCursor || mood === 'digging') return
    let settle: ReturnType<typeof setTimeout> | null = null

    const onMove = (event: PointerEvent) => {
      const host = hostRef.current
      if (!host) return

      const rect = host.getBoundingClientRect()
      const ratio = (event.clientX - rect.left) / Math.max(1, rect.width)
      if (ratio < -0.1 || ratio > 1.1) return

      if (settle) clearTimeout(settle)
      settle = setTimeout(
        () => burrowTo(Math.min(RIGHT_EDGE, Math.max(LEFT_EDGE, ratio))),
        CURSOR_SETTLE,
      )
    }

    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (settle) clearTimeout(settle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followCursor, mood])

  // 땅속에 너무 오래 있으면 억지로 올라온다. 타이머가 어긋났을 때의 안전장치다.
  useEffect(() => {
    if (!underground) return
    const timer = setTimeout(() => setUnderground(false), STUCK_LIMIT)
    return () => clearTimeout(timer)
  }, [underground])

  useEffect(() => clearTimers, [])

  return { x, facing, underground, landings }
}
