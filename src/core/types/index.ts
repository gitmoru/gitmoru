/**
 * 이 프로젝트의 낱말.
 *
 * 축마다 파일을 나눴다. 한 파일에 다 있으면 "되돌리기 타입 하나 고치려다
 * 탐지기 타입을 스치는" 일이 생기고, 그러면 무엇을 건드렸는지가 안 보인다.
 *
 * 가져다 쓰는 쪽은 여기만 알면 된다. `from './types'` 하나로 전부 나온다.
 */

export type * from './github'
export type * from './changes'
export type * from './finding'
export type * from './restore'
export type * from './access'
export type * from './case'
