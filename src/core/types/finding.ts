/**
 * 먼저 볼 것을 골라주는 신호.
 *
 * 판정이 아니라 형광펜이다. 등급도 위험도가 아니라 **주목도**다.
 * 신호가 0건이어도 그게 "안전하다" 는 뜻이 아니다.
 */

import type { BranchChanges, SampleRef } from './changes'
import type { BranchRef, GitHubReader, PushEvent, RepoRef } from './github'
import type { TimeWindow } from './case'

/** 신호의 주목도. "얼마나 먼저 봐야 하는가"이지 "얼마나 위험한가"가 아니다. */
export type Attention = 'first' | 'soon' | 'later'

/**
 * 사람이 "왜 이게 의심스러운지" 한눈에 보는 단위.
 * label 은 화면에 그대로 뜨므로 숫자를 포함해 구체적으로 쓴다.
 * 예: "정상 926B → 현재 10,148B"
 */
export interface Evidence {
  label: string
  detail?: string
  /** GitHub 웹 링크. 우리 도메인 밖 URL 은 여기에만 허용한다 (사용자가 눌러서 확인). */
  href?: string
}

/**
 * 탐지 신호.
 *
 * **판정이 아니라 형광펜이다.** "이건 악성이다"가 아니라
 * "이건 먼저 읽어볼 만하다"를 뜻한다. 최종 판단은 diff 를 읽는 쪽이 한다.
 *
 * 그래서 이름이 Finding 이어도 화면에는 "신호"로 표시하고,
 * 신호가 없다고 해서 안전하다는 뜻이 되지 않게 문구를 쓴다.
 */
export interface Finding {
  id: string
  /** 어느 탐지기가 올렸는지 */
  detectorId: string
  /** 얼마나 먼저 봐야 하는가 */
  attention: Attention
  /** 이 신호가 얼마나 확실한가. 낮다고 무시하라는 뜻은 아니다. */
  confidence: 'high' | 'medium' | 'low'
  repo: string
  branch?: string
  path?: string
  sha?: string
  /** 짧은 제목. 예: "설정 파일 크기가 11배 늘었습니다" */
  title: string
  /** 한 문장 설명 */
  summary: string
  evidence: Evidence[]
  /**
   * 페이로드 원문은 여기 담지 않는다. 필요할 때 API 로 다시 가져온다.
   * 대신 어디서 가져올지만 기록한다.
   */
  sampleRef?: SampleRef
}

/** UI 에서 사용자가 조정할 수 있는 설정 항목 */
export interface DetectorOption {
  key: string
  label: string
  help?: string
  type: 'number' | 'boolean' | 'stringList'
  default: number | boolean | string[]
}

export interface DetectorContext {
  window: TimeWindow
  actor?: string
  /** 스캔 대상 저장소 */
  repos: RepoRef[]
  /** 시간대 안에서 수집한 푸시 이벤트 */
  events: PushEvent[]
  /** 현재 브랜치 상태 (SHA 포함) */
  branches: BranchRef[]
  /**
   * 이미 수집해둔 변경 내역.
   *
   * 탐지기는 **이걸 먼저 본다.** 여기에 파일 경로, 전후 크기, blob 해시가 다 들어 있어서
   * 대부분의 규칙은 API 를 한 번도 안 불러도 된다.
   * 트리를 다시 받으면 브랜치 수만큼 같은 일을 반복하게 된다.
   */
  changes: BranchChanges[]
  /** GitHub 읽기 전용 접근자. 프록시를 통해서만 나간다. */
  gh: GitHubReader
  /** 이 탐지기의 사용자 설정값 */
  options: Record<string, number | boolean | string[]>
  /** 검사 실패를 보고하는 통로. 삼키지 말고 반드시 여기로 올린다. */
  reportFailure: (target: string, reason: string) => void
  /** 오래 걸리는 규칙이 "아직 살아있다"고 알리는 통로. 조용하면 멈춘 줄 안다. */
  reportProgress?: (message: string) => void
}

export interface Detector {
  id: string
  /** 화면에 뜨는 이름 */
  name: string
  /** 이 탐지기가 무엇을 근거로 눈에 띄게 하는지 한 문장 */
  rationale: string
  /** 이 신호를 얼마나 위로 올릴지 */
  defaultAttention: Attention
  /** 기본 활성화 여부 */
  enabledByDefault: boolean
  options?: DetectorOption[]
  run(ctx: DetectorContext): Promise<Finding[]>
}
