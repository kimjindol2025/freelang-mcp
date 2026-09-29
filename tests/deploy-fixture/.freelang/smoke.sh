#!/bin/sh
set -eu

if [ "${FIXTURE_SMOKE_FAIL:-0}" = 1 ]; then
  echo SMOKE_FIXTURE=FAIL
  exit 9
fi

test -s .freelang/artifact
echo SMOKE_FIXTURE=PASS
