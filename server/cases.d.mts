/**
 * `cases.mjs` 의 타입.
 *
 * 본체를 순수 JS 로 두는 이유는 Electron 메인이 빌드 없이 그대로 부르기 때문이다.
 * 그렇다고 `any` 로 넘기면 저장한 모양과 읽는 모양이 어긋나도 아무도 모른다.
 * 돌려주는 것이 구조라서, 여기만 따로 적어 둔다.
 */

import type { CaseFile, CaseListing } from '../src/core/types'

export declare function casesDir(): string
export declare function saveCase(caseFile: CaseFile): string
export declare function listCases(): CaseListing
export declare function readCase(id: string): CaseFile | null
export declare function deleteCase(id: string): boolean
