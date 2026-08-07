import { tr } from '../../i18n'
import { roleOf } from '../fileRole'
import { newWorkflowRisks, readWorkflowRisks } from '../workflowRisks'
import type { Detector, DetectorContext, Finding } from '../types'

/**
 * 바뀐 워크플로가 무엇을 열어뒀는지.
 *
 * 경로로 "자동 실행되는 자리" 표시는 이미 하고 있었다. 정작 **안을 안 봤다.**
 *
 * 지금 열려 있는 것을 전부 올리지 않는다. 몇 년째 그랬던 저장소에서도 뜨고,
 * 우리가 물어본 시간대 밖의 이야기가 된다. **이 시간대에 새로 생긴 것만** 본다.
 *
 * 판정하지 않는다. `pull_request_target` 을 제대로 쓰는 곳도 많다.
 * 우리가 말하는 건 "이 푸시가 이걸 만들었다" 까지다.
 */
export const workflowRiskDetector: Detector = {
  id: 'workflow-risk',
  get name() {
    return tr().detectors.workflowRisk.name
  },
  get rationale() {
    return tr().detectors.workflowRisk.rationale
  },
  defaultAttention: 'first',
  enabledByDefault: true,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const out: Finding[] = []

    for (const change of ctx.changes) {
      // 새로 생긴 파일에는 비교할 이전 상태가 없다. 처음부터 그랬던 것과 구별이 안 된다.
      const targets = change.files.filter(
        (f) => f.kind === 'modified' && roleOf(f.path) === 'workflow',
      )

      for (const file of targets) {
        /*
          `pin-loosened` 도 같은 파일을 같은 두 시점에서 읽는다.
          클라이언트가 내용을 기억해두기 때문에 여기서 다시 받아오지 않는다.
        */
        const [before, after] = await Promise.all([
          read(ctx, change.repo, file.path, change.baseSha),
          read(ctx, change.repo, file.path, change.headSha),
        ])

        if (before === null || after === null) continue

        const added = newWorkflowRisks(readWorkflowRisks(before), readWorkflowRisks(after))
        if (added.length === 0) continue

        out.push({
          id: `wfrisk-${change.repo}-${change.branch}-${file.path}`,
          detectorId: 'workflow-risk',
          attention: 'first',
          /*
            줄 단위로 읽는다. 진짜 파서라면 잡을 것을 놓칠 수 있어서 medium 이다.
            찾은 것 자체는 확실한데, 못 찾은 것이 없다고는 말 못 한다.
          */
          confidence: 'medium',
          repo: change.repo,
          branch: change.branch,
          path: file.path,
          facts: {
            kind: 'workflow-risk',
            path: file.path,
            risks: added,
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
    ctx.reportFailure(`${repo}:${path}`, tr().detectors.workflowRisk.readFailed(String(err)))
    return null
  }
}
