/**
 * 터미널에 나가는 말.
 *
 * `bin/` 과 `server/` 는 평범한 JS 라 앱의 i18n(타입스크립트)을 못 쓴다.
 * 그렇다고 한국어로 둘 수는 없다. 앱도 사이트도 세 언어로 말하는데
 * **`npx -y gitmoru` 를 친 사람이 처음 보는 화면만 한국어**였다.
 *
 * 그 세 줄은 "이걸 지금 내 저장소에 돌려도 되나" 에 답하는 자리다.
 * 못 읽으면 거기서 멈춘다.
 *
 * 모르는 지역이면 영어로 간다. 터미널 도구에서 못 알아본 지역이
 * 한국어를 읽을 가능성보다 영어를 읽을 가능성이 높다.
 */

/**
 * 어느 말로 할지 고른다.
 *
 * 환경변수를 먼저 본다. `Intl` 만 보면 **`LANG=en_US` 를 줘도 안 바뀐다.**
 * Node 의 `Intl` 은 POSIX 환경변수가 아니라 운영체제 설정을 읽기 때문이다.
 * 터미널 도구에서 말을 바꾸는 표준 방법이 그 환경변수라 그걸 먼저 봐야 한다.
 *
 * 그래도 못 정하면 영어다. 못 알아본 지역이 한국어를 읽을 가능성보다
 * 영어를 읽을 가능성이 높다.
 */
export function pickLang(env = process.env) {
  const tag =
    env.GITMORU_LANG ||
    env.LC_ALL ||
    env.LC_MESSAGES ||
    env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    'en'

  // `ko_KR.UTF-8` 과 `ko-KR` 둘 다 온다
  const lang = String(tag).toLowerCase().split(/[-_.]/)[0]
  return lang === 'ko' || lang === 'ja' ? lang : 'en'
}

const LANG = pickLang()

export const DICTS = {
  ko: {
    noDownload: '저장소를 내려받지 않습니다 (clone 하지 않음)',
    noNetwork: '화면은 이 컴퓨터 밖으로 통신하지 않습니다',
    tokenStays: 'GitHub 토큰은 이 프로세스 안에만 있습니다',
    quit: '종료하려면 Ctrl+C',
    unknownCommand: (cmd) => `그런 명령은 없어요: ${cmd}`,
    usageServe: '화면을 브라우저로 엽니다',
    usageMcp: 'MCP 서버를 띄웁니다',
    usageVersion: '버전을 찍습니다',
    ghMissing:
      'GitHub CLI(gh) 가 안 보입니다. https://cli.github.com 에서 설치한 다음 `gh auth login` 을 실행해주세요.',
    ghLoggedOut:
      'gh CLI 로그인이 필요합니다. 터미널에서 `gh auth login` 을 먼저 실행해주세요.',
  },
  en: {
    noDownload: 'It never downloads the repository, and never clones it',
    noNetwork: 'The screen cannot reach anything outside this machine',
    tokenStays: 'Your GitHub token stays inside this process',
    quit: 'Ctrl+C to stop',
    unknownCommand: (cmd) => `No such command: ${cmd}`,
    usageServe: 'opens the screen in your browser',
    usageMcp: 'starts the MCP server',
    usageVersion: 'prints the version',
    ghMissing:
      'GitHub CLI (gh) was not found. Install it from https://cli.github.com, then run `gh auth login`.',
    ghLoggedOut: 'gh CLI is not logged in. Run `gh auth login` in your terminal first.',
  },
  ja: {
    noDownload: 'リポジトリはダウンロードもクローンもしません',
    noNetwork: '画面はこのパソコンの外へ通信できません',
    tokenStays: 'GitHub トークンはこのプロセスの中だけにあります',
    quit: '終了は Ctrl+C',
    unknownCommand: (cmd) => `そのコマンドはありません: ${cmd}`,
    usageServe: '画面をブラウザで開きます',
    usageMcp: 'MCP サーバーを起動します',
    usageVersion: 'バージョンを表示します',
    ghMissing:
      'GitHub CLI (gh) が見つかりません。https://cli.github.com からインストールし、`gh auth login` を実行してください。',
    ghLoggedOut: 'gh CLI にログインしていません。先にターミナルで `gh auth login` を実行してください。',
  },
}

export const msg = DICTS[LANG]
