import { tr } from '../../i18n'
import type { Detector, Finding } from '../types'

/**
 * 저장소를 넘나드는 동일 파일 탐지.
 *
 * 공격자가 도구로 페이로드를 뿌리면 여러 저장소에 **완전히 같은 내용의 파일**이 들어간다.
 * git blob 해시는 내용의 해시라서, 같은 해시가 서로 다른 저장소에 동시에 나타나면
 * 누군가 같은 파일을 복사해 넣었다는 뜻이다.
 *
 * 실제로 확인된 사례 - 폰트로 위장한 로더 하나가 12개 저장소에 같은 해시로 존재했다.
 *
 * 오탐을 막는 핵심은 **그때 새로 생긴 파일만** 본다는 점이다.
 * gradlew, LICENSE 처럼 원래 여러 저장소에 같이 있는 파일은 자연스럽게 걸러진다.
 *
 * 이 규칙도 API 를 부르지 않는다. 변경 내역에 blob 해시가 이미 들어 있다.
 */
export const sharedBlobDetector: Detector = {
  id: 'shared-blob',
  get name() {
    return tr().detectors.sharedBlob.name
  },
  get rationale() {
    return tr().detectors.sharedBlob.rationale
  },
  defaultAttention: 'first',
  enabledByDefault: true,
  options: [
    {
      key: 'minRepos',
      get label() {
        return tr().detectors.sharedBlob.minLabel
      },
      get help() {
        return tr().detectors.sharedBlob.minHelp
      },
      type: 'number',
      default: 2,
    },
  ],

  async run(ctx): Promise<Finding[]> {
    const minRepos = Number(ctx.options.minRepos ?? 2)

    /** blob 해시 → 새로 나타난 자리들 */
    const introduced = new Map<
      string,
      Array<{ repo: string; branch: string; path: string; size: number; ref: string }>
    >()

    for (const c of ctx.changes) {
      for (const f of c.files) {
        // 새로 생긴 것만 본다. 원래 있던 파일은 여러 저장소에 겹쳐도 정상이다.
        if (f.kind !== 'added' || !f.blobAfter) continue

        const list = introduced.get(f.blobAfter) ?? []
        if (!list.some((x) => x.repo === c.repo)) {
          list.push({
            repo: c.repo,
            branch: c.branch,
            path: f.path,
            size: f.sizeAfter ?? 0,
            ref: c.headSha,
          })
        }
        introduced.set(f.blobAfter, list)
      }
    }

    const findings: Finding[] = []
    for (const [blobSha, places] of introduced) {
      const repos = [...new Set(places.map((p) => p.repo))]
      if (repos.length < minRepos) continue

      const head = places[0]
      if (!head) continue

      findings.push({
        id: `shared-blob:${blobSha.slice(0, 12)}`,
        detectorId: 'shared-blob',
        attention: 'first',
        confidence: 'high',
        repo: head.repo,
        branch: head.branch,
        path: head.path,
        sha: blobSha,
        facts: {
          kind: 'shared-blob',
          path: head.path,
          repoCount: repos.length,
          places: places.map((p) => ({ repo: p.repo, path: p.path })),
          fileHref: `https://github.com/${head.repo}/blob/${head.ref}/${head.path}`,
        },
        sampleRef: {
          repo: head.repo,
          path: head.path,
          ref: head.ref,
          sizeBytes: head.size,
          blobSha,
        },
      })
    }

    return findings
  },
}
