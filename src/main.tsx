import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setSessionKey } from './platform/bridge'
import { App } from './ui/App'
import './styles.css'

/**
 * 로컬 서버가 페이지에 심어준 세션 키.
 * GitHub 토큰이 아니다 - 이 값으로는 GitHub 에 아무것도 할 수 없고,
 * 우리 로컬 API 를 부를 때만 쓰인다 (SAFETY.md 5번).
 */
const sessionKey =
  document.querySelector<HTMLMetaElement>('meta[name="radar-session"]')?.content ?? ''

setSessionKey(sessionKey)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
