import { countByRole } from './fileRole'
import { fillPushShapes, forcedOn } from './pushShape'
import { tr } from '../i18n'
import { collectChanges } from './changes'
import { DETECTORS, detectorById } from './detectors'
import type { GitHubClient } from './github'
import type {
  BranchChanges,
  BranchRef,
  BranchState,
  CaseFile,
  DetectorContext,
  Finding,
  PushEvent,
  RepoExposure,
  RepoRef,
  ScanFailure,
  TimeWindow,
  TimelineEntry,
} from './types'

export interface ScanRequest {
  title: string
  /** 조직 전체를 팔 때. repos 가 있으면 무시된다. */
  orgs: string[]
  /** `owner/repo`. 지정하면 이 저장소만 판다 - 조직 전체를 훑지 않는다. */
  repos: string[]
  /** `owner/repo@branch`. 지정하면 이 브랜치만 본다. */
  branches?: string[]
  window: TimeWindow
  /** 공격자 계정. 지정하면 대상이 크게 좁아진다. */
  actor?: string
  detectorConfig: Record<string, { enabled: boolean; options: Record<string, unknown> }>
}

export interface ScanProgress {
  phase: 'repos' | 'events' | 'branches' | 'changes' | 'detect' | 'done'
  message: string
  current: number
  total: number
}

/**
 * 스캔 파이프라인.
 *
 * 이 함수의 계약 두 가지.
 *
 *  1. **판정하지 않는다.** 상태는 사실만 적는다 (바뀜/되돌아옴/그대로/확인 불가).
 *     "감염됐다"고 말하지 않고, 무엇이 바뀌었는지를 내놓는다. 판단은 사람이나 에이전트가 한다.
 *  2. **실패를 삼키지 않는다.** 확인하지 못한 것은 unknown 으로 남고 절대 다른 값이 되지 않는다.
 */
