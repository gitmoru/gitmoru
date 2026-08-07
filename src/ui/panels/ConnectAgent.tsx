import { useEffect, useMemo, useState } from 'react'
import {
  isDesktopApp,
  mcpRegister,
  mcpStatus,
  revealPath,
  type McpStatus,
} from '../../platform/bridge'
import { Modal } from '../chrome/Modal'
import { useTr } from '../../i18n'
import { reactMole } from '../scene/moleReactions'
import { CLIENTS } from './agentClients'

/**
 * AI 에 붙이기.
 *
 * MCP 는 표준이라 Claude 만 붙을 이유가 없다. 쓰는 도구가 뭐든 붙게 한다.
 *
 * 안내 원칙:
 *   1. 설정 덩어리를 던지지 않는다. **1, 2, 3 순서**로 끊어서 보여준다
 *   2. "~/.cursor/mcp.json" 같은 축약 경로를 쓰지 않는다. **이 컴퓨터의 실제 경로**를 띄우고
 *      폴더를 열어준다. 파일이 이미 있는지도 알려준다 - 새로 만들지, 끼워 넣을지가 갈리기 때문
 *   3. 마지막은 항상 **확인**이다. 붙였다고 말만 하고 끝내면 사용자는 붙었는지 알 수 없다
 *
 * 설정 파일을 우리가 직접 고치지 않는다. Claude Code 만 예외로 `claude mcp add` 를
 * 대신 실행할 수 있는데, 그것도 실행할 명령을 화면에 띄운 다음에 한다.
 */

