import { tr } from '../i18n'
import { ApiError, type GitHubClient } from './github'
import type { BranchChanges, FileChange, TreeEntry } from './types'

/**
 * 의심 시간대에 실제로 바뀐 파일을 뽑아낸다.
 *
 * **이 모듈이 이 도구의 1차 산출물이다.**
 *
 * 탐지 규칙과 완전히 독립적으로 동작한다는 점이 핵심이다.
 * 우리가 한 번도 본 적 없는 수법이라도, 파일이 바뀌었다면 여기에는 반드시 나타난다.
 * 규칙은 이 목록을 정렬하는 데만 쓰고, "안 걸렸으니 괜찮다"는 결론은 어디서도 내리지 않는다.
 *
 * 비교 방식은 트리 대 트리다. 커밋 히스토리를 따라가지 않는 이유는
 * 공격자가 히스토리를 통째로 갈아버렸을 때도 결과가 정확해야 하기 때문이다.
 */
export async function collectChanges(
  gh: GitHubClient,
  repo: string,
  branch: string,
  baseSha: string,
  headSha: string,
  onFailure: (target: string, reason: string) => void,
): Promise<BranchChanges | null> {
  let baseTree: TreeEntry[]
  let headTree: TreeEntry[]
  let partial = false

  try {
    headTree = await gh.getTree(repo, headSha)
  } catch (err) {
    onFailure(`${repo}/${branch}`, describe(err, tr().reasons.currentTree))
    return null
  }

  try {
    baseTree = await gh.getTree(repo, baseSha)
  } catch (err) {
    // 공격 직전 상태를 못 구하면 "무엇이 바뀌었는지"를 말할 수 없다.
    // 추측해서 채우지 않고 실패로 올린다.
    onFailure(`${repo}/${branch}`, describe(err, tr().reasons.beforeTree))
    return null
  }

  const base = new Map<string, TreeEntry>()
  for (const e of baseTree) if (e.type === 'blob') base.set(e.path, e)

  const head = new Map<string, TreeEntry>()
  for (const e of headTree) if (e.type === 'blob') head.set(e.path, e)

  const files: FileChange[] = []

  for (const [path, after] of head) {
    const before = base.get(path)
    if (!before) {
      files.push({
        path,
        kind: 'added',
        sizeAfter: after.size,
        blobAfter: after.sha,
        signalIds: [],
      })
    } else if (before.sha !== after.sha) {
      files.push({
        path,
        kind: 'modified',
        sizeBefore: before.size,
        sizeAfter: after.size,
        blobBefore: before.sha,
        blobAfter: after.sha,
        signalIds: [],
      })
    }
  }

  for (const [path, before] of base) {
    if (head.has(path)) continue
    files.push({
      path,
      kind: 'removed',
      sizeBefore: before.size,
      blobBefore: before.sha,
      signalIds: [],
    })
  }

  // 사람이 먼저 볼 것부터. 추가된 파일이 가장 수상하고, 그다음이 크게 늘어난 파일.
  files.sort((a, b) => {
    const rank = (f: FileChange) => (f.kind === 'added' ? 0 : f.kind === 'modified' ? 1 : 2)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return growth(b) - growth(a)
  })

  return { repo, branch, baseSha, headSha, files, partial }
}

/** 크기가 몇 배 늘었는지. 정렬용. */
export function growth(f: FileChange): number {
  if (f.sizeAfter === undefined) return 0
  if (!f.sizeBefore) return f.sizeAfter
  return f.sizeAfter / f.sizeBefore
}

function describe(err: unknown, what: string): string {
  const t = tr().reasons
  if (err instanceof ApiError) {
    if (err.message.includes('truncated')) return t.treeTruncated(what)
    if (err.status === 404) return t.notFound(what)
    return t.lookupFailed(what, err.status)
  }
  return t.lookupError(what, String(err))
}

/**
 * 변경 목록을 "먼저 읽어야 할 순서"로 정렬한다.
 *
 * 신호가 붙은 것이 위로 오되, **신호가 없는 변경도 목록에서 사라지지 않는다.**
 * 사라지게 만들면 규칙이 놓친 공격을 사람도 못 보게 된다.
 */
export function rankChanges(changes: BranchChanges[]): BranchChanges[] {
  return [...changes].sort((a, b) => {
    const signals = (c: BranchChanges) => c.files.reduce((n, f) => n + f.signalIds.length, 0)
    if (signals(a) !== signals(b)) return signals(b) - signals(a)
    return b.files.length - a.files.length
  })
}
