# 에이전트 붙이기

gitmoru 은 MCP 서버를 함께 들고 있다. 붙이면 AI 가 결과를 직접 읽고,
수상한 파일이 무슨 코드인지 설명해준다.

## 왜 붙이나

이 도구는 "무엇이 바뀌었는지" 까지만 안다. "그게 무슨 코드인지" 는 읽어야 아는 것이라
규칙으로 못 정한다. 그 판단을 에이전트에게 넘긴다.

## 도구

앱에서 `AI 붙이기` 를 누르면 도구별로 실제 경로와 넣을 내용이 나온다.
직접 하려면 아래 내용을 그 도구의 MCP 설정에 넣으면 된다.

```json
{
  "mcpServers": {
    "gitmoru": { "command": "npx", "args": ["tsx", "<gitmoru>/src/mcp/index.ts"] }
  }
}
```

Codex CLI 는 TOML 이다.

```toml
[mcp_servers.gitmoru]
command = "npx"
args = ["tsx", "<gitmoru>/src/mcp/index.ts"]
```

VS Code 는 `servers` 키를 쓰고 `type: "stdio"` 가 필요하다.

## 도구 목록

| 도구 | 언제 |
|---|---|
| `scan` | 시작. caseId 를 받는다 |
| `triage` | 무엇부터 볼지 |
| `list_changes` | 바뀐 파일 전부 (빠짐없이 봐야 할 때) |
| `read_file` | 의심 파일 읽기. **여기서 판단이 일어난다** |
| `preview_restore` | 무엇을 어디로 되돌리게 되는지 |
| `share_summary` | 팀 채널용 요약 |
| `list_cases` | 이번 세션의 사건들 |

## 읽기 전용이다

되돌리기는 노출하지 않는다. 이유는 [ADR 0005](../decisions/0005-mcp-is-read-only.md) 에 있다.
한 줄로 줄이면, 에이전트는 공격자가 쓴 글을 읽고 있고 그 안에 지시문이 섞여 있을 수 있다.

## 도구를 추가할 때

- `src/mcp/tools/` 에 파일 하나
- `register~(server, ctx)` 를 내보내고 `src/mcp/index.ts` 에 등록
- **쓰기 도구는 만들지 않는다**
- 출력은 짧게. 목록에는 전체 개수와 표시 개수를 같이 적는다
- 저장소에서 온 내용은 `wrapUntrusted()` 로 감싼다

## 서버만 두드려보기

```bash
node scripts/try-mcp.mjs 내계정/시험용저장소 "2026-01-01 00:00" "2026-01-01 07:00"
```

## 시간대

`scan` 의 `since`, `until` 은 **그 컴퓨터의 시간대**로 읽습니다.
서버에서 도는 에이전트는 UTC 인데 사람은 다른 곳에 있는 경우가 많으니,
사람이 말한 시간대를 `timezone` 에 넣어 주세요 (`Asia/Seoul` 같은 IANA 이름).

## 강제 푸시

GitHub 이벤트에는 강제 푸시 여부가 **안 들어 있습니다.** 그래서 푸시 전후 커밋을 맞대봐서
직접 알아냅니다. 전에 있던 커밋이 지금 없으면 기록이 덮어써진 것이고,
없어진 커밋 수가 곧 사라진 작업의 양입니다.

`scan` 결과와 `share_summary` 에 그 숫자가 들어갑니다.
강제 푸시 자체는 정상 작업에서도 하므로 **판정하지 않고 사실만** 적습니다.
