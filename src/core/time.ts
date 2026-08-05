/**
 * 시간대 다루기.
 *
 * 예전에는 `+09:00` 이 코드에 박혀 있었다. 화면은 영어와 일본어로도 뜨는데
 * 시간만 한국시간으로 읽히면, 다른 나라 사람은 자기가 넣은 숫자와 다른 구간을 훑게 된다.
 * 조사 도구에서 **시간을 잘못 읽는 것은 결과를 통째로 못 쓰게 만든다.**
 *
 * 그래서 기준을 하나로 정했다. **아무 말이 없으면 그 컴퓨터의 시간대다.**
 * 화면에서는 브라우저가 알아서 하고, MCP 에서는 에이전트가 다른 시간대를 넣을 수 있다.
 * 서버에서 도는 에이전트는 UTC 인데 사람은 서울에 있는 경우가 흔해서다.
 */

/** 이 컴퓨터의 시간대 (`Asia/Seoul` 같은 IANA 이름) */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** 그 시간대에서 이 순간이 몇 시로 보이는지 (밀리초) */
function shownAt(instant: number, zone: string): number {
  // sv-SE 로 찍으면 `YYYY-MM-DD HH:mm:ss` 로 나와서 다시 파싱하기 쉽다.
  const shown = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(instant))
  return Date.parse(`${shown.replace(' ', 'T')}Z`)
}

/**
 * `YYYY-MM-DD HH:mm` 을 그 시간대의 시각으로 읽어서 UTC 로 바꾼다.
 *
 * 오프셋을 직접 계산한다. 서머타임이 있는 지역에서는 계절마다 값이 달라서
 * 고정된 숫자를 쓸 수 없다. 한 번 더 맞춰보는 이유는, 오프셋이 바뀌는 경계에서
 * 첫 계산이 한 시간 어긋날 수 있어서다.
 */
export function zonedToUtc(local: string, zone: string): string {
  const naive = Date.parse(`${local.trim().replace(' ', 'T')}:00Z`)
  if (Number.isNaN(naive)) throw new Error(`시각을 읽지 못했어요: ${local}`)

  let guess = naive - (shownAt(naive, zone) - naive)
  guess = naive - (shownAt(guess, zone) - guess)

  return new Date(guess).toISOString().slice(0, 19)
}

/** UTC ISO 를 그 시간대의 `YYYY-MM-DD HH:mm` 으로 */
export function utcToZoned(iso: string, zone: string): string {
  const instant = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(instant)) return iso
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instant))
}

/** 화면에 붙일 짧은 시간대 표기 (`GMT+9` 같은 것) */
export function zoneLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}
