/**
 * 앱 아이콘 만들기.
 *
 * 화면에 사는 모루를 그대로 아이콘으로 쓴다. 굴이나 땅선 같은 걸 덧붙이지 않는다.
 * 아이콘과 화면 속 캐릭터가 다르면 같은 것이라는 게 안 읽힌다.
 *
 * 그림을 여기에 다시 그리지 않고 `src/ui/scene/sprites.ts` 에서 읽어온다.
 * 두 벌로 갈라지면 캐릭터를 고칠 때 아이콘만 옛날 얼굴로 남는다.
 *
 * 외부 라이브러리 없이 PNG 를 직접 굽는다. 도트 그림이라 압축할 것도 거의 없고,
 * 의존성 하나 늘리는 것보다 이게 낫다.
 *
 *   pnpm icon
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FRAME_BASE, PALETTE, SPRITE_H, SPRITE_W } from '../src/ui/scene/sprites'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 한 도트를 몇 픽셀로 키울지. 16 x 16 = 256 짜리 정사각 아이콘이 된다. */
const CELL = 16
const SIZE = SPRITE_W * CELL // 256

/** 그림은 16 x 12 라 정사각으로 만들려면 위아래에 빈 줄이 필요하다. */
const PAD_TOP = Math.floor((SPRITE_W - SPRITE_H) / 2) // 2줄
const rows = [
  ...Array<string>(PAD_TOP).fill('.'.repeat(SPRITE_W)),
  ...FRAME_BASE,
  ...Array<string>(SPRITE_W - SPRITE_H - PAD_TOP).fill('.'.repeat(SPRITE_W)),
]

function toRgba(key: string): [number, number, number, number] {
  const hex = PALETTE[key]
  if (!hex) return [0, 0, 0, 0] // '.' 은 투명
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ]
}

// ── 픽셀 버퍼 ────────────────────────────────────────────
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
let cursor = 0
for (let y = 0; y < SIZE; y++) {
  raw[cursor++] = 0 // 필터 없음
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = toRgba(rows[Math.floor(y / CELL)]![Math.floor(x / CELL)]!)
    raw[cursor++] = r
    raw[cursor++] = g
    raw[cursor++] = b
    raw[cursor++] = a
  }
}

// ── PNG 조립 ─────────────────────────────────────────────
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
header[8] = 8 // 비트 깊이
header[9] = 6 // RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = resolve(ROOT, 'build', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)

console.log(`  아이콘 만들었어요 - ${out} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)}KB)`)
