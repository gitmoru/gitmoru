import { useEffect, useMemo, useRef, useState } from 'react'

import { defaultDetectorConfig } from '../../core/detectors'
import { GitHubClient } from '../../core/github'
import { runScan, type ScanProgress } from '../../core/scan'
import { localZone } from '../../core/time'
import type { CaseFile } from '../../core/types'
import { whoami } from '../../platform/bridge'
import { tr } from '../../i18n'
import { bootLines, logLine, type LogLine } from '../chrome/ConsoleLog'
import type { ScanForm } from '../panels/ScanPanel'

/** 기록은 이만큼만 들고 있는다. 오래된 줄은 흘려보낸다. */
const LOG_LIMIT = 200

/** 다 판 순간의 연출. 뜻이 다르니 종류를 나눈다. */
export type Finale = { kind: 'sparkle' | 'alert'; seed: number }

const FINALE_MS = { sparkle: 1600, alert: 2200 }

/**
 * 화면에서 받은 시각을 GitHub 이 쓰는 UTC 로 바꾼다.
 *
 * 입력칸은 이 컴퓨터의 시간대로 보여주고 있으니, `new Date()` 가 그대로 그 시간대로 읽는다.
 */
function localToUtc(local: string): string {
  return new Date(local).toISOString().slice(0, 19)
}

/** 어디를 파는지 한 마디로. 기록과 사건 제목에 같은 말을 쓴다. */
function describeScope(form: ScanForm): string {
  const t = tr().console
  if (form.scope.branches.length > 0) return t.scopeBranches(form.scope.branches.length)
  if (form.scope.repos.length > 0) return t.scopeRepos(form.scope.repos.length)
  return form.scope.orgs.join(', ')
}

/**
 * 한 번의 조사에 얽힌 것들.
 *
 * 로그인 확인, 훑기, 진행 기록, 케이스 내보내기가 한 덩어리로 움직인다.
 * 화면 쪽 상태(무엇을 골랐는지, 칸이 얼마나 열렸는지)는 여기 두지 않는다.
 */
export function useScanSession() {
  const [viewer, setViewer] = useState<{ login: string } | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const [finale, setFinale] = useState<Finale | null>(null)

  const github = useMemo(() => new GitHubClient(), [])

  const push = (level: Parameters<typeof logLine>[0], text: string) =>
    setLog((prev) => [...prev.slice(-LOG_LIMIT), logLine(level, text)])

  /**
   * gh CLI 로그인 상태 확인. 토큰 자체는 화면으로 오지 않는다.
   * 첫 화면에서 '다시 확인' 을 누르면 이걸 다시 부른다.
   */
  const checkAuth = () => {
    setAuthError(null)
    whoami()
      .then((who) => {
        setViewer(who)
        setLog((prev) => [
          ...prev,
          ...bootLines().map((line) => logLine('boot', line)),
          logLine('boot', tr().console.authOk(who.login)),
        ])
      })
      .catch((err: Error) => {
        const reason = String(err.message ?? err)
        setAuthError(reason)
        setLog((prev) => [...prev, logLine('warn', tr().console.authFailed(reason))])
      })
  }

  // 개발 모드에서 effect 가 두 번 도는 걸 대비해 한 번만 부른다
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(form: ScanForm) {
    setScanning(true)
    setError(null)

    const where = describeScope(form)
    push('scan', tr().console.scanStart(where, form.actor || undefined))
    let lastMessage = ''

    try {
      const detectorConfig = defaultDetectorConfig()
      for (const [id, enabled] of Object.entries(form.detectors)) {
        if (detectorConfig[id]) detectorConfig[id].enabled = enabled
      }

      const result = await runScan(
        github,
        {
          title: form.title.trim() || tr().console.scanTitle(where),
          orgs: form.scope.orgs,
          repos: form.scope.repos,
          branches: form.scope.branches,
          window: {
            since: localToUtc(form.sinceKst),
            until: localToUtc(form.untilKst),
            displayTz: localZone(),
          },
          actor: form.actor.trim() || undefined,
          detectorConfig,
        },
        (step) => {
          setProgress(step)
          if (step.message === lastMessage) return
          lastMessage = step.message
          const level = step.phase === 'changes' ? 'diff' : step.phase === 'detect' ? 'sig' : 'scan'
          push(level, step.message)
        },
      )

      setCaseFile(result)

      // 눈에 띄는 게 나왔으면 더 크게 알린다. 이걸 놓치면 도구로서 실패다.
      const notable =
        result.findings.some((f) => f.attention === 'first') ||
        result.branches.some((b) => b.status === 'unknown' || b.status === 'changed')
      const kind = notable ? 'alert' : 'sparkle'
      setFinale({ kind, seed: Date.now() })
      setTimeout(() => setFinale(null), FINALE_MS[kind])

      const changedFiles = result.changes.reduce((n, change) => n + change.files.length, 0)
      push('diff', tr().console.changedFiles(changedFiles, result.branches.length))
      push('sig', tr().console.signals(result.findings.length))

      // 실패는 반드시 눈에 보이게 흘린다. 조용히 삼키면 '이상 없음' 이 된다.
      for (const failure of result.failures) push('warn', `${failure.target}: ${failure.reason}`)
    } catch (err) {
      const reason = String((err as Error).message ?? err)
      setError(reason)
      push('warn', tr().console.aborted(reason))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  /** 케이스 파일만 저장한다. 페이로드 원문은 담기지 않는다. */
  function exportCase() {
    if (!caseFile) return
    const blob = new Blob([JSON.stringify(caseFile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${caseFile.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return {
    github,
    viewer,
    authError,
    checkAuth,
    caseFile,
    setCaseFile,
    scanning,
    progress,
    error,
    log,
    push,
    finale,
    run,
    exportCase,
  }
}