export async function runScan(
  gh: GitHubClient,
  req: ScanRequest,
  onProgress: (p: ScanProgress) => void = () => {},
): Promise<CaseFile> {
  const failures: ScanFailure[] = []
  const fail = (target: string, reason: string) =>
    failures.push({ target, reason, at: new Date().toISOString() })

  // 지난 훑기에서 남은 게 있으면 이번 것으로 세지 않는다
  gh.takeTruncations()
  gh.resetUsage()

  // ── 1. 대상 저장소 ──────────────────────────────────────
  onProgress({ phase: 'repos', message: tr().progress.repoList, current: 0, total: 1 })

  const repos: RepoRef[] = []

  if (req.repos.length > 0) {
    // 저장소를 콕 집었으면 조직 전체를 훑지 않는다. 이게 검사 속도를 가장 크게 좌우한다.
    for (const full of req.repos) {
      const [owner, name] = full.split('/')
      if (owner && name) repos.push({ owner, name, fullName: full, defaultBranch: 'main' })
    }
  } else {
    for (const org of req.orgs) {
      try {
        repos.push(...(await gh.listOrgRepos(org)))
      } catch (err) {
        fail(`org:${org}`, tr().progress.repoListFailed(String(err)))
      }
    }
  }

  // ── 2. 시간대 안의 기록 ─────────────────────────────────
  const events: PushEvent[] = []

  /*
    비공개에서 공개로 바뀐 저장소.

    푸시와 같은 응답에서 나온다. 따로 받으러 가지 않는다.

    브랜치 필터를 여기에 적용하지 않는다. 저장소 단위로 일어난 일이라
    "main 만 볼게요" 가 이걸 가릴 이유가 없다. 훑는 범위를 좁힌 것이지
    저장소가 공개됐다는 사실을 안 보겠다고 한 게 아니다.
  */
  const exposures: RepoExposure[] = []

  for (const [i, repo] of repos.entries()) {
    onProgress({
      phase: 'events',
      message: tr().progress.events(repo.fullName),
      current: i + 1,
      total: repos.length,
    })
    try {
      const found = await gh.listRepoEvents(repo.fullName, req.window.since, req.window.until)
      events.push(
        ...found.pushes.filter((e) => {
          if (req.actor && e.actor !== req.actor) return false
          // 브랜치를 콕 집었으면 그것만 본다
          if (req.branches?.length && !req.branches.includes(`${e.repo}@${e.branch}`)) return false
          return true
        }),
      )
      exposures.push(...found.exposures.filter((e) => !req.actor || e.actor === req.actor))
    } catch (err) {
      fail(repo.fullName, tr().progress.eventsFailed(String(err)))
    }
  }

  // 브랜치별 '가장 이른' 푸시의 before 가 진짜 공격 직전 상태다.
  const earliest = new Map<string, PushEvent>()
  for (const ev of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${ev.repo}/${ev.branch}`
    if (!earliest.has(key)) earliest.set(key, ev)
  }

  // ── 3. 현재 브랜치 상태 ─────────────────────────────────
  const touchedRepos = [...new Set(events.map((e) => e.repo))]
  const branches: BranchRef[] = []
  for (const [i, repo] of touchedRepos.entries()) {
    onProgress({
      phase: 'branches',
      message: tr().progress.branches(repo),
      current: i + 1,
      total: touchedRepos.length,
    })
    try {
      branches.push(...(await gh.listBranches(repo)))
    } catch (err) {
      fail(repo, tr().progress.branchesFailed(String(err)))
    }
  }

  // ── 3.5. 푸시가 기록을 덮어썼는지 ───────────────────────
  // 이벤트에는 그 정보가 없어서 전후 커밋을 맞대본다. 판정이 아니라 사실 수집이다.
  await fillPushShapes(gh, events, fail, (done, total) =>
    onProgress({
      phase: 'branches',
      message: tr().push.checking(done, total),
      current: done,
      total,
    }),
  )

  // ── 4. 무엇이 바뀌었는지 (1차 산출물) ───────────────────
  // 탐지 규칙과 무관하게 무조건 수집한다. 규칙이 못 알아본 공격도 여기에는 남는다.
  const changes: BranchChanges[] = []
  const targets = [...earliest.values()]

  for (const [i, ev] of targets.entries()) {
    onProgress({
      phase: 'changes',
      message: tr().progress.changes(ev.repo, ev.branch),
      current: i + 1,
      total: targets.length,
    })

    const current = branches.find((b) => b.repo === ev.repo && b.branch === ev.branch)
    if (!current || !ev.before) continue
    if (current.sha === ev.before) continue // 되돌아왔으면 비교할 변경이 없다

    const diff = await collectChanges(gh, ev.repo, ev.branch, ev.before, current.sha, fail)
    if (diff) changes.push(diff)
  }

  // ── 5. 신호 (정렬용 형광펜) ─────────────────────────────
  const findings: Finding[] = []
  const enabled = DETECTORS.filter((d) => req.detectorConfig[d.id]?.enabled ?? d.enabledByDefault)

  for (const [i, detector] of enabled.entries()) {
    onProgress({
      phase: 'detect',
      message: tr().progress.detector(detector.name),
      current: i + 1,
      total: enabled.length,
    })

    const ctx: DetectorContext = {
      window: req.window,
      actor: req.actor,
      repos,
      events,
      branches,
      changes,
      gh,
      options: (req.detectorConfig[detector.id]?.options ?? {}) as DetectorContext['options'],
      reportFailure: (target, reason) => fail(target, `[${detector.id}] ${reason}`),
      reportProgress: (message) =>
        onProgress({ phase: 'detect', message, current: i + 1, total: enabled.length }),
    }

    try {
      findings.push(...(await detector.run(ctx)))
    } catch (err) {
      // 신호 하나가 죽어도 변경 목록은 이미 확보돼 있다. 다만 조용히 넘어가지 않는다.
      fail(`detector:${detector.id}`, tr().progress.detectorFailed(String(err)))
    }
  }

  /*
    한도에서 잘린 목록을 여기서 걷는다.

    조회는 성공했으니 예외가 안 났고, 배열은 멀쩡히 채워져서 돌아왔다. 그래서
    아무도 안 물어보면 그대로 "다 봤다" 가 된다. 저장소 1,200개짜리 조직을
    1,000개만 훑고도 화면이 당당했던 게 이 자리다.

    자리는 사건을 만들기 전이기만 하면 된다. 판정은 마지막에 `failures` 개수를
    세서 나오고, 잘림이 남기는 대상(`orgs/x/repos`)은 브랜치 키(`저장소/브랜치`)와
    겹칠 일이 없어서 브랜치 상태에는 영향을 주지 않는다.
    한때 여기 "브랜치 상태를 정하기 전이어야 한다" 고 적어뒀는데 사실이 아니었다.
  */
  for (const cut of gh.takeTruncations()) {
    fail(cut.path, tr().progress.truncated(cut.got))
  }

  // 신호를 해당 파일에 붙인다. 신호가 없는 변경도 목록에서 빠지지 않는다.
  for (const c of changes) {
    for (const f of c.files) {
      f.signalIds = findings
        .filter((s) => s.repo === c.repo && s.branch === c.branch && s.path === f.path)
        .map((s) => s.id)
    }
  }

  // ── 6. 상태 판정 - 사실만 ───────────────────────────────
  const failedTargets = new Set(failures.map((f) => f.target))
  const branchStates: BranchState[] = []

  for (const ev of earliest.values()) {
    const current = branches.find((b) => b.repo === ev.repo && b.branch === ev.branch)
    const diff = changes.find((c) => c.repo === ev.repo && c.branch === ev.branch)
    const related = findings.filter((f) => f.repo === ev.repo && f.branch === ev.branch)
    const forced = forcedOn(events, ev.repo, ev.branch)

    let status: BranchState['status']
    let unknownReason: string | undefined

    if (failedTargets.has(`${ev.repo}/${ev.branch}`) || failedTargets.has(ev.repo)) {
      status = 'unknown'
      unknownReason = failures.find((f) => f.target === `${ev.repo}/${ev.branch}` || f.target === ev.repo)?.reason
    } else if (!current) {
      status = 'unknown'
      unknownReason = tr().reasons.branchGone
    } else if (!ev.before) {
      status = 'unknown'
      unknownReason =
        tr().reasons.beforeMissing
    } else if (current.sha === ev.before) {
      status = 'reverted'
    } else if (diff && diff.files.length > 0) {
      status = 'changed'
    } else if (diff) {
      status = 'untouched'
    } else {
      // 변경 목록을 만들지 못했다 = 확인하지 못했다. 절대 '그대로'로 접지 않는다.
      status = 'unknown'
      unknownReason = tr().reasons.diffFailed
    }

    branchStates.push({
      repo: ev.repo,
      branch: ev.branch,
      status,
      currentSha: current?.sha ?? null,
      restoreTarget: ev.before || undefined,
      isProtected: false, // 복구 계획 단계에서 채운다
      findingIds: related.map((f) => f.id),
      changedFiles: diff?.files.length ?? 0,
      unknownReason,
      forcedPushes: forced,
      droppedCommits: forced.reduce((n, p) => n + p.droppedCommits, 0),
    })
  }

  // ── 7. 타임라인 ────────────────────────────────────────
  const timeline: TimelineEntry[] = [
    ...events.map((e) => ({
      at: e.createdAt,
      repo: e.repo,
      branch: e.branch,
      actor: e.actor,
      kind: 'push' as const,
    })),
    // 브랜치가 없다. 저장소 하나가 통째로 밖으로 나간 일이다.
    ...exposures.map((e) => ({
      at: e.at,
      repo: e.repo,
      branch: '',
      actor: e.actor,
      kind: 'made-public' as const,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  onProgress({ phase: 'done', message: tr().progress.done, current: 1, total: 1 })

  return {
    version: 2,
    id: `case-${Date.now().toString(36)}`,
    title: req.title,
    createdAt: new Date().toISOString(),
    scope: { orgs: req.orgs, repos: req.repos },
    window: req.window,
    actor: req.actor,
    detectorConfig: Object.fromEntries(
      enabled.map((d) => [d.id, { enabled: true, options: req.detectorConfig[d.id]?.options ?? {} }]),
    ),
    stats: {
      reposScanned: repos.length,
      branchesScanned: branchStates.length,
      usage: gh.usage(),
      failures: failures.length,
    },
    failures,
    timeline,
    branches: branchStates,
    changes,
    findings,
    exposures,
  }
}

/**
 * 화면 상단 요약.
 *
 * 여기서 "이상 없음" 같은 결론을 만들지 않는다.
 * 바뀐 것이 몇 개인지, 확인 못 한 것이 몇 개인지만 센다.
 */
export function summarize(c: CaseFile) {
  const by = (s: BranchState['status']) => c.branches.filter((b) => b.status === s).length
  const changedFiles = c.changes.reduce((n, x) => n + x.files.length, 0)
  const signalled = c.changes.reduce(
    (n, x) => n + x.files.filter((f) => f.signalIds.length > 0).length,
    0,
  )

  return {
    changed: by('changed'),
    reverted: by('reverted'),
    untouched: by('untouched'),
    unknown: by('unknown'),
    total: c.branches.length,
    failures: c.failures.length,
    changedFiles,
    /** 신호가 붙은 파일 수. 나머지 변경도 사람이 봐야 한다. */
    signalled,
    /** 신호 없이 바뀐 파일 수 - 사람이 직접 읽어야 하는 몫 */
    unreviewed: changedFiles - signalled,
    /**
     * 자동으로 실행되는 자리에서 바뀐 파일 수.
     *
     * 임계값이 없다. 바뀌었거나 안 바뀌었거나 둘 중 하나라 판정할 게 없고,
     * 그래서 매번 보고해도 소음이 되지 않는다.
     */
    autoRun: countByRole(c.changes.flatMap((x) => x.files.map((f) => f.path))),
    /** 기록을 덮어쓴 푸시가 일어난 브랜치 수 */
    forcedBranches: c.branches.filter((b) =>
      b.forcedPushes.some((p) => p.kind === 'forced' || p.kind === 'unrelated'),
    ).length,
    /** 이전 기록과 아예 이어지지 않게 갈아치워진 브랜치 수. 사라진 양을 셀 수조차 없다. */
    rewrittenBranches: c.branches.filter((b) => b.forcedPushes.some((p) => p.kind === 'unrelated'))
      .length,
    /** 그렇게 사라진 커밋 수의 합. 되돌리기로도 못 살리는 작업의 양이다. */
    droppedCommits: c.branches.reduce((n, b) => n + b.droppedCommits, 0),
    /**
     * 비공개에서 공개로 바뀐 저장소 수.
     *
     * **`null` 은 0 이 아니다.** 이 검사가 없던 때 남긴 사건 파일이라 안 봤다는 뜻이다.
     * 화면에서 둘을 같은 0 으로 그리면, 안 본 것이 확인한 것처럼 보인다.
     */
    exposed: c.exposures ? c.exposures.length : null,
    complete: c.failures.length === 0,
  }
}

/**
 * "0건" 을 갈라 읽는다.
 *
 * 화면에 0 이라고만 뜨면 사람은 그걸 "안전하다" 로 읽는다.
 * 그런데 0 이 나오는 경우는 셋이고, **뜻이 전혀 다르다.**
 *
 *   활동 없음 - 그 시간대에 아무도 안 건드렸다. 비교할 것 자체가 없다
 *   변화 없음 - 푸시는 있었지만 내용이 그대로다
 *   확인 못 함 - 조회에 실패해서 결과를 단정할 수 없다
 *
 * 어느 쪽인지 말해주지 않으면 도구가 사람을 오해하게 만든다.
 */
export type Verdict = 'no-activity' | 'no-changes' | 'incomplete' | 'exposed' | 'has-changes'

export function verdictOf(c: CaseFile): Verdict {
  const s = summarize(c)
  if (s.unknown > 0 || s.failures > 0) return 'incomplete'
  /*
    공개 전환을 파일 변경보다 먼저 본다.

    파일은 되돌릴 수 있다. 인터넷에 한 번 나간 것은 안 된다. 누가 언제 받아갔는지
    알 방법도 없어서, 이건 되돌리기가 아니라 비밀을 전부 갈아끼우는 일이 된다.

    그리고 이 일은 **푸시 하나 없이도 일어난다.** 그때 이 줄이 없으면
    바로 아래에서 '활동 없음' 이 나가고, 화면은 아무 일도 없었다고 말한다.
  */
  if (s.exposed && s.exposed > 0) return 'exposed'
  if (c.timeline.length === 0) return 'no-activity'
  if (s.changedFiles > 0) return 'has-changes'
  return 'no-changes'
}

/** 그 판정을 사람 말로. 절대 "안전합니다" 라고 쓰지 않는다. */
export function verdictText(c: CaseFile): { title: string; detail: string } {
  const s = summarize(c)
  const t = tr().verdict

  switch (verdictOf(c)) {
    case 'no-activity':
      return t.noActivity
    case 'incomplete':
      return {
        title: t.incompleteTitle(s.unknown, s.failures),
        detail: t.incompleteDetail,
      }
    case 'exposed':
      return {
        title: t.exposedTitle(s.exposed ?? 0),
        detail: t.exposedDetail(s.changedFiles),
      }
    case 'no-changes':
      return { title: t.noChanges.title, detail: t.noChanges.detail(s.total) }
    case 'has-changes':
      return {
        title: t.hasChangesTitle(s.changedFiles),
        detail: t.hasChangesDetail(s.unreviewed),
      }
  }
}

export { detectorById }

/**
 * 남은 한도가 이 아래면 미리 말한다.
 *
 * 시간당 5,000회다. 저장소 14개 브랜치 134개짜리 훑기가 얼마를 쓰는지 재보고 정한 값이 아니라,
 * **한 번 더 훑을 여유가 있는지**를 기준으로 잡았다. 사고가 나면 사람들은 한 번만 훑지 않는다.
 */
const LOW_BUDGET = 500

/**
 * 이번 훑기가 든 비용을 사람 말로.
 *
 * 한도에 걸리면 화면에는 "확인 못 함" 이 무더기로 뜬다. 그게 권한 문제인지
 * 한도 문제인지 구별이 안 되면, 사람은 없는 문제를 쫓게 된다.
 */
export function usageText(c: CaseFile): { line: string; lowBudget: boolean } | null {
  const u = c.stats.usage
  if (!u) return null

  const t = tr().usage
  const low = u.remaining !== undefined && u.remaining < LOW_BUDGET

  return {
    line: [
      t.calls(u.calls),
      u.saved > 0 ? t.saved(u.saved) : null,
      u.remaining !== undefined ? t.remaining(u.remaining) : null,
    ]
      .filter(Boolean)
      .join(', '),
    lowBudget: low,
  }
}
