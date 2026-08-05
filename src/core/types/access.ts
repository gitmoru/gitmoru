/**
 * 브랜치를 안 건드리고 들어오는 문.
 *
 * 배포 키, 웹훅, 대기 중인 초대. 푸시 기록에 아무것도 안 남겨서
 * 훑기로는 안 잡히고, 대신 만들어진 시각이 남아 있어 언제든 확인할 수 있다.
 */

/** 저장소로 들어오는 문. 브랜치를 안 건드리고도 열 수 있는 것들이다. */
export type AccessKind = 'deployKey' | 'webhook' | 'invitation'

export interface AccessItem {
  kind: AccessKind
  repo: string
  /** 사람이 알아볼 이름. 키 제목, 웹훅 주소, 초대받은 사람 */
  label: string
  createdAt: string
  /** 웹훅이면 어디로 보내는지. 페이로드라 화면에 그릴 때 무력화한다. */
  target?: string
  /** 읽기 전용 배포 키인지 */
  readOnly?: boolean
  /** GitHub 에서 열어볼 주소 */
  href?: string
}

/** 못 본 이유. 권한이 없는 것과 실패한 것은 다르다. */
export type AccessGap = 'notAdmin' | 'needsScope' | 'failed'

export interface AccessReport {
  /** 기준 시각. 이보다 뒤에 생긴 것을 '최근' 으로 본다. */
  since: string
  /** 기준 시각 뒤에 생긴 것 */
  recent: AccessItem[]
  /** 그 밖에 이미 있던 것. 개수만 센다. */
  existing: Record<AccessKind, number>
  /** 본 저장소 수 */
  checked: number
  /** 못 본 것. 이유별로 나눈다. */
  gaps: Array<{ target: string; why: AccessGap; detail?: string }>
}
