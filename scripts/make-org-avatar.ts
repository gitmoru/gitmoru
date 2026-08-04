/**
 * 조직 프로필 사진 굽기.
 *
 * 앱 아이콘은 배경이 투명해서 GitHub 조직 사진으로 쓰면 사방이 뚫린 채로 잘린다.
 * 여기서는 브랜드 바탕을 깔고 모루를 가운데에 놓는다.
 *
 * 그림은 `src/ui/scene/sprites.ts` 에서 읽는다. 캐릭터를 고치면 이 사진도 같이 바뀐다.
 *
 *   pnpm avatar
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FRAME_BASE, PALETTE, SPRITE_H, SPRITE_W } from '../src/ui/scene/sprites'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** GitHub 은 큰 쪽을 알아서 줄인다. 도트가 깨지지 않게 배수로 맞춘다. */
const SIZE = 512
/** 도트 한 칸의 크기. 가로 16칸이 화면의 3/4 을 차지하게. */
const CELL = 24
/** 바탕. 앱 배경과 같은 색이라 아이콘과 나란히 놓아도 한 식구로 보인다. */
const BACKDROP = '#17181c'
/** 모루가 딛고 선 땅. 아바타 아래쪽에 얇게 깐다. */
const TOPSOIL = '#7d5f43'
const SOIL = '#4a3626'

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const artW = SPRITE_W * CELL
const artH = SPRITE_H * CELL
const originX = Math.round((SIZE - artW) / 2)
/** 발이 땅선에 닿게 놓는다. 가운데에 띄우면 떠 있는 것처럼 보인다. */
const groundY = Math.round(SIZE * 0.78)
const originY = groundY - artH

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1))
let cursor = 0

for (let y = 0; y < SIZE; y++) {
  raw[cursor++] = 0
  for (let x = 0; x < SIZE; x++) {
    let color = rgb(BACKDROP)

    if (y >= groundY && y < groundY + CELL / 3) color = rgb(TOPSOIL)
    else if (y >= groundY) color = rgb(SOIL)

    const cx = Math.floor((x - originX) / CELL)
    const cy = Math.floor((y - originY) / CELL)
    if (cx >= 0 && cx < SPRITE_W && cy >= 0 && cy < SPRITE_H) {
      const ch = FRAME_BASE[cy]![cx]!
      if (ch !== '.') color = rgb(PALETTE[ch]!)
    }

    raw[cursor++] = color[0]
    raw[cursor++] = color[1]
    raw[cursor++] = color[2]
  }
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

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8
header[9] = 2 // RGB

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = resolve(ROOT, 'build', 'org-avatar.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)

console.log(`  조직 사진 만들었어요 - ${out} (${SIZE}x${SIZE})`)
