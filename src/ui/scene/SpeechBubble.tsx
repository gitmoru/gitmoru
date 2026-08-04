import { motion } from 'motion/react'

import { PIXEL } from './PixelArt'
import { useTypewriter } from './useFrameLoop'

/** 가장자리에서는 말풍선을 안쪽으로 밀어야 화면 밖으로 안 나간다. */
const NEAR_LEFT = 0.18
const NEAR_RIGHT = 0.82

/**
 * 모루가 하는 말.
 *
 * 글자가 하나씩 찍히는 동안 상자가 아주 살짝 떨린다.
 * 말풍선이 완성된 채로 툭 뜨면 안내문이 되고, 찍히는 걸 보면 말이 된다.
 */
export function SpeechBubble({ sentence, x }: { sentence: string; x: number }) {
  const typed = useTypewriter(sentence)

  const side = x < NEAR_LEFT ? 'left' : x > NEAR_RIGHT ? 'right' : 'center'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
      className="relative mb-3"
      style={{
        alignSelf: side === 'left' ? 'flex-start' : side === 'right' ? 'flex-end' : 'center',
      }}
    >
      <motion.div
        className="max-w-[260px] bg-[var(--color-panel)] px-3 py-2 text-[11.5px] leading-relaxed"
        animate={{ scale: typed.done ? 1 : [1, 1.015, 1] }}
        transition={{ duration: 0.16, repeat: typed.done ? 0 : Infinity }}
        style={{
          boxShadow:
            '0 -3px 0 var(--color-edge), 0 3px 0 var(--color-edge), -3px 0 0 var(--color-edge), 3px 0 0 var(--color-edge)',
        }}
      >
        {typed.shown}
        {!typed.done && <span className="caret">|</span>}
      </motion.div>

      {/* 꼬리. 도트 두 칸으로 그린다. */}
      <svg
        width={PIXEL * 4}
        height={PIXEL * 2}
        viewBox="0 0 4 2"
        shapeRendering="crispEdges"
        className="absolute top-full"
        style={{
          left: side === 'right' ? undefined : side === 'left' ? 12 : '50%',
          right: side === 'right' ? 12 : undefined,
          transform: side === 'center' ? 'translateX(-50%)' : undefined,
        }}
        aria-hidden="true"
      >
        <rect x={0} y={0} width={4} height={1} fill="var(--color-panel)" />
        <rect x={1} y={1} width={2} height={1} fill="var(--color-panel)" />
      </svg>
    </motion.div>
  )
}
