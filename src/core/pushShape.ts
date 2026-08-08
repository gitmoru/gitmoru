import { ApiError } from './github'
import type { CommitFacts, CompareSigning, GitHubReader, PushShape } from './types'
import { tr } from '../i18n'

/**
 * 푸시가 기록을 덮어썼는지 알아낸다.
 *
 * GitHub 이벤트에는 강제 푸시 여부가 **안 들어 있다.** 확인해봤는데 `payload` 에
 * `before`, `head`, `push_id`, `ref`, `repository_id` 뿐이다.
 *
 * 그래서 직접 맞대본다. 푸시 전 커밋에 있던 것이 푸시 후에 없으면 기록이 덮어써진 것이고,
 * 없어진 커밋 수가 곧 사라진 작업의 양이다.
 *
 * **이건 판정이 아니라 사실이다.** 강제 푸시는 정상 작업에서도 한다.
 * 다만 "남의 브랜치 수십 개가 같은 시각에 강제 푸시됐다" 는 사람이 봐야 할 사실이다.
 * 우리는 그 사실만 세어서 내놓는다 (ADR 0002).
 */

/** 한 번에 몇 개까지 동시에 물어볼지. 저장소 하나에 브랜치가 수백 개일 수 있다. */
const BATCH = 6

/**
 * 두 커밋이 아예 다른 기록에 있는지.
 *
 * GitHub 은 이 경우 404 에 "No common ancestor between ..." 을 담아 준다.
 * 커밋이 정리돼서 없는 404 와 구분해야 한다. 앞은 사실이고 뒤는 확인 실패다.
 */
function isUnrelatedHistory(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && /No common ancestor/i.test(err.message)
}

/**
 * 사람이 읽을 만큼만 남긴다.
 *
 * ApiError 는 응답 본문을 그대로 물고 있어서, 화면에 흘리면 JSON 덩어리가 뜬다.
 * 실패한 이유를 알려주는 게 목적이지 응답을 보여주는 게 목적이 아니다.
 */
function shortReason(err: unknown): string {
  if (!(err instanceof ApiError)) return String(err)
  const body = err.message.replace(/^\d+\s*/, '')
  const message = body.match(/"message"\s*:\s*"([^"]+)"/)?.[1]
  return message ? `${err.status} ${message}` : `${err.status}`
}

/** 비교에 필요한 좌표만. 푸시 이벤트일 수도, 브랜치 전체일 수도 있다. */
type Span = { repo: string; branch: string; before: string; head: string }

/** 비교 응답에 같이 딸려오는 것들. 탐지기가 이걸로 API 를 안 부른다. */
type Carry = { signing?: CompareSigning; commits?: CommitFacts[] }

/** 브랜치 하나를 맞대본 결과 */
export interface BranchShape extends Carry {
  shape: PushShape
}

