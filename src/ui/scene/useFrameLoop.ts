import { useEffect, useState } from 'react'

/**
 * 도트 그림을 순서대로 넘긴다. loop 가 아니면 마지막 장에서 멈춘다.
 *
 * `key` 로만 타이머를 다시 건다. frames 배열은 매 렌더마다 새 참조라
 * 의존성에 넣으면 타이머가 계속 새로 걸려서 그림이 첫 장에 붙어버린다.
 */
export function useFrameLoop(key: string, frames: string[][], fps: number, loop: boolean) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (frames.length < 2) return

    const timer = setInterval(() => {
      setIndex((current) => {
        const next = current + 1
        if (next < frames.length) return next
        if (loop) return 0
        clearInterval(timer)
        return frames.length - 1
      })
    }, 1000 / fps)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return frames[Math.min(index, frames.length - 1)] ?? frames[0]!
}

/**
 * 글자를 하나씩 찍어낸다.
 *
 * 말풍선이 통째로 툭 나타나면 안내문처럼 읽힌다.
 * 한 글자씩 찍혀야 그제야 "말하는" 것처럼 보인다.
 */
export function useTypewriter(sentence: string, charsPerSecond = 26) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(0)
    if (!sentence) return

    const timer = setInterval(() => {
      setCount((current) => {
        if (current < sentence.length) return current + 1
        clearInterval(timer)
        return current
      })
    }, 1000 / charsPerSecond)

    return () => clearInterval(timer)
  }, [sentence, charsPerSecond])

  return { shown: sentence.slice(0, count), done: count >= sentence.length }
}
