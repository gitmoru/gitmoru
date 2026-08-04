import { motion } from 'motion/react'

/**
 * 다 판 순간의 연출.
 *
 * 두 가지가 있고, **뜻이 다르다.**
 *
 *   sparkle - 걸린 게 없을 때. 조용히 반짝이고 사라진다.
 *   alert   - 눈에 띄는 게 나왔을 때. 화면이 한 번 물들고 흙이 튄다.
 *
 * 후자를 더 요란하게 만드는 게 핵심이다. 사고 대응 도구에서
 * "찾았다"는 신호를 놓치면 그게 제일 큰 실패다.
 *
 * 다만 어느 쪽도 "안전합니다"를 뜻하지 않는다. 반짝임은 축하가 아니라
 * "여기까지 다 봤어요" 라는 표시다.
 */

const PX = 3

interface Props {
  kind: 'sparkle' | 'alert' | null
  /** 다시 틀 때마다 바뀌는 값 */
  seed: number
}

export function Celebrate({ kind, seed }: Props) {
  if (!kind) return null

  const alert = kind === 'alert'
  const count = alert ? 26 : 14
  const color = alert ? 'var(--color-apricot)' : 'var(--color-moss)'

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {/* 눈에 띄는 게 나오면 화면이 한 번 물든다 */}
      {alert && (
        <motion.div
          key={`flash-${seed}`}
          className="absolute inset-0"
          style={{ background: 'var(--color-apricot)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.16, 0, 0.1, 0] }}
          transition={{ duration: 0.9, ease: 'linear' }}
        />
      )}

      {Array.from({ length: count }, (_, i) => {
        const x = 4 + ((i * 37) % 92)
        const size = alert && i % 3 === 0 ? PX * 2 : PX
        return (
          <motion.span
            key={`${seed}-${i}`}
            className="absolute"
            style={{ left: `${x}%`, bottom: 20, width: size, height: size, background: color }}
            initial={{ y: 0, opacity: 0 }}
            animate={{
              y: -(alert ? 150 : 90) - (i % 5) * 18,
              x: ((i % 7) - 3) * 9,
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: alert ? 1.5 : 1.1,
              delay: (i % 6) * 0.07,
              ease: 'linear',
            }}
          />
        )
      })}
    </div>
  )
}
