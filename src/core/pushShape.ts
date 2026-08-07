import { ApiError } from './github'
import type { GitHubReader, PushEvent, PushShape } from './types'
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

async function shapeOf(
  gh: GitHubReader,
  event: PushEvent,
  onFailure: (target: string, reason: string) => void,
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
    event.signing = result.signing

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

/**
 * 모든 푸시의 모양을 채운다. 이벤트 객체를 그 자리에서 고친다.
 *
 * 이벤트 하나당 비교 한 번이라 호출 수가 이벤트 수만큼 늘어난다.
 * 시간대 안의 푸시만 보기 때문에 상한이 있고, 그래도 몇 개씩 나눠서 부른다.
 */
export async function fillPushShapes(
  gh: GitHubReader,
  events: PushEvent[],
  onFailure: (target: string, reason: string) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0
  for (let i = 0; i < events.length; i += BATCH) {
    const slice = events.slice(i, i + BATCH)
    await Promise.all(
      slice.map(async (event) => {
        event.push = await shapeOf(gh, event, onFailure)
        done++
      }),
    )
    onProgress?.(done, events.length)
  }
}

/** 브랜치 하나에서 일어난 강제 푸시만 골라 모은다. */
export function forcedOn(events: PushEvent[], repo: string, branch: string): PushShape[] {
  return events
    .filter((e) => e.repo === repo && e.branch === branch)
    .map((e) => e.push)
    .filter((shape): shape is PushShape => Boolean(shape) && shape!.kind !== 'fast-forward')
}
