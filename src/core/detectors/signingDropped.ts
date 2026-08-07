import { tr } from '../../i18n'
import type { Detector, DetectorContext, Finding } from '../types'

/**
 * 서명하던 브랜치가 안 하게 됐다.
 *
 * 서명이 없다는 것 자체는 아무 뜻도 아니다. 키 없는 컴퓨터에서 올리는 일은 흔하고,
 * 애초에 서명을 안 쓰는 저장소가 대부분이다. 그것만 세서 올리면 **어디서나 뜨는 신호**가 되고,
 * 어디서나 뜨는 신호는 곧 아무도 안 읽는 신호가 된다.
 *
 * 그래서 기준점을 본다. 푸시 **직전** 커밋이 서명돼 있었는지다.
 * 하던 것을 안 하게 된 건 사실이고, 안 하던 것을 계속 안 하는 건 아무것도 아니다.
 *
 * 기준점은 공짜로 온다. 비교 응답에 `base_commit` 이 같이 들어 있어서
 * 이 탐지기는 API 를 한 번도 안 부른다.
 *
 * 그래도 판정은 아니다. 키를 못 쓰는 환경에서 급하게 올릴 수도 있다.
 * 우리가 말하는 건 "이 시간대에 그게 바뀌었다" 까지다.
 */
export const signingDroppedDetector: Detector = {
  id: 'signing-dropped',
  get name() {
    return tr().detectors.signingDropped.name
  },
  get rationale() {
    return tr().detectors.signingDropped.rationale
  },
  defaultAttention: 'soon',
  enabledByDefault: true,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const out: Finding[] = []

    for (const ev of ctx.events) {
      const s = ev.signing
      if (!s) continue

      /*
        서명이 붙어 있는데 검증이 안 되는 것부터 본다.

        이건 기준점이 없어도 말이 된다. 서명을 안 하는 건 평범하지만
        **안 맞는 서명을 붙이는 건 평범한 작업에서 잘 안 나온다.**
        키가 만료됐거나, 남의 이름으로 올렸거나, 둘 중 하나다.
      */
      const bad = s.badSignature > 0

      // 하던 걸 안 하게 된 경우. 기준점이 확인됐고 서명돼 있었을 때만이다.
      const dropped = s.baseSigned === true && s.unsigned > 0

      if (!bad && !dropped) continue

      out.push({
        id: `signing-${ev.repo}-${ev.branch}-${ev.head.slice(0, 8)}`,
        detectorId: 'signing-dropped',
        // 안 맞는 서명이 더 드물다. 먼저 보게 올린다.
        attention: bad ? 'first' : 'soon',
        confidence: bad ? 'high' : 'medium',
        repo: ev.repo,
        branch: ev.branch,
        sha: ev.head,
        facts: {
          kind: 'signing-dropped',
          baseSigned: s.baseSigned === true,
          seen: s.seen,
          unsigned: s.unsigned,
          badSignature: s.badSignature,
          // 250개를 넘으면 우리가 본 것이 전부가 아니다. 숨기지 않는다.
          partial: s.total > s.seen,
          compareHref: `https://github.com/${ev.repo}/compare/${ev.before.slice(0, 12)}...${ev.head.slice(0, 12)}`,
        },
      })
    }

    return out
  },
}
