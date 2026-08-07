# 결정 기록 (ADR)

여기 있는 문서는 **왜 그렇게 만들었는지**를 남긴 것이다.

`SAFETY.md` 는 "무엇을 지켜야 하는가" 만 적는다. 규칙만 보면 불편해 보이는 것들이 있어서,
근거를 따로 남기지 않으면 나중에 "이거 왜 이렇게 돼 있지" 하며 되돌리게 된다.
되돌려도 되는 결정과 되돌리면 안 되는 결정을 구분하려고 쓴다.

## 목록

| 번호 | 결정 | 되돌려도 되나 |
|---|---|---|
| [0001](0001-read-through-api.md) | 저장소를 내려받지 않고 API 로만 읽는다 | 안 됨 |
| [0002](0002-evidence-not-verdict.md) | 판정하지 않고 증거를 내놓는다 | 안 됨 |
| [0003](0003-renderer-cannot-reach-out.md) | 화면은 바깥으로 요청을 못 보낸다 | 안 됨 |
| [0004](0004-token-stays-out-of-the-renderer.md) | 토큰은 화면으로 내려가지 않는다 | 안 됨 |
| [0005](0005-mcp-is-read-only.md) | 에이전트에게는 읽기만 넘긴다 | 안 됨 |
| [0006](0006-desktop-app-not-a-browser-tab.md) | 브라우저 탭이 아니라 데스크톱 앱으로 만든다 | 됨 |
| [0007](0007-no-ai-chat-inside-the-app.md) | 앱 안에 AI 채팅을 넣지 않는다 (지금은) | 조건부 |
| [0008](0008-detectors-never-judge-by-filename.md) | 파일 이름만으로 판단하는 탐지기를 만들지 않는다 | 안 됨 |
| [0009](0009-failure-is-its-own-state.md) | 실패는 그 자체로 하나의 상태다 | 안 됨 |
| [0010](0010-pixel-character-as-the-interface.md) | 도트 캐릭터를 인터페이스로 쓴다 | 됨 |
| [0011](0011-never-edit-another-tools-config.md) | 남의 설정 파일을 우리가 고치지 않는다 | 안 됨 |
| [0012](0012-cases-live-on-disk.md) | 사건 기록은 디스크에 남긴다 | 됨 |
| [0013](0013-mcp-goes-to-npm.md) | MCP 서버는 npm 에 올리고, 앱은 클론으로 둔다 | 됨 |
| [0014](0014-exposure-is-a-fact-not-a-signal.md) | 저장소가 공개로 바뀐 건 신호가 아니라 사건의 사실이다 | 안 됨 |

## 새로 쓸 때

번호는 이어서 매긴다. 형식은 다음과 같다.

```markdown
# NNNN. 한 줄 제목

## 무엇을 정했나
## 왜
## 그래서 어떻게 되나
## 하지 않기로 한 것
```

이미 있는 결정을 뒤집는 문서라면 제목 아래에 `대체: ADR NNNN` 을 적고,
대체당한 문서 맨 위에도 `→ ADR NNNN 으로 대체됨` 을 남긴다. 지우지 않는다.