async function shapeOf(
  gh: GitHubReader,
  event: Span,
  onFailure: (target: string, reason: string) => void,
  /** 비교 응답에 딸려온 것을 담아 갈 곳 */
  carry: Carry = {},
): Promise<PushShape> {
  if (!event.before || !event.head) {
    return { kind: 'unknown', droppedCommits: 0, addedCommits: 0, reason: tr().push.noBefore }
  }

  // 같은 자리면 비교할 것이 없다.
  if (event.before === event.head) {
    return { kind: 'fast-forward', droppedCommits: 0, addedCommits: 0 }
  }

  /*
    0 으로 채워진 자리는 **브랜치가 그때 생겼다** 는 뜻이다. 덮어쓴 게 아니라 없던 게 생긴 것이라
    비교할 이전 상태가 없다. 확인 실패로 올리면 정상적인 브랜치 생성이 경고로 뜬다.

    지금 쓰는 이벤트 목록에서는 브랜치 생성이 CreateEvent 로 따로 와서 여기까지 잘 안 오지만,
    들어와도 놀라지 않게 막아둔다.
  */
  if (/^0+$/.test(event.before)) {
    return { kind: 'fast-forward', droppedCommits: 0, addedCommits: 0 }
  }

  try {
    const result = await gh.compare(event.repo, event.before, event.head)

    // 같은 응답에 들어 있던 것이다. 여기서 안 챙기면 다시 받으러 가야 한다.
    carry.signing = result.signing
    carry.commits = result.commits

    return {
      // 사라진 커밋이 하나라도 있으면 기록을 덮어쓴 것이다.
      kind: result.behindBy > 0 ? 'forced' : 'fast-forward',
      droppedCommits: result.behindBy,
      addedCommits: result.aheadBy,
    }
  } catch (err) {
    /*
      "공통 조상이 없다" 는 실패가 아니라 **사실이다.**

      두 커밋이 아예 다른 기록에 있다는 뜻이라, 브랜치가 이어붙은 게 아니라
      **통째로 갈아치워진 것**이다. `git checkout --orphan` 이나 새로 만든 기록을
      강제 푸시하면 이렇게 된다. 자동화 도구로 저장소를 덮어쓸 때 흔한 모양이다.

      사라진 커밋 수는 셀 수 없다. 비교 자체가 안 되기 때문이다.
      그래서 숫자 대신 "이어지지 않는다" 는 사실만 남긴다.
    */
    if (isUnrelatedHistory(err)) {
      return { kind: 'unrelated', droppedCommits: 0, addedCommits: 0 }
    }

    // 나머지는 확인 못 한 것이다. '평범한 푸시' 로 접지 않는다 (SAFETY.md 11번).
    const reason = tr().push.compareFailed(shortReason(err))
    onFailure(`${event.repo}/${event.branch}`, reason)
    return { kind: 'unknown', droppedCommits: 0, addedCommits: 0, reason }
  }
}

/** 브랜치 하나에 대해 물어볼 것 */
export interface BranchTarget {
  repo: string
  branch: string
  /** 시간대 안 첫 푸시 직전 커밋. 되돌아갈 자리다. */
  before: string
  /** 지금 브랜치가 가리키는 커밋 */
  head: string
  /** 시간대 안에 이 브랜치로 들어온 푸시 횟수. 이벤트만 세면 되고 API 는 안 쓴다. */
  pushes: number
}

/**
 * 브랜치마다 **한 번씩** 물어본다.
 *
 * 예전에는 푸시 하나당 한 번이었다. 실제 조직을 재보니 요청 890회 중 550회가 여기였고,
 * 그렇게 얻은 숫자도 틀렸다. 브랜치가 네 번 덮어써지면 **이미 사라진 커밋을 네 번 셌다.**
 * 한 번은 13,724개가 사라졌다고 화면에 떴는데, 그건 아무도 잃지 않은 수다.
 *
 * 첫 푸시 직전과 지금을 맞대면 사람이 실제로 궁금해하는 값이 나온다.
 * **무엇이 없어졌고, 되돌리면 무엇이 돌아오는가.** 중간에 덮어써진 상태는 따로 잃은 것이 아니다.
 *
 * 대신 푸시 하나하나의 모양은 못 남긴다. 몇 번 밀었는지는 이벤트에 이미 있어서 그대로 둔다.
 */
export async function shapeBranches(
  gh: GitHubReader,
  targets: BranchTarget[],
  onFailure: (target: string, reason: string) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, BranchShape>> {
  const out = new Map<string, BranchShape>()
  let done = 0

  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH)
    await Promise.all(
      slice.map(async (target) => {
        const carry: Carry = {}
        const shape = await shapeOf(
          gh,
          { repo: target.repo, branch: target.branch, before: target.before, head: target.head },
          onFailure,
          carry,
        )
        out.set(`${target.repo}/${target.branch}`, { shape, ...carry })
        done++
      }),
    )
    onProgress?.(done, targets.length)
  }

  return out
}
