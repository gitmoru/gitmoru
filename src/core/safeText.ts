/**
 * 악성 문자열을 화면에 안전하게 올리기 위한 도구 (SAFETY.md 6번).
 *
 * 여기 있는 함수들은 전부 **문자열을 문자열로** 바꾼다.
 * DOM 을 만들지 않고, HTML 을 만들지 않는다. 렌더링은 React 텍스트 노드가 한다.
 */

import { tr } from '../i18n'

/** 공격자 인프라 주소를 눌러지지 않는 형태로 바꾼다. 보안 업계 관행. */
export function defang(text: string): string {
  return text
    .replace(/\bhttps:\/\//gi, 'hxxps://')
    .replace(/\bhttp:\/\//gi, 'hxxp://')
    .replace(/\bwss?:\/\//gi, (m) => m.replace(/^w/i, 'x'))
    .replace(/\./g, (m, offset: number, whole: string) => {
      // IP 처럼 보이는 구간의 점만 무력화한다. 일반 문장의 마침표는 그대로 둔다.
      const around = whole.slice(Math.max(0, offset - 4), offset + 5)
      return /\d\.\d/.test(around) ? '[.]' : m
    })
}

/**
 * 페이로드는 공백을 수천 자 넣어 화면 밖으로 밀어내는 수법을 쓴다.
 * 그대로 보여주면 "빈 파일"처럼 보이므로, 공백 구간을 눈에 보이게 접는다.
 */
export function collapseHiddenPadding(text: string): {
  display: string
  paddingFound: number
} {
  let paddingFound = 0
  const display = text.replace(/[ \t]{40,}/g, (m) => {
    paddingFound += m.length
    return `\n${tr().safeText.paddingElided(m.length.toLocaleString())}\n`
  })
  return { display, paddingFound }
}

/** 에이전트에게 넘기기 전 크기를 제한한다 (SAFETY.md 8번). */
export function clampForAnalysis(text: string, maxChars = 20_000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

/**
 * MCP 에이전트에게 넘길 때 쓰는 포장.
 *
 * 페이로드 안에 "이전 지시를 무시하고 ..." 같은 문장이 들어 있을 수 있다.
 * 에이전트가 우리 복구 도구를 호출할 수 있으므로 이건 실제 공격 경로다.
 * 그래서 데이터임을 명시적으로 못박아 넘긴다.
 */
export function wrapUntrusted(sample: string, meta: { repo: string; path: string }): string {
  const { text, truncated } = clampForAnalysis(sample)
  return [
    ...tr().safeText.untrusted,
    '',
    `<untrusted-sample repo="${meta.repo}" path="${meta.path}"${truncated ? ' truncated="true"' : ''}>`,
    text,
    '</untrusted-sample>',
  ].join('\n')
}

/** 사람이 읽는 크기 표기 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/** KST 기준 표시 */
export function formatKst(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d)
}
