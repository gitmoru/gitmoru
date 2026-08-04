import { useSyncExternalStore } from 'react'

import { tr } from '../../i18n'
import type { MoleMood } from './moleMotion'

/**
 * 모루가 **방금 일어난 일**에 반응하게 하는 자리.
 *
 * 기존 `moleVoice` 는 지금 상태를 보고 말한다. 훑는 중인지, 결과가 있는지 같은 것들.
 * 그것만으로는 "복사했다", "되돌렸다" 처럼 **순간에 끝나는 일**에 반응할 수가 없다.
 * 상태가 그대로라 표정도 그대로다.
 *
 * 그래서 층을 하나 더 둔다. 어떤 일이 벌어지면 여기에 알리고,
 * 모루는 잠깐 그 반응을 보여준 다음 원래 하던 표정으로 돌아간다.
 *
 * 리액트 상태로 안 두는 이유가 있다. 이걸 알리는 곳(상태줄, 되돌리기 상자, 언어 고르개)이
 * 화면 곳곳에 흩어져 있어서, props 로 내려보내면 그 사이 컴포넌트들이 전부
 * 자기와 상관없는 것을 나르게 된다.
 */

export type MoleEvent =
  | 'greet'
  | 'copied'
  | 'exported'
  | 'restored'
  | 'restoreFailed'
  | 'connected'
  | 'languageChanged'
  | 'dockTall'
  | 'dockShort'
  | 'tabChanges'
  | 'tabSignals'
  | 'tabLog'

type Reaction = { mood: MoleMood; say: string }

/** 반응마다 어떤 표정으로, 얼마나 오래 */
const HOW: Record<MoleEvent, { mood: MoleMood; ms: number }> = {
  greet: { mood: 'wave', ms: 3200 },
  copied: { mood: 'nod', ms: 2000 },
  exported: { mood: 'carry', ms: 2600 },
  restored: { mood: 'cheer', ms: 3600 },
  restoreFailed: { mood: 'lost', ms: 3600 },
  connected: { mood: 'cheer', ms: 3000 },
  languageChanged: { mood: 'wave', ms: 2600 },
  // 아래 칸을 올리면 하늘이 좁아진다. 모루는 그 자리에 그대로 있으니 빼꼼 내다보는 게 맞다.
  dockTall: { mood: 'peek', ms: 2400 },
  dockShort: { mood: 'wave', ms: 2000 },
  tabChanges: { mood: 'curious', ms: 2200 },
  tabSignals: { mood: 'found', ms: 2200 },
  tabLog: { mood: 'curious', ms: 2200 },
}

let current: Reaction | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((fn) => fn())

/** 방금 이런 일이 있었다고 모루에게 알린다. */
export function reactMole(event: MoleEvent) {
  const { mood, ms } = HOW[event]
  current = { mood, say: tr().mole.reactions[event] }
  notify()

  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    current = null
    timer = null
    notify()
  }, ms)
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const snapshot = () => current

/** 지금 보여줄 반응. 없으면 null 이고, 그럴 땐 평소 표정을 쓴다. */
export function useMoleReaction(): Reaction | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
