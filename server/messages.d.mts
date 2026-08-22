/**
 * `messages.mjs` 의 모양.
 *
 * 그 파일은 평범한 JS 다. `bin/` 이 앱 빌드를 거치지 않고 그대로 실행하기 때문이다.
 * 대신 여기서 모양만 적어둔다. `cases.d.mts` 와 같은 이유다.
 */

export type Lang = 'ko' | 'en' | 'ja'

export interface Messages {
  noDownload: string
  noNetwork: string
  tokenStays: string
  quit: string
  unknownCommand: (cmd: string) => string
  usageServe: string
  usageMcp: string
  usageVersion: string
  ghMissing: string
  ghLoggedOut: string
}

/** 환경변수를 먼저 보고, 없으면 운영체제 설정을 본다. 못 정하면 영어. */
export function pickLang(env?: NodeJS.ProcessEnv | Record<string, string>): Lang

export const DICTS: Record<Lang, Messages>
export const msg: Messages
