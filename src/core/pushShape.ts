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

async function shapeOf(
  gh: GitHubReader,
  event: PushEvent,
  onFailure: (target: string, reason: string) => void,
): Promise<PushShape> {
  if (!event.before || !event.head) {
    return { kind: 'unknown', droppedCommits: 0, addedCommits: 0, reason: tr().push.noBefore }
  }

  // 같은 자리면 비교할 것이 없다. 브랜치를 만들거나 지운 경우다.
  if (event.before === event.head) {
    return { kind: 'fast-forward', droppedCommits: 0, addedCommits: 0 }
  }

  try {
    const result = await gh.compare(event.repo, event.before, event.head)
    return {
      // 사라진 커밋이 하나라도 있으면 기록을 덮어쓴 것이다.
      kind: result.behindBy > 0 ? 'forced' : 'fast-forward',
      droppedCommits: result.behindBy,
      addedCommits: result.aheadBy,
    }
  } catch (err) {
    // 확인 못 한 것을 '평범한 푸시' 로 접지 않는다 (SAFETY.md 11번).
    const reason = tr().push.compareFailed(String(err))
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
