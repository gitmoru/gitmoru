import { useTr } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { Mole } from '../scene/Mole'
import { Sky } from '../scene/Sky'
import { Wordmark } from '../brand/Wordmark'

/**
 * 첫 화면.
 *
 * 가짜로 시간을 끌지 않는다. **실제로 `gh` 로그인을 확인하는 동안**만 머문다.
 * 확인이 끝나면 스스로 물러나고, 실패하면 여기서 무엇을 해야 하는지 알려준다.
 *
 * 로그인이 안 된 채로 본 화면에 들여보내면 사용자는 빈 화면 앞에서
 * 왜 안 되는지 모른 채 헤맨다. 그 상황을 여기서 끝낸다.
 *
 * 연출은 하나뿐이다 - 모루가 굴에서 올라온다.
 * 앱이 깨어나는 것과 같은 동작이라 굳이 설명을 붙이지 않아도 읽힌다.
 */

/** 너무 빨리 스치면 깜빡인 것처럼 보인다. 최소한 이만큼은 머문다. */
const MIN_MS = 900

interface Props {
  viewer: { login: string } | null
  authError: string | null
  onRetry: () => void
  onDone: () => void
}

export function Preloader({ viewer, authError, onRetry, onDone }: Props) {
  const t = useTr()
  const [minPassed, setMinPassed] = useState(false)
  const [leaving, setLeaving] = useState(false)

  /*
    onDone 은 부모가 매번 새로 만드는 함수다.
    이걸 의존성에 넣으면 부모가 다시 그려질 때마다 아래 타이머가 초기화되고,
    마우스를 움직이는 동안에는 첫 화면이 영영 안 닫힌다 - 그러면 클릭도 다 막힌다.
  */
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const t = setTimeout(() => setMinPassed(true), MIN_MS)
    return () => clearTimeout(t)
  }, [])

  /*
    준비가 끝나면 스스로 물러난다.

    `leaving` 을 의존성에 넣으면 안 된다. 그걸 켜는 순간 effect 가 다시 돌고,
    조건에 걸려 일찍 빠져나가면서 **직전 타이머를 취소**한다.
    그러면 첫 화면이 투명해진 채로 영영 남아 클릭을 전부 먹는다.
    한 번만 돌게 ref 로 막는다.
  */
  const started = useRef(false)
  useEffect(() => {
    if (!viewer || !minPassed || started.current) return
    started.current = true
    setLeaving(true)
    const t = setTimeout(() => doneRef.current(), 260)
    return () => clearTimeout(t)
  }, [viewer, minPassed])

  return (
    <div
      className={`absolute inset-0 z-[60] overflow-hidden transition-opacity duration-200 ${
        leaving ? 'pointer-events-none' : ''
      }`}
      style={{ opacity: leaving ? 0 : 1 }}
    >
      <Sky />

      <div className="relative flex h-full flex-col items-center justify-center pb-16">
        <Wordmark scale={5} />

        {authError ? (
          <div className="mt-9 w-[330px] text-center">
            <p className="mb-2 text-[13px] font-semibold text-[var(--color-sand)]">
              {t.preloader.needAuth}
            </p>
            <p className="mb-4 text-[11.5px] leading-relaxed text-[rgb(233_237_247/0.62)]">
              {t.preloader.needAuthHint}
            </p>
            <p
              className="mb-4 px-3 py-2 font-mono text-[12px] text-[var(--color-text)]"
              style={{ background: 'rgb(0 0 0 / 0.35)' }}
            >
              gh auth login
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="px-btn bg-[var(--color-moss)] px-4 py-2 text-[12px] font-semibold text-[#16241c]"
            >
              {t.preloader.retry}
            </button>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-2.5">
            <p className="text-[11.5px] text-[rgb(233_237_247/0.62)]">
              {viewer ? t.preloader.connected(viewer.login) : t.preloader.connecting}
            </p>
            <div className="dots">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={viewer || i < 3 ? 'dot dot-on' : 'dot'} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 모루가 굴에서 올라온다 - 앱이 깨어나는 동작 */}
      <Mole mood={viewer ? 'idle' : 'digging'} followCursor={false} bottom={12} />

      {/* 지표면 */}
      <div className="absolute inset-x-0 bottom-0">
        <div style={{ height: 3, background: '#7d5f43' }} />
        <div style={{ height: 9, background: '#4a3626' }} />
      </div>
    </div>
  )
}
