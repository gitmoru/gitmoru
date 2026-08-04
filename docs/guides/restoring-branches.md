# 되돌리기

가장 위험한 기능이다. 브랜치를 공격 직전 커밋으로 force-push 한다.

## 어떻게 도는가

```
canRestore()     되돌려도 되는 상태인가
      ↓
buildPlan()      무엇을 어디로. 되돌아갈 SHA 는 이벤트 기록의 payload.before 에서 온다
      ↓
markProtected()  보호 규칙에 막히는 브랜치 표시
      ↓
backupText()     이전 SHA 를 먼저 남긴다
      ↓
executePlan()    여기서만 실제로 바뀐다
```

## 안전장치

**대상 필터가 없으면 거부한다.** actor 도 없고 신호도 없으면 `canRestore()` 가 막는다.
시간대만으로 되돌리면 그 시간에 일하던 사람의 정상 커밋까지 날아간다.

**보호 규칙은 우리가 못 푼다.** 막힌 브랜치는 표시만 하고 넘어간다.
규칙을 자동으로 풀었다가 다시 거는 건 하지 않는다. 푸는 동안 무방비다.

**확인 못 한 판단은 "보호됨" 쪽으로 닫힌다.** `markProtected()` 는 조회에 실패하면
보호된 것으로 친다. 모르는 채로 밀어붙이지 않는다.

**되돌아갈 곳은 GitHub 이 기억하는 것이다.** `payload.before` 는 이벤트 기록에서 온다.
GitHub 은 활동 기록을 90일 정도, 저장소당 300건쯤 보관한다.
그 범위를 벗어나면 되돌릴 수 없다. 이건 화면에서 말해준다.

## 시험해보기

시험용 저장소를 하나 만들고 환경변수로 알려준다.

```bash
export GITMORU_TEST_REPO=내계정/gitmoru-test
export GITMORU_TEST_GOOD=<정상 커밋 SHA>
export GITMORU_TEST_BAD=<공격당한 상태로 쓸 커밋 SHA>
bash scripts/reset-test-repo.sh
```

## MCP 에는 없다

에이전트에게는 `preview_restore` 까지만 준다. [ADR 0005](../decisions/0005-mcp-is-read-only.md).
