import { tr } from '../../i18n'
import type { Detector, Finding } from '../types'

/**
 * 공격 도구가 남긴 흔적 탐지.
 *
 * 자동화 도구로 여러 저장소를 덮어쓰는 공격자는 작업용 임시 파일을 만든다.
 * 그리고 그게 커밋에 섞여 들어가지 않게 `.gitignore` 에 추가한다 - 그 줄이 그대로 지문이 된다.
 *
 * 실제로 겪은 사고에서는 `.gitignore` 에 아래 세 줄이 추가돼 있었다:
 *     branch_structure.json
 *     temp_auto_push.bat
 *     temp_interactive_push.bat
 *
 * 페이로드보다 찾기 쉽고, 같은 도구를 쓴 다른 사고를 알아보는 데도 쓸모가 있다.
 * 새로운 지문을 발견하면 아래 목록에 추가하면 된다.
 */
export const toolMarkerDetector: Detector = {
  id: 'tool-marker',
  get name() {
    return tr().detectors.toolMarker.name
  },
  get rationale() {
    return tr().detectors.toolMarker.rationale
  },
  defaultAttention: 'first',
  enabledByDefault: true,
  options: [
    {
      key: 'markers',
      get label() {
        return tr().detectors.toolMarker.knownLabel
      },
      get help() {
        return tr().detectors.toolMarker.knownHelp
      },
      type: 'stringList',
      default: ['branch_structure.json', 'temp_auto_push.bat', 'temp_interactive_push.bat'],
    },
    {
      key: 'files',
      get label() {
        return tr().detectors.toolMarker.filesLabel
      },
      type: 'stringList',
      default: ['.gitignore', '.git/info/exclude'],
    },
  ],

  async run(ctx): Promise<Finding[]> {
    const markers = ctx.options.markers as string[]
    const files = ctx.options.files as string[]
    const findings: Finding[] = []

    // 저장소당 한 번만. 그리고 실제로 뭔가 바뀐 저장소만 본다.
    const seen = new Set<string>()
    const targets = ctx.changes.length
      ? ctx.changes.map((c) => ({ repo: c.repo, branch: c.branch, sha: c.headSha }))
      : ctx.branches.filter((b) => ctx.events.some((e) => e.repo === b.repo && e.branch === b.branch))

    for (const branch of targets) {
      if (seen.has(branch.repo)) continue
      seen.add(branch.repo)

      for (const file of files) {
        let content: string | null
        try {
          content = await ctx.gh.getTextFile(branch.repo, file, branch.sha)
        } catch (err) {
          ctx.reportFailure(
            `${branch.repo}:${file}`,
            tr().detectors.toolMarker.fileFailed(String(err)),
          )
          continue
        }
        if (!content) continue

        const lines = content.split('\n').map((l) => l.trim())
        const hits = markers.filter((m) => lines.includes(m))
        if (hits.length === 0) continue

        const t = tr().detectors.toolMarker
        findings.push({
          id: `tool-marker:${branch.repo}:${file}`,
          detectorId: 'tool-marker',
          attention: 'first',
          confidence: 'high',
          repo: branch.repo,
          branch: branch.branch,
          path: file,
          title: t.title,
          summary: t.summary(file, hits.length),
          evidence: [
            { label: t.foundLabel, detail: hits.join('\n') },
            { label: t.whyLabel, detail: t.whyDetail },
            {
              label: t.openFile,
              href: `https://github.com/${branch.repo}/blob/${branch.sha}/${file}`,
            },
          ],
        })
      }
    }

    return findings
  },
}
