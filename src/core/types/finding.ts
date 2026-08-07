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
/**
 * 신호가 붙은 **사실**. 문장이 아니다.
 *
 * 예전에는 탐지기가 훑는 순간에 문장을 완성해서 여기 박아 넣었다.
 * 그러면 그 사건은 처음 훑은 언어로 굳는다. 언어를 바꿔도 신호 문구만 안 바뀌고,
 * 사건을 파일로 남기게 되면서 **그게 디스크에 영구히 굳었다.**
 *
 * 그래서 재료만 담는다. 문장은 `describeFinding` 이 그릴 때 만든다.
 * 사건 파일은 증거의 기록이지 화면에 뜬 글의 사본이 아니라는 점에서도
 * 이쪽이 [ADR 0002](../../../docs/decisions/0002-evidence-not-verdict.md) 와 맞다.
 *
 * 링크(`href`)는 여기 남는다. 주소는 언어가 아니라 데이터다.
 */
export type FindingFacts =
  | {
      kind: 'size-jump'
      path: string
      /** 지금 크기 (바이트) */
      after: number
      /** 공격 직전 크기. 새로 생긴 파일이면 없다 */
      before?: number
      /** 몇 배로 늘었는지. 새로 생긴 파일이면 없다 */
      ratio?: number
      fileHref: string
    }
  | {
      kind: 'shared-blob'
      path: string
      repoCount: number
      /** 같은 내용이 나타난 자리들 */
      places: Array<{ repo: string; path: string }>
      fileHref: string
    }
  | {
      kind: 'forged-commit'
      authorName: string
      authorDate: string
      committerName: string
      committerDate: string
      /** author 와 committer 날짜가 며칠 벌어졌는지 */
      gapDays: number
      commitHref: string
    }
  | {
      kind: 'signing-dropped'
      /** 푸시 직전 커밋이 서명돼 있었나 */
      baseSigned: boolean
      /** 이 푸시로 우리가 실제로 본 커밋 수 */
      seen: number
      unsigned: number
      badSignature: number
      /** 250개를 넘어서 다 못 본 경우. 본 것이 전부인 척하지 않는다. */
      partial: boolean
      compareHref: string
    }
  | {
      kind: 'tool-marker'
      path: string
      /** 찾은 표식 줄들 */
      hits: string[]
      fileHref: string
    }

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
  /** 무엇을 근거로 올렸는지. 문장은 `describeFinding` 이 만든다. */
  facts: FindingFacts
  /**
   * 사건 파일 v1 에만 있는 굳은 문장.
   *
   * 그때 쓰던 언어 그대로다. 재료가 안 남아 있어서 다시 번역할 방법이 없다.
   * 지우지 않고 그대로 보여준다 - 옛 사건을 못 읽게 만드는 것보다는 낫다.
   */
  legacy?: { title: string; summary: string; evidence: Evidence[] }
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
