import { randomBytes } from 'node:crypto'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
// @ts-expect-error - 서버 코드는 순수 ESM JS 로 둔다 (npx 실행 시 빌드 없이 돌아야 함)
import { DEV_CSP, handleApi, SECURITY_HEADERS } from './server/proxy.mjs'

/** 실행할 때마다 새로 만든다. 같은 머신의 다른 프로그램이 우리 API 를 호출하지 못하게 하는 열쇠. */
const SESSION_KEY = randomBytes(24).toString('hex')

/**
 * 개발 서버에도 운영과 똑같은 격리를 건다.
 * 개발할 때만 느슨하면 그 상태로 실수하기 쉬우니 동일하게 맞춘다.
 */
function radarServer(): Plugin {
  return {
    name: 'gitmoru-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        for (const [k, v] of Object.entries(SECURITY_HEADERS as Record<string, string>)) {
          res.setHeader(k, v)
        }
        // 개발 중에는 Vite 가 인라인 스크립트를 쓴다. 그것만 열어준다.
        res.setHeader('Content-Security-Policy', DEV_CSP as string)
        const handled = await handleApi(req, res, SESSION_KEY).catch((err: unknown) => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
          return true
        })
        if (!handled) next()
      })
    },
    /**
     * 개발 서버에서만 키를 심는다.
     *
     * `apply: 'serve'` 가 없으면 빌드된 `dist/index.html` 에도 **이 빌드 때 만든 키가
     * 박제된다.** 그러면 `pnpm serve` 로 띄운 서버는 자기 키를 기다리는데 페이지는
     * 박제된 키를 보내서 모든 요청이 403 이 된다. 자리표시자는 서버가 띄울 때 채워야 한다.
     */
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string, ctx: { server?: unknown }) {
        if (!ctx.server) return html
        // 토큰이 아니라 '세션 키'만 심는다. GitHub 토큰은 절대 페이지로 내려가지 않는다.
        return html.replace('__RADAR_SESSION__', SESSION_KEY)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), radarServer()],
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
