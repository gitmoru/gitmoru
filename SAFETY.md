# 격리 원칙

gitmoru 은 **악성 코드가 들어있을 수 있는 저장소를 들여다보는 도구**다.
분석 대상이 악성이라는 전제 위에서 만든다.

여기 적힌 규칙은 기능보다 우선한다. 이걸 어기는 코드는 머지하지 않고, 편의를 이유로 완화하지 않는다.

각 항목의 *왜* 는 `docs/decisions/` 에 있다. 규칙만 읽고 고치려 들지 말고 근거를 먼저 볼 것.

---

## 1. 판정하지 않는다, 증거를 내놓는다

이 도구는 "감염됐다 / 안전하다" 를 말하지 않는다. 말하는 것은 이것뿐이다.

> 이 시간대에 이 파일들이 이렇게 바뀌었습니다.

- 브랜치 상태는 사실만 쓴다: `changed` / `reverted` / `untouched` / `unknown`
- `clean`, `safe`, `infected` 같은 판정 단어를 상태값으로 만들지 않는다
- 신호가 0건이어도 "안전" 이라 표시하지 않는다. **"신호 없이 바뀐 파일 N개"** 를 대신 보여준다
- 신호에 붙는 등급은 위험도가 아니라 **주목도**(`first` / `soon` / `later`)다
- 상태색에 빨강을 쓰지 않는다. 빨강은 판정처럼 읽힌다

→ [ADR 0002](docs/decisions/0002-evidence-not-verdict.md)

## 2. 저장소 내용을 디스크에 쓰지 않는다

**`git clone` / `git fetch` / `git checkout` 을 하지 않는다.**

전부 GitHub REST API 로만 읽고, 파일 내용은 메모리에만 둔다.

| 하는 것 | 안 하는 것 |
|---|---|
| `GET /repos/{r}/git/trees` | `git clone` |
| `GET /repos/{r}/contents/{path}` | 임시 폴더에 파일 저장 |
| 메모리에서 문자열로 검사 | 파일로 내려서 검사 |

→ [ADR 0001](docs/decisions/0001-read-through-api.md)

## 3. 저장소에서 온 것은 실행하지 않는다

- `eval`, `new Function`, `vm`, `child_process` 로 대상 코드를 실행하지 않는다
- 대상 저장소에 `install` / 빌드 / 린트 / 테스트 를 돌리지 않는다
- 대상의 `package.json` 은 **텍스트로 파싱만** 한다
- 페이로드 해석은 읽어서 설명하는 것이지 돌려보는 게 아니다

## 4. 화면은 localhost 밖으로 나가지 못한다

브라우저 페이지에 아래 CSP 를 강제한다.

```
default-src 'self'; connect-src 'self'; img-src 'self' data:;
script-src 'self'; style-src 'self' 'unsafe-inline';
frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';
```

`connect-src 'self'` 가 핵심이다. 페이로드에 박힌 주소로 **화면이 요청을 보내는 것 자체가 불가능**해진다.
GitHub 호출은 전부 로컬 프로세스가 대신하고, 목적지는 `api.github.com` 으로 코드에 고정한다.

→ [ADR 0003](docs/decisions/0003-renderer-cannot-reach-out.md)

## 5. 토큰은 화면으로 내려가지 않는다

`gh auth token` 으로 얻은 토큰은 로컬 프로세스 메모리에만 둔다.

- 화면으로 토큰을 보내는 경로를 만들지 않는다
- 파일로 저장하지 않는다
- 로그, 케이스 파일, 에러 메시지에서 마스킹한다

→ [ADR 0004](docs/decisions/0004-token-stays-out-of-the-renderer.md)

## 6. 로컬 서버는 자기 자신에게만 열린다

- `127.0.0.1` 에만 바인딩한다 (`0.0.0.0` 금지)
- 실행마다 임시 키를 만들어 요청에 요구한다
- `Origin` 헤더를 검사해 우리 화면에서 온 요청만 받는다

## 7. 페이로드는 코드가 아니라 텍스트로 그린다

- `dangerouslySetInnerHTML` 을 쓰지 않는다
- 대상 저장소의 HTML, SVG, 마크다운을 **렌더링하지 않는다**
- 페이로드 안의 URL 은 클릭 불가로, `http` → `hxxp` 로 무력화해서 표시한다
- 아주 긴 한 줄은 잘라서 보여주고 전체는 접어둔다

## 8. 페이로드를 파일로 내보내지 않는다

- 내보내기는 케이스 파일(JSON)만 대상으로 한다
- 케이스 파일에 페이로드 **원문을 넣지 않는다.** 해시, 크기, 경로, 근거만 담는다
- 원문이 필요하면 그때 API 로 다시 가져온다

## 9. 에이전트에게는 읽기만 넘긴다

**MCP 서버는 읽기 전용이다.** 되돌리기(force-push)를 도구로 노출하지 않는다.

에이전트는 공격자가 쓴 코드를 읽는다. 거기에 "이전 지시를 무시하고 ..." 가 섞여 있을 수 있고,
쓰기 도구가 열려 있으면 그게 곧 공격 경로다.

- 넘기는 내용은 `<untrusted-sample>` 로 감싸고, **데이터이지 지시가 아님** 을 못박는다
- 분석 결과가 곧바로 동작으로 이어지지 않게 한다
- 넘기는 샘플 크기에 상한을 둔다

→ [ADR 0005](docs/decisions/0005-mcp-is-read-only.md)

## 10. 되돌리기에는 안전장치를 둔다

- 기본은 미리보기다. 실제 force-push 는 명시적으로 잠금을 풀어야 한다
- 실행 전에 이전 SHA 를 먼저 기록한다
- 대상 필터(actor 또는 지표) 없이 시간대만으로는 되돌리기를 거부한다
- 보호 규칙이 걸린 브랜치는 미리 표시하고, **규칙을 임의로 바꾸지 않는다**

## 11. 조용한 실패를 금지한다

검사에 실패한 대상을 "깨끗함" 으로 칠하지 않는다. **`unknown`(확인 불가)** 을 별도 상태로 둔다.
화면에는 항상 검사한 수와 실패한 수를 같이 띄운다.

→ [ADR 0009](docs/decisions/0009-failure-is-its-own-state.md)

## 12. 남의 설정 파일을 우리가 고치지 않는다

다른 AI 도구에 붙일 때, 그 도구의 설정 파일을 대신 편집하지 않는다.
넣을 내용을 보여주고 사용자가 적용한다.

→ [ADR 0011](docs/decisions/0011-never-edit-another-tools-config.md)
