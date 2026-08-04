import { useEffect, useRef, useState } from 'react'

import { LOCALE_NAMES, LOCALES, useLocale } from '../../i18n'
import { reactMole } from '../scene/moleReactions'

/**
 * 언어 고르기.
 *
 * 선택지는 **그 언어로** 적는다. 한국어를 못 읽는 사람에게 "한국어" 라고 적힌 항목은
 * 고를 수 있는 선택지가 아니다. 지금 언어도 목록에 그대로 남겨서,
 * 잘못 눌러 낯선 말이 떴을 때 되돌아올 곳을 눈으로 찾을 수 있게 한다.
 */
export function LanguagePicker() {
  const [locale, setLocale] = useLocale()
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={hostRef} className="no-drag relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-1.5 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        {LOCALE_NAMES[locale]}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-50 mt-1 min-w-[92px] bg-[var(--color-panel)] py-1"
          style={{
            boxShadow:
              '0 -2px 0 var(--color-edge), 0 2px 0 var(--color-edge), -2px 0 0 var(--color-edge), 2px 0 0 var(--color-edge)',
          }}
        >
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setLocale(code)
                setOpen(false)
                if (code !== locale) reactMole('languageChanged')
              }}
              className="block w-full px-2.5 py-1 text-left text-[11px] hover:bg-[var(--color-edge-soft)]"
              style={{ color: code === locale ? 'var(--color-moss)' : 'var(--color-muted)' }}
            >
              {LOCALE_NAMES[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
