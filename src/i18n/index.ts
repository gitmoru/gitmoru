import { useSyncExternalStore } from 'react'

import { ko } from './locales/ko'
import { en } from './locales/en'
import { ja } from './locales/ja'

/**
 * 말 고르기.
 *
 * 사전은 **문장 단위**로 둔다. 낱말을 조각내서 화면에서 이어붙이면
 * 언어마다 어순이 달라서 반드시 어색해진다. "저장소 3곳" 은 한국어 어순이고
 * 영어는 "3 repositories" 다. 조각으로는 둘 다 자연스럽게 못 만든다.
 *
 * 그래서 숫자가 들어가는 문장은 사전에 **함수로** 넣는다.
 * 복수형도 그 함수 안에서 각 언어가 알아서 처리한다.
 *
 * 번역은 옮긴 것이 아니라 **그 언어로 다시 쓴 것**이다.
 * 한국어판이 "아직 안 팠어요" 라고 해서 영어판이 "Not dug yet" 이 되지는 않는다.
 */

export const LOCALES = ['ko', 'en', 'ja'] as const
export type Locale = (typeof LOCALES)[number]

const DICTS = { ko, en, ja }

/** 언어 이름은 언제나 그 언어로 쓴다. 못 읽는 말로 적힌 선택지는 고를 수 없다. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
}

const STORAGE_KEY = 'gitmole.locale'

/** 사용자가 직접 고른 적이 있는지. 첫 실행에 언어를 물어볼지 여기서 갈린다. */
export function localeWasChosen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch {
    // 저장소를 못 읽는 환경일 수 있다. 그래도 앱은 떠야 한다.
  }

  // `navigator.languages` 는 사용자가 정한 우선순위다. 위에서부터 아는 말을 찾는다.
  const wanted = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of wanted) {
    const base = tag.toLowerCase().split('-')[0]
    if (base && (LOCALES as readonly string[]).includes(base)) return base as Locale
  }
  return 'en'
}

let current: Locale = detect()
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function setLocale(next: Locale) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // 못 저장해도 이번 실행 동안은 바뀐 말로 쓴다
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void) {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

/** 지금 사전. React 밖(core, 유틸)에서 쓴다. */
export function tr() {
  return DICTS[current]
}

/** 지금 사전. 언어가 바뀌면 다시 그린다. */
export function useTr() {
  useSyncExternalStore(subscribe, getLocale, getLocale)
  return DICTS[current]
}

/** 언어 고르개가 쓰는 것 */
export function useLocale(): [Locale, (next: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  return [locale, setLocale]
}

if (typeof document !== 'undefined') document.documentElement.lang = current
