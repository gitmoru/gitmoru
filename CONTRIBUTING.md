# 같이 만들기

**한국어** | [English](CONTRIBUTING.en.md) | [日本語](CONTRIBUTING.ja.md)

## 먼저

[SAFETY.md](SAFETY.md) 를 읽어주세요. 여기 적힌 규칙은 기능보다 우선합니다.
어겨야 할 이유가 생겼다면 그건 코드가 아니라 [ADR](docs/decisions/README.md) 로 먼저 가져와 주세요.

## 환경

```bash
pnpm install
pnpm app
```

자세한 건 [돌려보기](docs/guides/running-locally.md) 에 있어요.

## 어디를 고치면 되나

| 하려는 일 | 문서 |
|---|---|
| 탐지 규칙 추가 | [탐지기 추가하기](docs/guides/adding-a-detector.md) |
| MCP 도구 추가 | [에이전트 붙이기](docs/guides/connecting-agents.md) |
| 되돌리기 손보기 | [되돌리기](docs/guides/restoring-branches.md) |
| 화면 문구, 언어 추가 | [언어 추가하기](docs/guides/adding-a-language.md) |
| 폴더 구조 | [구조](docs/architecture.md) |

## 코드

**주석은 왜를 적어요.** 무엇을 하는지는 코드가 말합니다.
그렇게 만든 이유, 특히 **다르게 했다가 겪은 일**을 남겨주세요.
이 저장소의 주석은 대부분 그런 기록입니다.

**이름은 읽어서 알게.** `s`, `c`, `f` 같은 한 글자 이름 대신
`stats`, `caseFile`, `finding` 처럼 씁니다.

**파일이 300줄을 넘으면** 쪼갤 자리를 찾아주세요.
줄 수 자체가 문제는 아니고, 한 파일이 여러 일을 하고 있다는 신호로 봅니다.

**의존 방향은 한 쪽입니다.** `ui` → `core` → `platform` → `server`.
`core` 안에서 `../ui` 를 가져오면 리뷰에서 막습니다.

## 글

화면에 나가는 문자열은 코드에 직접 쓰지 않고 `src/i18n/locales/` 에 넣습니다.
한국어, English, 日本語 세 벌이 항상 같이 있어야 빌드가 통과합니다.

README 도 세 벌이고, 이 문서도 세 벌입니다.
GitHub 은 보는 사람 언어에 맞춰 골라주지 않아서, 맨 위 줄에 서로 링크를 걸어뒀습니다.
내용을 고치면 세 개를 같이 고쳐주세요. `pnpm style` 이 빠진 걸 잡습니다.

아래는 화면 문구와 주석 모두 해당됩니다.

- 해요체로, 짧게
- 이중 부정을 쓰지 않아요
- 긴 줄표(—), 가운뎃점(·), 말줄임표(…) 를 쓰지 않아요. `-`, `,`, `...` 로 씁니다
- 실제 조직 이름, 저장소 이름을 남기지 않아요
- **"안전합니다" 라고 쓰지 않아요.** 우리가 아는 건 "신호가 안 잡혔다" 이지 "없다" 가 아닙니다

## 이슈

[양식이 네 개](https://github.com/gitmoru/gitmoru/issues/new/choose) 있습니다.

| 양식 | 언제 쓰나 |
|---|---|
| It showed nothing, but something was there | 화면이 조용했는데 실제로는 당해 있던 경우. **이게 제일 중요해요** |
| Something broke | 죽거나, 빈 화면이거나, 숫자가 안 맞거나 |
| A signal worth catching | 그냥 아이디어보다, 실제로 겪은 이야기가 붙어 있으면 훨씬 좋아요 |
| The wording reads wrong | 세 언어 중 하나가 그 언어답게 안 읽힐 때 |

양식은 영어인데 **본문은 편한 언어로 쓰면 됩니다.** 항목 이름만 영어예요.

**빼고 써주세요.**

- 실제 조직 이름, 저장소 이름. `someorg/somerepo` 면 충분합니다
- 아직 도는 페이로드. 생김새만 적거나, 주소와 키를 지우고 붙여주세요
- 로그 안의 토큰. 이 도구의 로그에는 **당신의 GitHub 토큰**이 들어갑니다

빈 이슈는 막아뒀어요. 이 세 줄을 양식 맨 위에 적어뒀는데,
빈 이슈로 열면 그걸 아무도 안 보고 열립니다.

gitmoru **자체**의 구멍은 이슈가 아니라 [SECURITY.md](SECURITY.md) 로 가주세요.

## PR 제목이 버전을 정합니다

conventional commits 를 씁니다. 취향 문제가 아니에요.
머지하면 **PR 제목이 그대로 커밋이 되고**, 그 커밋을 보고 다음 버전이 정해집니다.

| 제목 | 무슨 일이 생기나 |
|---|---|
| `fix: ...` | 0.1.0 → 0.1.1 |
| `feat: ...` | 0.1.0 → 0.2.0 |
| `feat!: ...` | 0.1.0 → 1.0.0. 본문에 뭐가 깨지는지 적어주세요 |
| `docs:` `refactor:` `test:` `build:` `chore:` | 아무것도 안 나갑니다 |

**영어로, 소문자로, 한 문장, 마침표 없이.** 한 줄에 한 가지 일만 담아주세요.

```
feat: add blob hash comparison to the detector
fix: stop the first screen from swallowing clicks
docs: write down how to add an MCP tool
```

버전을 손으로 올리지 않습니다. `feat:` 이나 `fix:` 가 들어오면 로봇이
"버전 올림" PR 을 열어두고, 사람이 그걸 머지하면 npm 에 올라가요.
그래서 **제목을 대충 쓰면 나가야 할 게 안 나갑니다.**

## 시험

순수 로직에는 시험을 답니다. `src/core/__tests__/` 에 있어요.

```bash
pnpm test
pnpm test:watch
```

네트워크를 쓰는 시험은 만들지 않습니다. GitHub 호출은 가짜 객체로 대신해요.
남의 저장소를 건드리는 시험은 CI 에서 돌 수 없습니다.

**여기 있는 경우들은 대부분 실제로 틀렸던 것들입니다.** 새 규칙을 만들었는데
"이건 당연히 되겠지" 싶으면 그때가 시험을 쓸 때예요. 이 저장소에서 그 감이 세 번 틀렸습니다.

## PR 올리기 전에

```bash
pnpm check
```

타입, 글쓰기 규칙, 시험, 도트 동작, 빌드를 한 번에 봅니다. CI 도 같은 것을 돌려요.

PR 을 열면 양식이 뜹니다. 마지막 칸이 **SAFETY.md 를 넘는지** 묻는데,
거기 체크가 하나도 없는 게 보통이에요. 비어 있는 것도 답입니다.
하나라도 체크했다면 그걸 허용하는 ADR 을 걸어주세요. ADR 이 없다면, 그게 먼저 올릴 PR 입니다.

되돌리기나 프록시를 건드렸다면, 무엇을 시험했는지 꼭 적어주세요.
이 두 곳은 잘못되면 남의 저장소가 날아갑니다.
