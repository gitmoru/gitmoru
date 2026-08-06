import { tr } from '../../i18n'
import type { Detector, Finding } from '../types'

/**
 * 설정, 진입 파일의 크기 급증 탐지.
 *
 * 공격자는 프로젝트가 자동으로 읽는 파일 뒤에 공백을 길게 넣어 화면 밖으로 밀어낸 다음
 * 난독화된 로더를 붙인다. 파일명은 그대로라서 눈에 안 띄지만 크기는 정직하게 늘어난다.
 *
 * 실제로 확인된 사례:
 *   eslint.config.js     926B → 10,148B   (11배)
 *   postcss.config.js     80B →  9,304B  (116배)
 *
 * 이 규칙은 **API 를 한 번도 부르지 않는다.** 이미 모아둔 변경 내역에
 * 전후 크기가 다 들어 있기 때문이다. 트리를 다시 받으면 브랜치 수만큼
 * 같은 일을 반복하게 되고, 그게 검사가 느려지는 가장 큰 원인이었다.
 */
export const sizeJumpDetector: Detector = {
  id: 'size-jump',
  get name() {
    return tr().detectors.sizeJump.name
  },
  get rationale() {
    return tr().detectors.sizeJump.rationale
  },
  defaultAttention: 'first',
  enabledByDefault: true,
  options: [
    {
      key: 'watchPatterns',
      get label() {
        return tr().detectors.sizeJump.watchLabel
      },
      get help() {
        return tr().detectors.sizeJump.watchHelp
      },
      type: 'stringList',
      default: [
        '(^|/)[^/]*\\.config\\.(js|ts|cjs|mjs)$',
        '^\\.vscode/',
        '(^|/)package\\.json$',
        '(^|/)(gulpfile|Gruntfile|webpack\\.config)\\.',
        '(^|/)\\.husky/',
        '(^|/)Makefile$',
        '(^|/)(setup|conftest)\\.py$',
        '(^|/)build\\.gradle(\\.kts)?$',
      ],
    },
    {
      key: 'minRatio',
      get label() {
        return tr().detectors.sizeJump.ratioLabel
      },
      get help() {
        return tr().detectors.sizeJump.ratioHelp
      },
      type: 'number',
      default: 3,
    },
    {
      key: 'minBytes',
      get label() {
        return tr().detectors.sizeJump.minLabel
      },
      get help() {
        return tr().detectors.sizeJump.minHelp
      },
      type: 'number',
      default: 1024,
    },
  ],

  async run(ctx): Promise<Finding[]> {
    const patterns = (ctx.options.watchPatterns as string[]).map((p) => new RegExp(p))
    const minRatio = Number(ctx.options.minRatio ?? 3)
    const minBytes = Number(ctx.options.minBytes ?? 1024)
    const findings: Finding[] = []

    const watched = (path: string) => patterns.some((re) => re.test(path))

    for (const branchChanges of ctx.changes) {
      for (const f of branchChanges.files) {
        if (f.kind === 'removed' || !watched(f.path)) continue

        const after = f.sizeAfter ?? 0
        if (after < minBytes) continue

        const before = f.sizeBefore
        const isNew = f.kind === 'added' || before === undefined
        const ratio = isNew ? Infinity : after / Math.max(1, before!)
        if (!isNew && ratio < minRatio) continue

        findings.push({
          id: `size-jump:${branchChanges.repo}:${branchChanges.branch}:${f.path}`,
          detectorId: 'size-jump',
          attention: 'first',
          confidence: 'high',
          repo: branchChanges.repo,
          branch: branchChanges.branch,
          path: f.path,
          sha: f.blobAfter,
          facts: {
            kind: 'size-jump',
            path: f.path,
            after,
            // 새로 생긴 파일에는 '몇 배' 가 없다. 없는 걸 Infinity 로 적지 않는다.
            ...(isNew ? {} : { before: before!, ratio: Math.round(ratio) }),
            fileHref: `https://github.com/${branchChanges.repo}/blob/${branchChanges.headSha}/${f.path}`,
          },
          sampleRef: {
            repo: branchChanges.repo,
            path: f.path,
            ref: branchChanges.headSha,
            sizeBytes: after,
            blobSha: f.blobAfter ?? '',
          },
        })
      }
    }

    return findings
  },
}
