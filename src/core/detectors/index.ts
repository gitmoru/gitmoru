import type { Detector } from '../types'
import { forgedCommitDetector } from './forgedCommit'
import { sizeJumpDetector } from './sizeJump'
import { pinLoosenedDetector } from './pinLoosened'
import { sharedBlobDetector } from './sharedBlob'
import { signingDroppedDetector } from './signingDropped'
import { toolMarkerDetector } from './toolMarker'

/**
 * 탐지기 레지스트리.
 *
 * 새 공격 유형을 만나면 여기에 한 줄 추가하면 UI, MCP 양쪽에 자동으로 노출된다.
 *
 * 규칙 하나 - **파일 이름만으로 판단하는 탐지기는 추가하지 않는다.**
 * 실제 조사 중에 `.vscode/tasks.json` 과 폰트 파일명으로만 찾다가
 * `eslint.config.js` 에 붙은 같은 페이로드를 놓쳤다. 이름은 언제든 바뀐다.
 * 크기, 해시, 메타데이터처럼 공격자가 바꾸기 어려운 걸 근거로 삼는다.
 */
export const DETECTORS: Detector[] = [
  forgedCommitDetector,
  sizeJumpDetector,
  pinLoosenedDetector,
  sharedBlobDetector,
  signingDroppedDetector,
  toolMarkerDetector,
]

export const detectorById = new Map(DETECTORS.map((d) => [d.id, d]))

/** 사용자가 저장한 설정이 없을 때 쓰는 기본 설정 */
export function defaultDetectorConfig() {
  const config: Record<string, { enabled: boolean; options: Record<string, unknown> }> = {}
  for (const d of DETECTORS) {
    const options: Record<string, unknown> = {}
    for (const opt of d.options ?? []) options[opt.key] = opt.default
    config[d.id] = { enabled: d.enabledByDefault, options }
  }
  return config
}

export {
  forgedCommitDetector,
  sizeJumpDetector,
  pinLoosenedDetector,
  sharedBlobDetector,
  signingDroppedDetector,
  toolMarkerDetector,
}
