/**
 * README 에 넣을 그림 굽기.
 *
 * 글자 로고와 모루를 SVG 로 뽑는다. 앱이 쓰는 그림 데이터를 그대로 읽으므로
 * 캐릭터나 글자를 고치면 문서 쪽도 같이 바뀐다. 두 벌로 갈라지지 않게 하려는 것이다.
 *
 * 화면과 달리 CSS 변수를 못 쓴다. GitHub 이 README 안의 SVG 를 그릴 때는
 * 우리 스타일시트가 없기 때문에 색을 박아 넣는다.
 *
 *   pnpm assets
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EYE, GAP, GH, GLYPHS, GW, WORD } from '../src/ui/brand/wordmarkGlyphs'
import { FRAME_BASE, PALETTE, SPRITE_W } from '../src/ui/scene/sprites'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs', 'assets')

/** 어두운 배경에서도 밝은 배경에서도 읽히는 색으로 고른다. */
const COLORS = {
  panel: '#17181c',
  ink: '#ece9e4',
  eye: '#8fd6a8',
  topsoil: '#7d5f43',
  soil: '#4a3626',
}

const rect = (x: number, y: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`

function svg(width: number, height: number, scale: number, body: string[]) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}"`,
    ` viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" role="img">`,
    ...body,
    '</svg>',
    '',
  ].join('\n')
}

// ── 글자 로고 ────────────────────────────────────────────
/**
 * 글자색이 밝은 크림색이라 흰 배경에서는 안 보인다.
 * README 는 보는 사람 설정에 따라 배경이 흰색일 수도 검은색일 수도 있어서,
 * 어두운 판을 깔고 그 위에 글자를 얹는다. 앱 화면과도 같은 모양이 된다.
 */
const PAD = 3

function wordmark(scale: number): string {
  const inner = WORD.length * GW + (WORD.length - 1) * GAP
  const width = inner + PAD * 2
  const height = GH + 2 + PAD * 2 // 글자 + 딛고 선 땅 두 줄 + 여백
  const parts: string[] = [
    `<rect x="0" y="0" width="${width}" height="${height}" rx="1.5" fill="${COLORS.panel}"/>`,
  ]

  ;[...WORD].forEach((ch, i) => {
    const glyph = GLYPHS[ch]
    if (!glyph) return
    const originX = PAD + i * (GW + GAP)
    glyph.forEach((row, y) => {
      ;[...row].forEach((cell, x) => {
        if (cell === '.') return
        parts.push(rect(originX + x, PAD + y, cell === EYE ? COLORS.eye : COLORS.ink))
      })
    })
  })

  parts.push(
    `<rect x="${PAD}" y="${PAD + GH}" width="${inner}" height="1" fill="${COLORS.topsoil}"/>`,
    `<rect x="${PAD}" y="${PAD + GH + 1}" width="${inner}" height="1" fill="${COLORS.soil}"/>`,
  )

  return svg(width, height, scale, parts)
}

// ── 모루 ─────────────────────────────────────────────────
function mole(scale: number): string {
  const parts: string[] = []
  FRAME_BASE.forEach((row, y) => {
    ;[...row].forEach((cell, x) => {
      if (cell === '.') return
      parts.push(rect(x, y, PALETTE[cell]!))
    })
  })
  return svg(SPRITE_W, FRAME_BASE.length, scale, parts)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'wordmark.svg'), wordmark(8))
writeFileSync(resolve(OUT, 'mole.svg'), mole(10))

console.log(`  그림 두 장 만들었어요 - ${OUT}`)
