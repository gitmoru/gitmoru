import {
  SEQ_CARRY,
  SEQ_CHEER,
  SEQ_CURIOUS,
  SEQ_DIG,
  SEQ_FOUND,
  SEQ_IDLE,
  SEQ_LOOK,
  SEQ_LOST,
  SEQ_NOD,
  SEQ_SLEEP,
  SEQ_PEEK,
  SEQ_WAKE,
  SEQ_WAVE,
} from './sprites'

/**
 * 모루의 기분.
 *
 * 앞쪽은 지금 **상태**를 나타내고, 뒤쪽은 방금 일어난 **일**에 대한 반응이다.
 * 반응은 잠깐 나왔다가 원래 상태로 돌아간다.
 *
 * 여기에 'safe' 나 'clean' 같은 건 없다. 우리가 아는 건 "신호가 안 잡혔다" 이지
 * "없다" 가 아니라서, 안심시키는 표정을 아예 만들지 않았다.
 */
export type MoleMood =
  | 'idle'
  | 'digging'
  | 'found'
  | 'lost'
  | 'curious'
  | 'cheer'
  | 'peek'
  | 'sleep'
  // 아래는 방금 일어난 일에 대한 반응이다 (moleReactions.ts)
  | 'wave'
  | 'nod'
  | 'carry'

export type Motion = { frames: string[][]; fps: number; loop: boolean }

/**
 * 기분마다 어떤 그림을 몇 장씩 얼마나 빠르게 넘길지.
 *
 * **프레임 수와 넘김 속도가 곧 성격이다.**
 * 굴 파기는 빠르게, 숨쉬기는 아주 느리게, 잘 때는 더 느리게.
 */
export const MOTIONS: Record<MoleMood, Motion> = {
  idle: { frames: SEQ_IDLE, fps: 1.2, loop: true },
  digging: { frames: SEQ_DIG, fps: 8, loop: true },
  found: { frames: SEQ_FOUND, fps: 3, loop: true },
  lost: { frames: SEQ_LOST, fps: 1.6, loop: true },
  curious: { frames: SEQ_CURIOUS, fps: 1.4, loop: true },
  cheer: { frames: SEQ_CHEER, fps: 5, loop: true },
  peek: { frames: SEQ_PEEK, fps: 9, loop: false }, // 올라오고 멈춘다
  sleep: { frames: SEQ_SLEEP, fps: 0.7, loop: true },
  wave: { frames: SEQ_WAVE, fps: 5, loop: true },
  nod: { frames: SEQ_NOD, fps: 4, loop: false }, // 한 번만 끄덕인다
  carry: { frames: SEQ_CARRY, fps: 2, loop: true },
}

/** 평소에 이따금 좌우를 둘러보는 동작 */
export const LOOKING_AROUND: Motion = { frames: SEQ_LOOK, fps: 1.8, loop: true }

/** 자다가 깜짝 놀라 깨는 동작 */
export const WAKING_UP: Motion = { frames: SEQ_WAKE, fps: 6, loop: false }

/** 신났다가 가라앉기까지 (밀리초). 계속 뛰고 있으면 정신없다. */
export const SETTLE_AFTER: Partial<Record<MoleMood, number>> = {
  cheer: 3400,
  found: 5000,
}
