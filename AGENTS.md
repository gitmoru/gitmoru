# 에이전트 안내

gitmoru 은 **악성 코드가 들어있을 수 있는 저장소를 들여다보는 도구**다.
그래서 보통 프로젝트와 다른 규칙이 있다. 코드를 고치기 전에 아래를 보고 해당 문서를 읽어라.

이 파일에는 내용을 적지 않는다. **무슨 일을 할 때 무엇을 읽어야 하는지**만 적는다.

## 무엇을 하려는가

| 하려는 일 | 먼저 읽을 것 |
|---|---|
| 아무거나 고치기 전에 | [SAFETY.md](SAFETY.md) - 기능보다 우선하는 규칙 |
| 폴더가 어디에 뭐가 있는지 | [docs/architecture.md](docs/architecture.md) |
| 왜 이렇게 만들었는지 | [docs/decisions/](docs/decisions/README.md) |
| 탐지 규칙 추가 | [docs/guides/adding-a-detector.md](docs/guides/adding-a-detector.md) |
| MCP 도구 추가, 에이전트 붙이기 | [docs/guides/connecting-agents.md](docs/guides/connecting-agents.md) |
| 되돌리기 건드리기 | [docs/guides/restoring-branches.md](docs/guides/restoring-branches.md) |
| 화면 문구 손보기, 언어 추가 | [docs/guides/adding-a-language.md](docs/guides/adding-a-language.md) |
| 실행, 빌드 | [docs/guides/running-locally.md](docs/guides/running-locally.md) |
| 커밋, PR | [CONTRIBUTING.md](CONTRIBUTING.md) |

## 절대 하지 말 것

이건 링크로 넘기지 않는다. 여기서 막는다.

- 분석 대상 저장소를 `git clone` 하거나 디스크에 쓰지 않는다
- 분석 대상의 코드를 실행하지 않는다 (`eval`, `install`, 빌드, 린트 포함)
- 화면(`src/ui`)에서 `api.github.com` 을 직접 부르지 않는다. `src/platform/bridge.ts` 를 지난다
- GitHub 토큰을 화면으로 내려보내지 않는다
- MCP 서버에 **쓰기 도구를 추가하지 않는다**
- 브랜치 보호 규칙을 자동으로 풀지 않는다
- "안전합니다" 라고 말하는 코드나 문구를 만들지 않는다

## 코드를 쓸 때

- 주석은 **왜** 를 적는다. 특히 다르게 했다가 겪은 일을
- **화면에 나가는 문자열을 코드에 직접 쓰지 않는다.** `src/i18n/locales/` 에 넣고 `useTr()` 로 꺼낸다
- 화면 문구는 해요체로 짧게. AI 가 쓴 티 나는 표현을 쓰지 않는다
- 긴 줄표(—), 가운뎃점(·), 말줄임표(…) 를 쓰지 않는다. `-`, `,`, `...` 로 쓴다
- 실제 조직 이름이나 저장소 이름을 코드나 문서에 남기지 않는다
- README 는 세 벌이다 (`README.md`, `README.en.md`, `README.ja.md`). 하나만 고치지 않는다
- 고친 뒤에는 `pnpm check` 를 돌린다 (타입, 글쓰기 규칙, 시험, 도트 동작, 빌드)
- 순수 로직을 고쳤으면 `src/core/__tests__/` 에 경우를 하나 더한다
