import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { PixelArt, PIXEL } from './PixelArt'
import { SpeechBubble } from './SpeechBubble'
import { LOOKING_AROUND, MOTIONS, SETTLE_AFTER, WAKING_UP, type MoleMood } from './moleMotion'
import { FRAME_BLINK, PALETTE, SEQ_MOUND, SPRITE_H, SPRITE_W } from './sprites'
import { useBurrow } from './useBurrow'
import { useFrameLoop } from './useFrameLoop'

/**
 * 모루 - 맨홀 뚜껑을 쓴 두더지.
 *
 * 이 파일은 **보이는 것만** 맡는다.
 *   - 어떤 그림을 넘길지는 `moleMotion.ts`
 *   - 어디로 옮겨갈지는 `useBurrow.ts`
 *   - 도트를 어떻게 찍을지는 `PixelArt.tsx`
 */

export type { MoleMood }

const BODY_W = SPRITE_W * PIXEL
const BODY_H = SPRITE_H * PIXEL

/** 깜빡임과 두리번 주기 (밀리초) */
const BLINK_EVERY = 4200
const BLINK_FOR = 110
const LOOK_EVERY = 11_000
const LOOK_FOR = 2400
const WAKE_FOR = 620

/** 올라올 때 튀는 흙알갱이. 한 칸짜리 도트가 흩어진다. */
function DirtSpray({ seed }: { seed: number }) {
  const spread = [-15, -9, -4, 3, 9, 14]
  return (
    <>
      {spread.map((dx, i) => (
        <motion.span
          key={`${seed}-${i}`}
          className="absolute bottom-1 left-1/2"
          style={{ width: PIXEL, height: PIXEL, background: PALETTE['9'] }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: dx, y: -13 - (i % 3) * 6, opacity: 0 }}
          transition={{ duration: 0.46, ease: 'linear' }}
        />
      ))}
    </>
  )
}

/** 잘 때 새어나오는 Zzz. 작은 게 먼저 뜨고, 커지면서 멀어진다. */
function SleepBreath() {
  const puffs = [
    { char: 'z', size: 9, dx: 10, dy: -20 },
    { char: 'Z', size: 12, dx: 18, dy: -32 },
    { char: 'z', size: 8, dx: 7, dy: -16 },
  ]
  return (
    <div className="absolute -top-1 left-full ml-0.5">
      {puffs.map((puff, i) => (
        <motion.span
          key={i}
          className="absolute font-mono leading-none text-[var(--color-muted)]"
          style={{ fontSize: puff.size }}
          initial={{ opacity: 0, x: 0, y: 0, rotate: -8 }}
          animate={{ opacity: [0, 0.9, 0.9, 0], x: puff.dx, y: puff.dy, rotate: 10 }}
          transition={{
            duration: 3.2,
            delay: i * 1.05,
            repeat: Infinity,
            ease: 'easeOut',
            times: [0, 0.25, 0.7, 1],
          }}
        >
          {puff.char}
        </motion.span>
      ))}
    </div>
  )
}

interface Props {
  mood: MoleMood
  say?: string
  progress?: number
  followCursor?: boolean
  /** 지표면 높이. 여기에 발을 딛는다. */
  bottom?: number
}

export function Mole({ mood, say, progress, followCursor = true, bottom = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { x, facing, underground, landings } = useBurrow(hostRef, mood, progress, followCursor)

  const [blinking, setBlinking] = useState(false)
  const [lookingAround, setLookingAround] = useState(false)
  const [settled, setSettled] = useState(false)
  const [waking, setWaking] = useState(false)
  const wasSleeping = useRef(false)

  // 자고 있다가 사용자가 움직이면 깜짝 놀라며 깬다
  useEffect(() => {
    if (mood === 'sleep') {
      wasSleeping.current = true
      setWaking(false)
      return
    }
    if (!wasSleeping.current) return
    wasSleeping.current = false
    setWaking(true)
    const timer = setTimeout(() => setWaking(false), WAKE_FOR)
    return () => clearTimeout(timer)
  }, [mood])

  // 신난 표정은 잠깐만. 계속 뛰고 있으면 정신없다.
  useEffect(() => {
    setSettled(false)
    const after = SETTLE_AFTER[mood]
    if (!after) return
    const timer = setTimeout(() => setSettled(true), after)
    return () => clearTimeout(timer)
  }, [mood])

  // 평소에는 이따금 깜빡이고, 가끔 좌우를 둘러본다
  useEffect(() => {
    if (mood !== 'idle') return

    const blinkTimer = setInterval(() => {
      setBlinking(true)
      setTimeout(() => setBlinking(false), BLINK_FOR)
    }, BLINK_EVERY)

    const lookTimer = setInterval(() => {
      setLookingAround(true)
      setTimeout(() => setLookingAround(false), LOOK_FOR)
    }, LOOK_EVERY)

    return () => {
      clearInterval(blinkTimer)
      clearInterval(lookTimer)
    }
  }, [mood])

  const shownMood: MoleMood = settled && SETTLE_AFTER[mood] ? 'idle' : mood

  const active = waking
    ? { key: 'wake', ...WAKING_UP }
    : shownMood === 'idle' && lookingAround
      ? { key: 'look', ...LOOKING_AROUND }
      : { key: shownMood, ...MOTIONS[shownMood] }

  const frame = useFrameLoop(active.key, active.frames, active.fps, active.loop)
  const moundFrame = useFrameLoop('mound', SEQ_MOUND, 6, true)

  const blinkNow = !waking && shownMood === 'idle' && blinking && !lookingAround
  const body = blinkNow ? FRAME_BLINK : frame

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-x-0 z-30 h-[120px]"
      style={{ bottom }}
    >
      <motion.div
        className="absolute bottom-0 flex flex-col items-center"
        animate={{ left: `${x * 100}%` }}
        transition={{ type: 'spring', stiffness: 55, damping: 15 }}
        style={{ x: '-50%' }}
      >
        <AnimatePresence>
          {say && !underground && <SpeechBubble key={say} sentence={say} x={x} />}
        </AnimatePresence>

        <div className="relative">
          {shownMood === 'sleep' && <SleepBreath />}

          {/* 땅 위로 나온 만큼만 보이게 자른다 */}
          <div className="overflow-hidden" style={{ height: BODY_H, width: BODY_W }}>
            <motion.div
              animate={{
                y: underground ? BODY_H : shownMood === 'sleep' ? 2 : 0,
                rotate: shownMood === 'sleep' ? 4 : 0,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              style={{ transform: `scaleX(${facing})`, transformOrigin: 'bottom center' }}
            >
              <PixelArt rows={body} />
            </motion.div>
          </div>

          {!underground && landings > 0 && <DirtSpray seed={landings} />}
        </div>

        {/* 땅속을 지날 때 솟는 흙두덩 */}
        {underground && (
          <div className="absolute bottom-0">
            <PixelArt rows={moundFrame} />
          </div>
        )}
      </motion.div>
    </div>
  )
}
