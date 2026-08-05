import { describe, expect, it } from 'vitest'

import { countByRole, roleOf } from '../fileRole'

/**
 * 파일 역할.
 *
 * ADR 0008 은 이름만 보고 **악성 여부**를 판단하지 말라는 것이지,
 * 역할까지 알아내지 말라는 게 아니다. 여기서 지켜야 할 것은
 * "경로가 규격인 자리만 잡고, 비슷하게 생긴 것에 속지 않는다" 다.
 */
describe('roleOf', () => {
  it.each([
    ['.github/workflows/deploy.yml', 'workflow'],
    ['.github/workflows/ci.yaml', 'workflow'],
    ['.github/actions/setup/action.yml', 'workflow'],
    ['action.yml', 'workflow'],
    ['.husky/pre-commit', 'gitHook'],
    ['.vscode/tasks.json', 'editor'],
    ['package.json', 'buildConfig'],
    ['apps/web/package.json', 'buildConfig'],
    ['eslint.config.js', 'buildConfig'],
    ['Dockerfile', 'buildConfig'],
  ])('%s 는 %s 자리다', (path, role) => {
    expect(roleOf(path)).toBe(role)
  })

  it.each([
    // workflow 폴더에 있어도 yml 이 아니면 정의가 아니다
    ['.github/workflows/README.md'],
    // .github 아래여도 workflows 가 아니면 실행되지 않는다
    ['.github/dependabot.yml'],
    // 이름만 비슷한 자리에 속지 않는다
    ['docs/.github/workflows/x.yml'],
    ['src/index.ts'],
    ['README.md'],
  ])('%s 는 자동 실행되는 자리가 아니다', (path) => {
    expect(roleOf(path)).toBeNull()
  })
})

describe('countByRole', () => {
  it('역할별로 세고, 해당 없는 것은 안 센다', () => {
    const counts = countByRole([
      '.github/workflows/a.yml',
      '.github/workflows/b.yml',
      'src/index.ts',
      '.husky/pre-push',
    ])
    expect(counts).toEqual({ workflow: 2, gitHook: 1, editor: 0, buildConfig: 0 })
  })
})

describe('설치, 체크아웃 과정에 끼어드는 자리', () => {
  it('.npmrc 는 빌드 설정으로 본다', () => {
    // 레지스트리 주소가 바뀌면 같은 이름으로 다른 것이 설치된다.
    expect(roleOf('.npmrc')).toBe('buildConfig')
    expect(roleOf('packages/app/.npmrc')).toBe('buildConfig')
  })

  it('.gitmodules 는 빌드 설정으로 본다', () => {
    expect(roleOf('.gitmodules')).toBe('buildConfig')
  })

  it('.gitattributes 는 훅으로 본다', () => {
    // filter 를 걸면 클론만 해도 지정한 명령이 돈다.
    expect(roleOf('.gitattributes')).toBe('gitHook')
  })

  it('비슷한 이름에는 안 걸린다', () => {
    expect(roleOf('docs/npmrc-guide.md')).toBeNull()
    expect(roleOf('.npmrc.example')).toBeNull()
  })
})
