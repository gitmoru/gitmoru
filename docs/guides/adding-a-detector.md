# 탐지기 추가하기

탐지기는 **먼저 볼 것을 위로 올리는 형광펜**이다. 판정하는 게 아니다 ([ADR 0002](../decisions/0002-evidence-not-verdict.md)).

## 시작 전에

[ADR 0008](../decisions/0008-detectors-never-judge-by-filename.md) 을 먼저 읽어야 한다.
**파일 이름만 근거로 삼는 탐지기는 받지 않는다.** 이름은 공격자가 언제든 바꾼다.

쓸 수 있는 근거:

- 크기 변화, 새로 생김
- 여러 저장소에 나타난 같은 blob 해시
- 커밋 메타데이터 (author 날짜와 committer 날짜의 어긋남)
- 파일 **내용**에 남은 흔적

## 만들기

1. `src/core/detectors/내탐지기.ts` 를 만든다

```ts
import type { Detector } from '../types'

export const 내탐지기: Detector = {
  id: 'kebab-case-아이디',
  name: '사람이 읽을 이름',
  rationale: '이 규칙이 무엇을 찾는지 한 문장. 설정 화면에 그대로 뜬다.',
  defaultAttention: 'soon', // first | soon | later
  enabledByDefault: true,
  options: [
    // 사용자가 조절할 수 있는 값. 왜 그 기본값인지 help 에 적는다
  ],
  async run(ctx) {
    // ctx.changes 에 이미 모아둔 변경이 있다. API 를 다시 부르지 않는다.
    return [] // Finding[]
  },
}
```

2. `src/core/detectors/index.ts` 의 `DETECTORS` 에 추가한다. 화면과 MCP 양쪽에 자동으로 뜬다

## 지킬 것

**API 를 다시 부르지 않는다.** 필요한 건 `ctx.changes` 에 이미 있다.
탐지기마다 트리를 다시 가져오면 스캔이 몇 분씩 걸린다. 실제로 그랬고, 그래서 지금 모양이 됐다.

**주목도를 위험도로 쓰지 않는다.** `first` 는 "먼저 보세요" 지 "위험합니다" 가 아니다.

**근거를 남긴다.** `Finding.evidence` 에 무엇을 보고 그렇게 판단했는지 적는다.
사람이 그걸 읽고 규칙이 틀렸는지 판단할 수 있어야 한다.

**못 잡아도 괜찮다.** 변경 목록은 탐지기와 무관하게 남는다.
과하게 잡아서 목록을 오염시키는 쪽이 더 나쁘다.

## 확인

```bash
pnpm typecheck
node scripts/try-mcp.mjs 내계정/시험용저장소 "2026-01-01 00:00" "2026-01-01 07:00"
```
