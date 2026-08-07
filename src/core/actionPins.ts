/**
 * 워크플로가 어떤 액션을 어디에 고정해 쓰는지 읽는다.
 *
 * `uses: owner/repo@v46` 의 `v46` 은 태그다. 그리고 태그는 **주인이 언제든 다른 커밋으로
 * 옮길 수 있다.** 버전처럼 생겼지만 고정된 게 아니다.
 * `uses: owner/repo@<40자리 해시>` 는 못 옮긴다. 내용이 바뀌면 해시가 바뀌기 때문이다.
 *
 * 2025년 3월에 `tj-actions/changed-files` 가 이 자리로 털렸다. 공격자가 기본 브랜치가
 * 아닌 곳에 커밋을 만들고 기존 태그들을 거기로 옮겼다. 태그를 쓰던 저장소 전부가
 * 다음 실행에서 그 코드를 받았다. **아무도 아무것도 안 고쳤고, 리뷰할 대상도 없었다.**
 *
 * 여기서는 판단하지 않는다. 파일에 적힌 것을 그대로 읽어 올릴 뿐이다.
 */

/** `uses:` 한 줄에서 읽어낸 것 */
export interface ActionPin {
  /** `owner/repo` 또는 `owner/repo/하위경로` */
  action: string
  /** `@` 뒤에 적힌 것. 해시일 수도 태그일 수도 브랜치일 수도 있다. */
  ref: string
}

/** 40자리 16진수. 이건 옮길 수 없다. */
const SHA = /^[0-9a-f]{40}$/i

export const isPinned = (ref: string): boolean => SHA.test(ref)

/*
  `uses:` 를 찾는다.

  목록 항목(`- uses:`)일 수도 있고 아닐 수도 있다. 따옴표가 붙기도 한다.
  주석은 흔하다. 핀을 박은 곳은 대개 `@<해시> # v46` 처럼 사람이 읽을 것을 뒤에 단다.
*/
const USES = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)/

/**
 * 워크플로 글에서 `uses:` 를 전부 읽는다.
 *
 * 같은 파일 안에서 같은 액션을 여러 번 쓰는 일이 흔해서 목록으로 돌려준다.
 * 중복을 여기서 지우면 한 곳만 풀린 경우를 못 본다.
 *
 * `./무엇` 과 `docker://무엇` 은 뺀다. 앞은 이 저장소 안이라 태그가 없고,
 * 뒤는 액션이 아니라 이미지다. 둘 다 여기서 말하는 문제가 생길 자리가 아니다.
 */
export function readActionPins(text: string): ActionPin[] {
  const out: ActionPin[] = []

  for (const line of text.split('\n')) {
    const hit = USES.exec(line)
    if (!hit) continue

    const target = hit[1]
    if (!target || target.startsWith('.') || target.includes('://')) continue

    const cut = target.lastIndexOf('@')
    // `@` 가 없으면 참조가 안 적힌 것이다. 기본 브랜치를 따라간다는 뜻인데,
    // 그건 애초에 안 박힌 상태라 "풀렸다" 는 말이 성립하지 않는다.
    if (cut <= 0) continue

    out.push({ action: target.slice(0, cut), ref: target.slice(cut + 1) })
  }

  return out
}

/** 어떤 액션의 고정이 풀렸는지 */
export interface LoosenedPin {
  action: string
  /** 풀리기 전에 박혀 있던 커밋 */
  before: string
  /** 지금 가리키는 것. 태그거나 브랜치다. */
  after: string
}

/**
 * 전후를 맞대서 **고정이 풀린 것만** 골라낸다.
 *
 * 해시에서 해시로 바뀐 건 평범한 갱신이라 안 본다.
 * 원래 태그였던 것이 계속 태그인 것도 안 본다. 그건 이 시간대에 생긴 일이 아니다.
 * 새로 추가된 액션도 안 본다. 안 박고 추가하는 건 너무 흔해서, 그걸 올리면
 * 거의 모든 저장소에서 뜨고 아무도 안 읽는 신호가 된다.
 *
 * 한 액션을 여러 번 쓰는 파일이 있어서 한쪽이라도 풀렸으면 잡는다.
 * 열 군데 중 한 군데만 풀어놔도 그 한 군데로 들어온다.
 */
export function loosenedPins(before: ActionPin[], after: ActionPin[]): LoosenedPin[] {
  const wasPinned = new Map<string, string>()
  for (const pin of before) {
    if (isPinned(pin.ref)) wasPinned.set(pin.action, pin.ref)
  }

  const out: LoosenedPin[] = []
  const reported = new Set<string>()

  for (const pin of after) {
    if (isPinned(pin.ref)) continue

    const wasAt = wasPinned.get(pin.action)
    if (!wasAt || reported.has(pin.action)) continue

    reported.add(pin.action)
    out.push({ action: pin.action, before: wasAt, after: pin.ref })
  }

  return out
}
