import { LOCALES, LOCALE_NAMES, setLocale, type Locale } from '../../i18n'
import { Wordmark } from '../brand/Wordmark'
import { Sky } from '../scene/Sky'

/**
 * 맨 처음 한 번, 어떤 말로 쓸지 묻는다.
 *
 * 시스템 언어로 알아서 맞출 수도 있지만, 개발자는 시스템은 영어로 쓰면서
 * 한국어 도구를 쓰는 일이 흔하다. 추측이 틀리면 사용자는 낯선 말이 뜬 화면에서
 * 언어 바꾸는 자리를 찾아 헤매게 된다. 한 번 물어보는 게 그것보다 싸다.
 *
 * 한 번 고르면 다시 묻지 않는다. 바꾸고 싶으면 제목줄에 늘 있다.
 *
 * 설명은 일부러 넣지 않았다. 선택지가 그 언어로 적혀 있으면 그게 곧 설명이다.
 */
export function LanguageGate({ onPick }: { onPick: () => void }) {
  const choose = (code: Locale) => {
    setLocale(code)
    onPick()
  }

  return (
    <div className="absolute inset-0 z-[70] overflow-hidden">
      <Sky />

      <div className="relative flex h-full flex-col items-center justify-center pb-10">
        <Wordmark scale={5} />

        <div className="mt-10 flex flex-col gap-2">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => choose(code)}
              className="px-btn w-[180px] bg-[var(--color-panel)]/85 py-2.5 text-[12.5px] text-[var(--color-text)] backdrop-blur-sm hover:bg-[var(--color-panel)]"
            >
              {LOCALE_NAMES[code]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
