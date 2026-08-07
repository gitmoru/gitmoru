import { describe, expect, it } from 'vitest'

import { newWorkflowRisks, readWorkflowRisks } from '../workflowRisks'

/**
 * 워크플로가 무엇을 열어뒀는지 읽기.
 *
 * 여기 있는 모양은 GitHub 이 직접 쓴 안내와 OpenSSF Scorecard 의
 * `Dangerous-Workflow` 가 보는 것과 같다.
 *
 * 여기서도 어려운 건 안 찾는 쪽이다. 지금 열려 있는 걸 전부 올리면
 * 몇 년째 그랬던 저장소에서도 뜨고, 우리가 물어본 시간대 밖의 이야기가 된다.
 */

const PR_TARGET_CHECKOUT = `
on:
  pull_request_target:
jobs:
  build:
    steps:
      - uses: actions/checkout@v5
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`

describe('readWorkflowRisks', () => {
  it('pull_request_target 에서 PR 코드를 체크아웃하면 잡는다', () => {
    expect(readWorkflowRisks(PR_TARGET_CHECKOUT)).toContain('pr-target-checkout')
  })

  it('pull_request_target 만으로는 안 잡는다', () => {
    // 트리거만으로는 남의 코드가 안 돈다. 제대로 쓰는 곳이 훨씬 많다.
    const text = 'on:\n  pull_request_target:\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v5\n'
    expect(readWorkflowRisks(text)).toEqual([])
  })

  it('평범한 pull_request 는 안 잡는다', () => {
    // 이건 비밀도 쓰기 권한도 안 들고 돈다.
    const text = PR_TARGET_CHECKOUT.replace('pull_request_target:', 'pull_request:')
    expect(readWorkflowRisks(text)).toEqual([])
  })

  it('run 블록 안의 github.event 를 잡는다', () => {
    const text = '      - run: |\n          echo "${{ github.event.pull_request.title }}"\n'
    expect(readWorkflowRisks(text)).toContain('event-in-run')
  })

  it('한 줄짜리 run 도 잡는다', () => {
    expect(readWorkflowRisks('      - run: echo ${{ github.event.issue.title }}\n')).toContain(
      'event-in-run',
    )
  })

  it('run 밖에 있는 github.event 는 안 잡는다', () => {
    // 여기서는 셸에 안 들어간다. 값으로만 쓰인다.
    const text = '      - uses: a/b@v1\n        with:\n          title: ${{ github.event.issue.title }}\n'
    expect(readWorkflowRisks(text)).toEqual([])
  })

  it('github.event_name 은 안 잡는다', () => {
    // 값이 정해져 있어서 명령을 끼워 넣을 자리가 없다.
    expect(readWorkflowRisks('      - run: echo ${{ github.event_name }}\n')).toEqual([])
  })

  it('run 블록이 끝난 뒤의 줄은 안 본다', () => {
    const text = [
      '      - run: |',
      '          echo hello',
      '      - uses: a/b@v1',
      '        with:',
      '          x: ${{ github.event.issue.title }}',
    ].join('\n')
    expect(readWorkflowRisks(text)).toEqual([])
  })

  it('permissions: write-all 을 잡는다', () => {
    expect(readWorkflowRisks('permissions: write-all\n')).toEqual(['write-all'])
  })

  it('좁혀둔 permissions 는 안 잡는다', () => {
    expect(readWorkflowRisks('permissions:\n  contents: read\n')).toEqual([])
  })

  it('평범한 워크플로에서는 아무것도 안 잡는다', () => {
    const text = [
      'on:',
      '  push:',
      '    branches: [main]',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  check:',
      '    steps:',
      '      - uses: actions/checkout@v5',
      '      - run: pnpm check',
    ].join('\n')
    expect(readWorkflowRisks(text)).toEqual([])
  })
})

describe('newWorkflowRisks', () => {
  it('이 푸시로 새로 생긴 것만 올린다', () => {
    expect(newWorkflowRisks(['write-all'], ['write-all', 'event-in-run'])).toEqual(['event-in-run'])
  })

  it('원래 있던 건 안 올린다', () => {
    // 몇 년째 그랬던 저장소에서 뜨면 우리가 물어본 시간대 밖의 이야기가 된다.
    expect(newWorkflowRisks(['write-all'], ['write-all'])).toEqual([])
  })

  it('없어진 건 올릴 것이 없다', () => {
    expect(newWorkflowRisks(['write-all'], [])).toEqual([])
  })
})
