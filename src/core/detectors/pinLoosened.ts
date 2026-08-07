import { tr } from '../../i18n'
import { roleOf } from '../fileRole'
import { loosenedPins, readActionPins } from '../actionPins'
import type { Detector, DetectorContext, Finding } from '../types'

/**
 * 액션 고정이 풀린 자리.
 *
 * `@<40자리 해시>` 가 `@v46` 으로 바뀐 것만 본다. 되돌린 것처럼 보이지만
 * **고정돼 있던 것이 움직일 수 있게 된 것**이다. 태그는 주인이 언제든 옮긴다.
 *
 * 이 순간에는 악성 코드가 하나도 안 들어온다. 그게 이걸 그냥 지나치게 만드는 부분이다.
 * 문을 열어두는 일이라 나중에 태그만 옮기면 된다.
 *
 * 판정하지 않는다. 해시 쫓아다니기 싫어서 일부러 푸는 사람도 있다.
 * 우리가 말하는 건 **이 시간대에 그 일이 일어났다** 까지다.
 */
export const pinLoosenedDetector: Detector = {
  id: 'pin-loosened',
  get name() {
    return tr().detectors.pinLoosened.name
  },
  get rationale() {
    return tr().detectors.pinLoosened.rationale
  },
  defaultAttention: 'first',
  enabledByDefault: true,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const out: Finding[] = []

    for (const change of ctx.changes) {
      /*
        `modified` 만 본다.

        새로 생긴 파일에는 비교할 이전 상태가 없다. 안 박힌 채로 추가하는 건
        너무 흔해서, 그것까지 올리면 거의 모든 저장소에서 뜨고 아무도 안 읽게 된다.
      */
      const targets = change.files.filter(
        (f) => f.kind === 'modified' && roleOf(f.path) === 'workflow',
      )

      for (const file of targets) {
        // 전후 두 번 받는다. 워크플로 파일은 작고 개수도 적어서 여기서 멈출 일은 없다.
        const [before, after] = await Promise.all([
          read(ctx, change.repo, file.path, change.baseSha),
          read(ctx, change.repo, file.path, change.headSha),
        ])

        // 한쪽이라도 못 읽었으면 비교가 성립하지 않는다. 못 읽은 건 이미 위에서 올렸다.
        if (before === null || after === null) continue

        const loosened = loosenedPins(readActionPins(before), readActionPins(after))
        if (loosened.length === 0) continue

        out.push({
          id: `pin-${change.repo}-${change.branch}-${file.path}`,
          detectorId: 'pin-loosened',
          attention: 'first',
          // 파일에 적힌 그대로다. 해석이 끼어들 자리가 없다.
          confidence: 'high',
          repo: change.repo,
          branch: change.branch,
          path: file.path,
          facts: {
            kind: 'pin-loosened',
            path: file.path,
            actions: loosened,
            fileHref: `https://github.com/${change.repo}/blob/${change.headSha}/${file.path}`,
          },
        })
      }
    }

    return out
  },
}

/** 못 읽으면 조용히 넘어가지 않고 올린다 (SAFETY.md 11번). */
async function read(
  ctx: DetectorContext,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    return await ctx.gh.getTextFile(repo, path, ref)
  } catch (err) {
    ctx.reportFailure(`${repo}:${path}`, tr().detectors.pinLoosened.readFailed(String(err)))
    return null
  }
}
