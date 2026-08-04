import { PixelArt, PIXEL } from './PixelArt'
import { PEBBLE, ROOT, SOIL_TILE, WORM } from './sprites'

/**
 * 흙 배경 - 도트 타일을 반복해서 채운다.
 *
 * CSS 그라디언트로 흙 질감을 흉내내면 캐릭터 도트랑 따로 논다.
 * 배경도 같은 격자 위에서 같은 크기의 픽셀로 찍혀야 한 화면으로 보인다.
 */


const TILE = SOIL_TILE[0]!.length

/** 이름을 숫자로. 같은 이름이면 항상 같은 배치가 나온다. */
function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 반복될 흙 타일 하나를 패턴으로 정의한다 */
function SoilPattern({ id, base, grain }: { id: string; base: string; grain: string }) {
  return (
    <pattern id={id} width={TILE * PIXEL} height={TILE * PIXEL} patternUnits="userSpaceOnUse">
      <rect width={TILE * PIXEL} height={TILE * PIXEL} fill={base} />
      {SOIL_TILE.map((row, y) =>
        [...row].map((ch, x) =>
          ch === '9' ? (
            <rect key={`${x}-${y}`} x={x * PIXEL} y={y * PIXEL} width={PIXEL} height={PIXEL} fill={grain} />
          ) : null,
        ),
      )}
    </pattern>
  )
}

const PROPS = [PEBBLE, ROOT, WORM, PEBBLE]

interface Props {
  /** 층 이름 - 소품 배치를 고정하는 데 쓴다 */
  seed: string
  /** 흙 바탕색 */
  base: string
  /** 알갱이색 */
  grain: string
  /** 흩어 놓을 소품 수 */
  props?: number
}

/**
 * 지층 하나의 배경.
 * 부모에 `position: relative` 가 있어야 한다.
 */
export function Soil({ seed, base, grain, props = 4 }: Props) {
  const id = `soil-${hash(seed) % 100000}`
  const h = hash(seed)

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="h-full w-full" aria-hidden="true">
        <defs>
          <SoilPattern id={id} base={base} grain={grain} />
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>

      {/* 흙 속에 묻힌 것들 */}
      {Array.from({ length: props }, (_, i) => {
        const n = hash(`${seed}:${i}`)
        return (
          <PixelArt
            key={i}
            rows={PROPS[(h + i) % PROPS.length]!}
            scale={2}
            className="absolute"
            style={{
              left: `${5 + ((n >> 3) % 88)}%`,
              top: `${12 + ((n >> 9) % 66)}%`,
              opacity: 0.55,
              transform: (n & 1) === 0 ? 'scaleX(-1)' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
