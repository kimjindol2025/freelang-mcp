#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd -P)"
FIXTURE="$SCRIPT_DIR"
TOOLS="$REPO_ROOT/scripts/fl-tools"
CONTRACT="$FIXTURE/CONTRACT.md"
ORIGINAL="$(cat "$CONTRACT")"

cleanup() {
  printf '%s\n' "$ORIGINAL" > "$CONTRACT"
  rm -f "$FIXTURE/.freelang/artifact"
}
trap cleanup EXIT INT TERM

expect_output() {
  output="$1"
  expected="$2"
  printf '%s\n' "$output" | grep -q "$expected"
}

rm -f "$FIXTURE/.freelang/artifact"
set +e
PASS_OUTPUT="$("$TOOLS" deploy "$FIXTURE" 2>&1)"
PASS_CODE=$?
set -e
printf '%s\n' "$PASS_OUTPUT"
if [ "$PASS_CODE" -ne 0 ] || ! expect_output "$PASS_OUTPUT" 'REVIEW=PASS' || \
   ! expect_output "$PASS_OUTPUT" 'DEPLOY=PASS' || \
   ! expect_output "$PASS_OUTPUT" 'SMOKE=PASS' || \
   ! expect_output "$PASS_OUTPUT" 'ARTIFACT_HASH=[0-9a-f]' || \
   ! expect_output "$PASS_OUTPUT" 'ROLLBACK_AVAILABLE=YES'; then
  echo 'DEPLOY_FIXTURE_PASS_CASE=FAIL' >&2
  exit 1
fi
echo 'DEPLOY_FIXTURE_PASS_CASE=PASS'

rm -f "$FIXTURE/.freelang/artifact"
set +e
FAIL_OUTPUT="$(FIXTURE_SMOKE_FAIL=1 "$TOOLS" deploy "$FIXTURE" 2>&1)"
FAIL_CODE=$?
set -e
printf '%s\n' "$FAIL_OUTPUT"
if [ "$FAIL_CODE" -eq 0 ] || ! expect_output "$FAIL_OUTPUT" 'DEPLOY=PASS' || \
   ! expect_output "$FAIL_OUTPUT" 'SMOKE=FAIL'; then
  echo 'DEPLOY_FIXTURE_SMOKE_FAIL_CASE=FAIL' >&2
  exit 1
fi
echo 'DEPLOY_FIXTURE_SMOKE_FAIL_CASE=PASS'

printf '%s\n' "$ORIGINAL" > "$CONTRACT"
printf '%s\n' 'intentional contract drift' >> "$CONTRACT"
set +e
REVIEW_FAIL_OUTPUT="$("$TOOLS" deploy "$FIXTURE" 2>&1)"
REVIEW_FAIL_CODE=$?
set -e
printf '%s\n' "$REVIEW_FAIL_OUTPUT"
if [ "$REVIEW_FAIL_CODE" -eq 0 ] || ! expect_output "$REVIEW_FAIL_OUTPUT" 'REVIEW=FAIL' || \
   ! expect_output "$REVIEW_FAIL_OUTPUT" 'DEPLOY=BLOCKED'; then
  echo 'DEPLOY_FIXTURE_REVIEW_FAIL_CASE=FAIL' >&2
  exit 1
fi
echo 'DEPLOY_FIXTURE_REVIEW_FAIL_CASE=PASS'

echo 'DEPLOY_FIXTURE=PASS'
