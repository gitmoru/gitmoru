import { EYE, GAP, GH, GLYPHS, GW, INK, WORD } from './wordmarkGlyphs'

/**
 * gitmole 글자 로고.
 *
 * 폰트를 쓰지 않고 도트를 직접 찍었다. 화면의 모든 것이 도트인데
 * 이름만 매끈한 폰트면 거기서 결이 끊긴다.
 *
 * 정체성은 **`o` 하나**에 담았다.
 * `o` 를 굴 입구로 만들고 그 안에 모루 눈 두 개를 넣었다 -
 * 이름을 읽는 순간 "땅속에서 누가 보고 있다"가 같이 읽히게.
 *
 * 그리고 글자는 땅 위에 서 있다. 밑줄이 지표선이고, 그 아래는 흙이다.
 */

interface Props {
  /** 도트 한 칸 크기 */
  scale?: number
  /** 글자색 */
  color?: string
  /** 굴 속 눈 색 */
  eye?: string
  /** 글자가 딛고 선 땅을 그릴지 */
  ground?: boolean
}

export function Wordmark({
  scale = 2,
  color = 'var(--color-text)',
  eye = 'var(--color-moss)',
  ground = true,
}: Props) {
  const w = WORD.length * GW + (WORD.length - 1) * GAP
  const h = GH + (ground ? 2 : 0)

  return (
    <svg
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="gitmole"
    >
      {[...WORD].map((ch, i) => {
        const g = GLYPHS[ch]
        if (!g) return null
        const ox = i * (GW + GAP)
        return g.map((row, y) =>
          [...row].map((c, x) =>
            c === '.' ? null : (
              <rect
                key={`${i}-${x}-${y}`}
                x={ox + x}
                y={y}
                width={1}
                height={1}
                fill={c === EYE ? eye : color}
              />
            ),
          ),
        )
      })}

      {/* 글자가 딛고 선 땅 */}
      {ground && (
        <>
          <rect x={0} y={GH} width={w} height={1} fill="#7d5f43" />
          <rect x={0} y={GH + 1} width={w} height={1} fill="#4a3626" />
        </>
      )}
    </svg>
  )
}

/** 잉크 색만 쓰는 곳을 위해 */
export { INK }