export function ConnectAgent({ onClose }: { onClose: () => void }) {
  const t = useTr()
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [picked, setPicked] = useState('claude-code')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = () => {
    mcpStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }
  useEffect(refresh, [])

  const client = CLIENTS.find((c) => c.id === picked)!
  // 경로가 필요 없어졌다. npm 에 올라가 있어서 명령이 어디서든 같다.
  const snippet = useMemo(() => client.snippet(), [client])
  const target = client.pathKey ? status?.paths?.[client.pathKey] : undefined

  const copy = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(tag)
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1800)
  }

  const register = async () => {
    setBusy(true)
    const r = await mcpRegister()
    if (r.ok) reactMole('connected')
    setResult(r.ok ? null : (r.error ?? t.connect.attachFailed))
    setBusy(false)
    refresh()
  }

  const done = client.id === 'claude-code' && status?.registered

  return (
    <Modal title={t.connect.title} onClose={onClose} width={580} height={470}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-5 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
            {t.connect.intro}
            <span className="text-[var(--color-text)]">{t.connect.introStrong}</span>
            {t.connect.introTail}
          </p>

          {!isDesktopApp() || !status ? (
            <p className="text-[11.5px] text-[var(--color-sand)]">
              {isDesktopApp() ? t.connect.checking : t.connect.desktopOnly}
            </p>
          ) : (
            <>
              <Step n={1} title={t.connect.stepPick} />
              <div className="mb-6 flex flex-wrap gap-1.5 pl-6">
                {CLIENTS.map((c) => {
                  const on = c.id === picked
                  const col = on ? 'var(--color-moss)' : 'var(--color-edge)'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setPicked(c.id)
                        setResult(null)
                      }}
                      className="px-2 py-1 text-[11px] hover:brightness-125"
                      style={{
                        background: on ? 'var(--color-moss)' : 'transparent',
                        color: on ? '#16241c' : 'var(--color-muted)',
                        boxShadow: `0 -2px 0 ${col}, 0 2px 0 ${col}, -2px 0 0 ${col}, 2px 0 0 ${col}`,
                      }}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>

              {done ? (
                <div className="mb-6 ml-6 px-3 py-2.5" style={{ background: 'var(--color-ink)' }}>
                  <p className="text-[12px] text-[var(--color-moss)]">{t.connect.already}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
                    {t.connect.alreadyHint}
                  </p>
                </div>
              ) : (
                <>
                  {/* 2 - 어디에 */}
                  {client.kind === 'cli' ? (
                    <>
                      <Step n={2} title={t.connect.stepOneLine} />
                      <div className="mb-6 pl-6">
                        <Snippet text={snippet} />
                        <div className="mt-2.5 flex items-center gap-2">
                          {client.auto && status.hasCli && (
                            <button
                              type="button"
                              onClick={register}
                              disabled={busy}
                              className="px-btn bg-[var(--color-moss)] px-4 py-2 text-[12px] font-semibold text-[#16241c] disabled:bg-[var(--color-edge)] disabled:text-[var(--color-faint)]"
                            >
                              {busy ? t.connect.attaching : t.connect.attachHere}
                            </button>
                          )}
                          <CopyBtn
                            on={copied === 'snippet'}
                            onClick={() => copy(snippet, 'snippet')}
                          />
                        </div>
                        {!status.hasCli && (
                          <p className="mt-2 text-[10.5px] text-[var(--color-sand)]">
                            {t.connect.noCli}
                          </p>
                        )}
                        {result && (
                          <p className="mt-2 text-[11px] text-[var(--color-sand)]">{result}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/*
                        경로를 아는 도구만 파일 위치를 띄운다.
                        모르는 도구(VS Code)까지 빈 칸을 그리면 그 칸이 무슨 뜻인지 알 수 없다.
                      */}
                      <Step
                        n={2}
                        title={
                          target
                            ? target.exists
                              ? t.connect.stepOpenFile
                              : t.connect.stepCreateFile
                            : t.connect.stepCreateConfig
                        }
                      />
                      <div className="mb-6 pl-6">
                        {target ? (
                          <>
                            <p
                              className="px-2.5 py-2 font-mono text-[10.5px] break-all"
                              style={{ background: 'var(--color-ink)' }}
                            >
                              {target.path}
                            </p>
                            <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--color-faint)]">
                              {target.exists ? t.connect.fileExists : t.connect.fileMissing}
                            </p>
                            <button
                              type="button"
                              onClick={() => revealPath(target.path)}
                              className="px-btn mt-2 bg-[var(--color-edge)] px-3 py-1.5 text-[11px]"
                            >
                              {t.connect.openFolder}
                            </button>
                          </>
                        ) : (
                          <p className="text-[11.5px] leading-relaxed text-[var(--color-muted)]">
                            {t.connect.vscodeHint}
                          </p>
                        )}
                      </div>

                      <Step n={3} title={t.connect.stepPaste} />
                      <div className="mb-6 pl-6">
                        <Snippet text={snippet} />
                        <div className="mt-2.5">
                          <CopyBtn
                            on={copied === 'snippet'}
                            onClick={() => copy(snippet, 'snippet')}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <Step n={client.kind === 'cli' ? 3 : 4} title={t.connect.stepRestart} />
                  <p className="mb-6 pl-6 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
                    {t.connect.restart[client.restart]}
                  </p>
                </>
              )}

              {/* 확인 */}
              <Step n={done ? 2 : client.kind === 'cli' ? 4 : 5} title={t.connect.stepVerify} />
              <div className="pl-6">
                <p className="mb-2 text-[11.5px] text-[var(--color-muted)]">
                  {t.connect.askHint}
                </p>
                <p
                  className="px-2.5 py-2 text-[11.5px]"
                  style={{ background: 'var(--color-ink)' }}
                >
                  {t.connect.ask}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <CopyBtn on={copied === 'ask'} onClick={() => copy(t.connect.ask, 'ask')} />
                  <span className="text-[10.5px] text-[var(--color-faint)]">
                    {t.connect.askResult}
                  </span>
                </div>
              </div>

              <p className="mt-6 border-t border-[var(--color-edge)] pt-3 text-[10.5px] leading-relaxed text-[var(--color-faint)]">
                {t.connect.otherTools}
              </p>
            </>
          )}
        </div>
    </Modal>
  )
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[10px] font-semibold"
        style={{ background: 'var(--color-moss)', color: '#16241c' }}
      >
        {n}
      </span>
      <h3 className="text-[12px] font-semibold">{title}</h3>
    </div>
  )
}

function Snippet({ text }: { text: string }) {
  return (
    <pre
      className="max-h-44 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
      style={{ background: 'var(--color-ink)' }}
    >
      {text}
    </pre>
  )
}

function CopyBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  const t = useTr()
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-btn bg-[var(--color-edge)] px-3 py-1.5 text-[11px]"
    >
      {on ? t.common.copied : t.common.copy}
    </button>
  )
}
