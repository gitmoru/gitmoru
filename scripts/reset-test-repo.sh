#!/usr/bin/env bash
# gitmoru 되돌리기를 다시 시험하고 싶을 때 실행하세요.
# 브랜치를 정상 상태로 돌렸다가 다시 '공격당한 상태'로 만들어 둡니다.
set -e
REPO="${GITMORU_TEST_REPO:?시험용 저장소를 GITMORU_TEST_REPO 에 넣어주세요 (예: 내계정/gitmoru-test)}"
BR="${GITMORU_TEST_BRANCH:-test/restore}"
GOOD="${GITMORU_TEST_GOOD:?되돌아갈 정상 커밋 SHA 를 GITMORU_TEST_GOOD 에 넣어주세요}"
BAD="${GITMORU_TEST_BAD:?공격당한 상태로 쓸 커밋 SHA 를 GITMORU_TEST_BAD 에 넣어주세요}"

echo "정상 상태로 (${GOOD:0:8})"
gh api "repos/$REPO/git/refs/heads/$BR" -X PATCH -F force=true -f sha="$GOOD" >/dev/null
sleep 10
echo "다시 덮어쓰기 (${BAD:0:8})"
gh api "repos/$REPO/git/refs/heads/$BR" -X PATCH -F force=true -f sha="$BAD" >/dev/null
echo "준비됐어요. gitmoru 에서 다시 검사해보세요."
