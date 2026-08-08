import { tr } from '../../i18n'
import { motion } from 'motion/react'
import { PixelArt, PIXEL } from './PixelArt'
import { CLOUD, CLOUD_SMALL, MOON } from './sprites'

/**
 * 하늘.
 *
 * 모루가 서 있는 곳이 땅이고 그 위는 하늘이다.
 *
 * **지금 시각에 따라 색이 바뀐다.** 새벽에 켜면 새벽 하늘이 뜬다.
 * 밤사이 일어난 일을 아침에 알아보는 자리를 위해 만든 도구라, 화면이 그 시간을 같이 살고 있으면
 * 지금 무슨 상황인지 몸으로 느껴진다.
 *
 * 그라디언트 대신 **띠를 몇 겹 쌓아** 색이 단계로 바뀌게 했다 - 도트 화면이니까.
 */



type Phase = 'night' | 'dawn' | 'morning' | 'day' | 'dusk' | 'evening'

interface SkyLook {
  /** [위쪽, 지평선쪽]. 사이를 잘게 나눠 칠한다. */
  bands: [string, string]
  star: number // 별 밝기 0~1
  body: 'moon' | 'sun' | null
  bodyColor: [string, string] // [테두리, 안쪽]
  cloud: [string, string] // [그림자, 몸]
}

const LOOKS: Record<Phase, SkyLook> = {
  night: {
    bands: ['#0e1324', '#1a2240'],
    star: 1,
    body: 'moon',
    bodyColor: ['#8a7f5c', '#d8cb9a'],
    cloud: ['#2b3350', '#3b4568'],
  },
  dawn: {
    bands: ['#171c38', '#4a3a58'],
    star: 0.45,
    body: 'moon',
    bodyColor: ['#7d7360', '#c9bd9c'],
    cloud: ['#3f3a5c', '#584f70'],
  },
  morning: {
    bands: ['#2f4c68', '#5b86a4'],
    star: 0,
    body: 'sun',
    bodyColor: ['#c9a05a', '#f0d79a'],
    cloud: ['#6b8aa5', '#93aec4'],
  },
  day: {
    bands: ['#345875', '#628fb0'],
    star: 0,
    body: 'sun',
    bodyColor: ['#c9a85a', '#f5e2a8'],
    cloud: ['#7396b0', '#a3bccf'],
  },
  dusk: {
    bands: ['#23223f', '#7a4a4a'],
    star: 0.2,
    body: 'sun',
    bodyColor: ['#a8663c', '#e8a463'],
    cloud: ['#4f3d5c', '#6b5170'],
  },
  evening: {
    bands: ['#12162c', '#33304f'],
    star: 0.75,
    body: 'moon',
    bodyColor: ['#857a5d', '#cfc199'],
    cloud: ['#2f3350', '#42476a'],
  },
}

/** 한국시간 기준 지금이 어느 때인지 */
export function skyPhase(hour = kstHour()): Phase {
  if (hour >= 22 || hour < 4) return 'night'
  if (hour < 7) return 'dawn'
  if (hour < 11) return 'morning'
  if (hour < 17) return 'day'
  if (hour < 20) return 'dusk'
  return 'evening'
}

function kstHour(): number {
  const d = new Date()
  return new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60_000).getHours()
}

/** 두 색 사이를 n단계로 나눈다. 단계를 잘게 쪼개면 경계가 안 보인다. */
function ramp(from: string, to: string, steps: number): string[] {
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const a = hex(from)
  const b = hex(to)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    const c = a.map((v, k) => Math.round(v + (b[k]! - v) * t))
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  })
}

const BAND_STEPS = 14

const STARS: Array<[number, number, number]> = [
  [8, 22, 1],
  [17, 12, 1],
  [24, 40, 0.6],
  [33, 18, 1],
  [41, 30, 0.7],
  [52, 14, 1],
  [58, 36, 0.6],
  [67, 20, 1],
  [74, 44, 0.7],
  [83, 16, 1],
  [91, 32, 0.8],
  [96, 24, 0.6],
]

function Cloud({
  data,
  top,
  duration,
  delay,
  colors,
  scale,
}: {
  data: string[]
  top: number
  duration: number
  delay: number
  colors: [string, string]
  scale: number
}) {
  return (
    <motion.div
      className="absolute"
      style={{ top }}
      initial={{ left: '-20%' }}
      animate={{ left: '112%' }}
      transition={{ duration, delay, repeat: Infinity, ease: 'linear' }}
    >
      <PixelArt rows={data} scale={scale} swap={{ g: colors[0], h: colors[1] }} />
    </motion.div>
  )
}

/** 해 - 달과 같은 모양을 색만 바꿔 쓴다 */
function Body({ look }: { look: SkyLook }) {
  if (!look.body) return null
  return (
    <div className="absolute" style={{ right: 44, top: 20 }}>
      <PixelArt rows={MOON} swap={{ i: look.bodyColor[0], j: look.bodyColor[1] }} />
    </div>
  )
}

export function Sky({ className = '' }: { className?: string }) {
  const look = LOOKS[skyPhase()]

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* 띠를 잘게 쌓아 만든 하늘. 도트 느낌은 남기되 경계는 안 보이게. */}
      <div className="absolute inset-0 flex flex-col">
        {ramp(look.bands[0], look.bands[1], BAND_STEPS).map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      {look.star > 0 &&
        STARS.map(([x, y, o], i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${x}%`,
              top: y,
              width: PIXEL,
              height: PIXEL,
              background: '#d5dcee',
              opacity: o * look.star,
            }}
          />
        ))}

      <Body look={look} />

      {/*
        구름은 여러 겹으로 흘린다. 높이 뜬 것은 느리게, 낮은 것은 빠르게.
        속도가 다 같으면 벽지처럼 보이고, 층이 지면 깊이가 생긴다.
      */}
      <Cloud data={CLOUD} top={28} duration={62} delay={0} colors={look.cloud} scale={PIXEL} />
      <Cloud data={CLOUD_SMALL} top={66} duration={44} delay={9} colors={look.cloud} scale={PIXEL} />
      <Cloud data={CLOUD} top={112} duration={34} delay={3} colors={look.cloud} scale={PIXEL + 1} />
      <Cloud data={CLOUD_SMALL} top={154} duration={26} delay={16} colors={look.cloud} scale={PIXEL + 1} />
      <Cloud data={CLOUD} top={196} duration={21} delay={7} colors={look.cloud} scale={PIXEL + 2} />
      <Cloud data={CLOUD_SMALL} top={238} duration={16} delay={12} colors={look.cloud} scale={PIXEL + 2} />
    </div>
  )
}

/** 상태 줄에 쓸 한 마디 */
export function skyLabel(): string {
  return tr().scene.sky[skyPhase()]
}
