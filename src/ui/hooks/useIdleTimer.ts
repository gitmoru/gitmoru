import { useEffect, useState } from 'react'

/** 사람이 만졌다고 볼 사건들 */
const ACTIVITY = ['pointerdown', 'keydown', 'pointermove'] as const

/**
 * 마지막 조작 이후 흐른 시간(밀리초).
 *
 * 한참 두면 모루가 잔다. 화면이 멈춘 그림이 아니라 시간을 같이 보내는 것처럼 보이게 하는 장치다.
 */
export function useIdleTimer(): number {
  const [idleMs, setIdleMs] = useState(0)

  useEffect(() => {
    // 이미 0이면 그대로 둔다. 마우스를 움직일 때마다 다시 그리면 화면 전체가 출렁인다.
    const reset = () => setIdleMs((n) => (n === 0 ? n : 0))
    ACTIVITY.forEach((name) => window.addEventListener(name, reset))

    const tick = setInterval(() => setIdleMs((n) => n + 1000), 1000)
    return () => {
      ACTIVITY.forEach((name) => window.removeEventListener(name, reset))
      clearInterval(tick)
    }
  }, [])

  return idleMs
}
