/**
 * 브랜치를 안 건드리고 들어오는 문.
 *
 * 배포 키, 웹훅, 대기 중인 초대. 푸시 기록에 아무것도 안 남겨서
 * 훑기로는 안 잡히고, 대신 만들어진 시각이 남아 있어 언제든 확인할 수 있다.
 */

/** 저장소로 들어오는 문. 브랜치를 안 건드리고도 열 수 있는 것들이다. */
export type AccessKind = 'deployKey' | 'webhook' | 'invitation' | 'runner' | 'secret'

export interface AccessItem {
  kind: AccessKind
  repo: string
  /** 사람이 알아볼 이름. 키 제목, 웹훅 주소, 초대받은 사람 */
  label: string
  /**
   * 언제 생겼는지.
   *
   * **러너는 없다.** GitHub 이 등록 시각을 안 준다. 없는 걸 지어내면 시간대 안팎을
   * 가르는 판단이 통째로 거짓이 된다. 없으면 없는 대로 둔다.
   */
  createdAt?: string
  /** 마지막으로 바뀐 시각. 비밀은 생긴 때보다 이게 중요하다. */
  changedAt?: string
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
  /**
   * 언제 생겼는지 알 수 없는 것.
   *
   * 러너가 여기 온다. 시간대 안에 생겼는지 밖에 생겼는지 우리가 모르니까
   * 어느 쪽에도 넣지 않는다. 모르는 것을 아는 척하는 게 이 도구에서 제일 나쁜 실수다.
   */
  undated: AccessItem[]
  /** 본 저장소 수 */
  checked: number
  /** 못 본 것. 이유별로 나눈다. */
  gaps: Array<{ target: string; why: AccessGap; detail?: string }>
}
