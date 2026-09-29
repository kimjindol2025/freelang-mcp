#!/bin/sh
set -eu

mkdir -p .freelang
printf 'deploy-fixture-artifact\n' > .freelang/artifact
echo DEPLOY_FIXTURE=PASS
