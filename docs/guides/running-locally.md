# 돌려보기

## 준비물

- Node 20 이상, pnpm
- [GitHub CLI](https://cli.github.com) 로그인 (`gh auth login`)

토큰은 `gh` 에서 빌려 쓴다. 우리가 따로 저장하지 않는다
([ADR 0004](../decisions/0004-token-stays-out-of-the-renderer.md)).

## 명령

```bash
pnpm install
pnpm app          # 데스크톱 앱 (평소 이걸 쓴다)
pnpm dev          # 화면만 브라우저에서
pnpm build        # 타입 검사 + 번들
pnpm typecheck
pnpm test          # 순수 로직 시험 (네트워크 안 씀)
pnpm style         # 글쓰기 규칙
pnpm check         # 위 전부 + 빌드. CI 가 돌리는 것과 같다
pnpm icon         # 캐릭터 그림에서 앱 아이콘 굽기
pnpm mcp          # MCP 서버만
```

## 홈 디렉터리 주의

이 프로젝트는 자기 `pnpm-workspace.yaml` 을 들고 있다.
홈에 떠도는 워크스페이스 파일이 있으면 pnpm 이 그걸 잡아서 엉뚱한 곳에 설치한다.

## 폴더를 옮겼다면

pnpm 이 node_modules 를 다시 깔라고 한다. 락파일 그대로 다시 깔면 된다.

```bash
CI=true pnpm install --frozen-lockfile
```

## 앱이 안 뜬다면

`pnpm app` 은 Vite 를 띄우고 Electron 을 붙인다. 예전 실행이 포트를 잡고 있으면 꼬인다.
남아 있는 vite, electron 프로세스를 끄고 다시 실행한다.
