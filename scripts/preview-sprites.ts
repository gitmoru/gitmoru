/**
 * 도트 동작을 눈으로 확인하는 도구.
 *
 * 프레임을 가로로 이어 붙인 PNG 를 굽는다. 격자에 숫자를 채워 넣는 것만으로는
 * 발이 늘어났는지 얼굴이 지워졌는지 알 수가 없다. 그림은 그려봐야 안다.
 *
 *   pnpm sprites            모든 동작
 *   pnpm sprites wave nod   고른 것만
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as S from '../src/ui/scene/sprites'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, '.sprite-preview')

/** 도트 한 칸을 몇 픽셀로 */
const CELL = 8
/** 프레임 사이 여백 (칸) */
const GAP = 2

const SEQUENCES: Record<string, string[][]> = {
  idle: S.SEQ_IDLE,
  dig: S.SEQ_DIG,
  look: S.SEQ_LOOK,
  peek: S.SEQ_PEEK,
  cheer: S.SEQ_CHEER,
  found: S.SEQ_FOUND,
  lost: S.SEQ_LOST,
  curious: S.SEQ_CURIOUS,
  sleep: S.SEQ_SLEEP,
  wake: S.SEQ_WAKE,
  wave: S.SEQ_WAVE,
  nod: S.SEQ_NOD,
  shake: S.SEQ_SHAKE,
  carry: S.SEQ_CARRY,
  mound: S.SEQ_MOUND,
  blink: [S.FRAME_BLINK],
  base: [S.FRAME_BASE],
}

/** 배경. 투명하면 어두운 도트가 안 보인다. */
const BACKDROP: [number, number, number] = [0x2a, 0x2f, 0x38]
/** 프레임 경계선. 어디까지가 한 장인지 보이게. */
const EDGE: [number, number, number] = [0x4a, 0x51, 0x5e]

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function render(name: string, frames: string[][]) {
  const w = frames[0]?.[0]?.length ?? S.SPRITE_W
  const h = frames[0]?.length ?? S.SPRITE_H
  const cols = frames.length * (w + GAP) + GAP
  const rows = h + GAP * 2

  const W = cols * CELL
  const H = rows * CELL
  const raw = Buffer.alloc(H * (W * 3 + 1))

  let cursor = 0
  for (let py = 0; py < H; py++) {
    raw[cursor++] = 0
    for (let px = 0; px < W; px++) {
      const cx = Math.floor(px / CELL)
      const cy = Math.floor(py / CELL)

      let color: [number, number, number] = BACKDROP

      const slot = Math.floor((cx - GAP) / (w + GAP))
      const inX = cx - GAP - slot * (w + GAP)
      const inY = cy - GAP

      if (slot >= 0 && slot < frames.length && inX >= 0 && inX < w && inY >= 0 && inY < h) {
        const ch = frames[slot]![inY]![inX]!
        if (ch !== '.') color = rgb(S.PALETTE[ch] ?? '#ff00ff')
        else if (inY === h - 1) color = EDGE // 발이 서 있는 바닥선
      }

      raw[cursor++] = color[0]
      raw[cursor++] = color[1]
      raw[cursor++] = color[2]
    }
  }

  writeFileSync(resolve(OUT, `${name}.png`), png(W, H, raw))
  console.log(`  ${name}  ${frames.length}프레임`)
}

// ── PNG ──────────────────────────────────────────────────
const crc32 = (() => {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  return (bytes: Buffer) => {
    let c = 0xffffffff
    for (const byte of bytes) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
})()

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function png(w: number, h: number, raw: Buffer) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0)
  header.writeUInt32BE(h, 4)
  header[8] = 8
  header[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * 앞발 개수 검사.
 *
 * 모루의 앞발은 **한 쌍**이다. 손을 위로 올리는 동작을 그릴 때 아래에 있던 앞발을
 * 지우지 않으면 발이 네 개가 된다. 눈으로는 잘 안 보이는데 움직이면 바로 티가 난다.
 *
 * 앞발색(7)이 서로 붙어 있는 덩어리를 세서, 두 덩어리가 아니면 알려준다.
 */
function countPaws(frame: string[]): number {
  const seen = new Set<string>()
  let clusters = 0

  const flood = (x: number, y: number) => {
    const stack: Array<[number, number]> = [[x, y]]
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      const key = `${cx},${cy}`
      if (seen.has(key)) continue
      if (frame[cy]?.[cx] !== '7') continue
      seen.add(key)
      // 대각선도 이어진 것으로 본다. 도트에서는 대각선이 한 덩어리로 읽힌다.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) stack.push([cx + dx, cy + dy])
      }
    }
  }

  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < frame[y]!.length; x++) {
      if (frame[y]![x] !== '7' || seen.has(`${x},${y}`)) continue
      clusters++
      flood(x, y)
    }
  }
  return clusters
}

/** 모루가 땅속에 있거나 아예 다른 그림이면 앞발이 안 보이는 게 맞다 */
const NO_PAWS = new Set(['peek', 'mound', 'wake'])

function checkPaws(name: string, frames: string[][]) {
  if (NO_PAWS.has(name)) return
  frames.forEach((frame, i) => {
    const n = countPaws(frame)
    if (n !== 2) console.error(`  ! ${name} ${i + 1}번째 - 앞발 덩어리 ${n}개 (2개여야 해요)`)
  })
}

mkdirSync(OUT, { recursive: true })
const want = process.argv.slice(2)
const names = want.length ? want : Object.keys(SEQUENCES)

for (const name of names) {
  const frames = SEQUENCES[name]
  if (!frames) {
    console.error(`그런 동작은 없어요: ${name}`)
    continue
  }
  render(name, frames)
  checkPaws(name, frames)
}
console.log(`\n  ${OUT}`)
