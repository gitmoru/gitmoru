/**
 * 파일이 저장소에서 맡은 자리.
 *
 * **이건 판정이 아니다.** 어떤 파일이 위험한지를 말하는 게 아니라,
 * 그 파일이 무슨 자리에 있는지를 말한다. `.github/workflows/deploy.yml` 은
 * 경로 자체가 "이건 CI 정의다" 라는 뜻이다. 추측이 아니라 규격이다.
 *
 * ADR 0008 은 **파일 이름만 보고 악성으로 판단하지 말라**는 것이지
 * 파일의 역할을 이름으로 알아내지 말라는 게 아니다. GitHub Actions 는
 * 경로로 workflow 를 인식하고, 우리도 같은 규격을 읽을 뿐이다.
 *
 * 이걸로 걸러내지 않는다. 바뀐 파일은 전부 목록에 남고, 여기서 하는 일은
 * "이 중에 CI 정의가 몇 개 있다" 를 세어서 먼저 보이게 하는 것뿐이다.
 */

export type FileRole =
  /** GitHub Actions 가 돌리는 정의. 바뀌면 다음 푸시부터 다른 게 돈다 */
  | 'workflow'
  /** git 이 커밋, 푸시 때 자동으로 실행하는 것 */
  | 'gitHook'
  /** 편집기가 폴더를 여는 순간 읽는 것 */
  | 'editor'
  /** 설치나 빌드 과정에서 실행되는 것 */
  | 'buildConfig'

/**
 * 자동으로 실행되는 자리인지 알아본다. 아니면 null.
 *
 * 순서가 있다. workflow 가 제일 앞인 이유는, 자체 호스팅 러너를 쓰는 곳에서는
 * CI 정의 한 줄이 곧 그 서버의 셸이기 때문이다. 브랜치를 덮어쓰는 것보다
 * 조용하고 더 멀리 간다.
 */
export function roleOf(path: string): FileRole | null {
  // GitHub 이 정한 자리. 여기 있는 yml 은 정의상 workflow 다.
  if (/^\.github\/workflows\/.+\.(ya?ml)$/.test(path)) return 'workflow'
  // 복합 액션. 다른 workflow 가 불러다 쓴다.
  if (/(^|\/)action\.ya?ml$/.test(path)) return 'workflow'

  if (path.includes('.husky/') || path.startsWith('.git/hooks/')) return 'gitHook'
  // .gitattributes 의 filter 는 받아올 때, 커밋할 때 지정한 명령을 돌린다.
  // 클론만 해도 실행된다는 뜻이라 자리로는 훅에 가깝다.
  if (/(^|\/)\.gitattributes$/.test(path)) return 'gitHook'

  if (path.startsWith('.vscode/') || path.startsWith('.idea/')) return 'editor'

  if (/(^|\/)package\.json$/.test(path)) return 'buildConfig'
  if (/\.config\.(js|ts|cjs|mjs)$/.test(path)) return 'buildConfig'
  if (/(^|\/)(Makefile|Dockerfile|docker-compose\.ya?ml)$/.test(path)) return 'buildConfig'
  // 패키지를 어디서 받아올지. 여기가 바뀌면 같은 이름으로 다른 것이 설치된다.
  if (/(^|\/)\.npmrc$/.test(path)) return 'buildConfig'
  // 서브모듈이 가리키는 주소. 빌드가 남의 저장소를 끌어오게 만들 수 있다.
  if (/(^|\/)\.gitmodules$/.test(path)) return 'buildConfig'

  return null
}

/** 자동 실행되는 자리에 있는 파일만 골라 센다. */
export function countByRole(paths: string[]): Record<FileRole, number> {
  const counts: Record<FileRole, number> = {
    workflow: 0,
    gitHook: 0,
    editor: 0,
    buildConfig: 0,
  }
  for (const path of paths) {
    const role = roleOf(path)
    if (role) counts[role]++
  }
  return counts
}
