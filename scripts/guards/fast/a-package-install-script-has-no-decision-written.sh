#!/usr/bin/env bash
# A package with an install script is installed, and nobody wrote down whether it may run
#
# WHY THIS TEST EXISTS
# npm 11 runs an install script no `allowScripts` entry in package.json covers, and only warns.
# npm 12 (released 2026-07-08, npm's `latest` since) BLOCKS it, with only the same warning, which
# nobody reads in a build log. Found 2026-10-02 in ian-provencher, when its Node update put the
# warning in Cloudflare's log. Every repo on this PC with install scripts got its decisions written
# the same day, and every one with a guard suite runs this same file. The logic lives once, in
# ~/.claude/install-script-decisions.mjs, which reads package-lock.json: what `npm ci` installs.
#
# WHAT IT DEMANDS
# Every package the lock installs with an install script has an `allowScripts` entry: true to run
# it (`npm approve-scripts <pkg>`), false to skip it (`npm deny-scripts <pkg>`).

set -uo pipefail
NAME="a-package-install-script-has-no-decision-written"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CHECK="$HOME/.claude/install-script-decisions.mjs"

if [ ! -f "$CHECK" ]; then
  printf "FAIL %s - the shared checker is missing from %s\n" "$NAME" "$CHECK"
  exit 1
fi

# THE CONTROL RUNS FIRST: undecided scripts must be found, decisions read the way npm reads them,
# and macOS-only packages skipped. A sweep from a blind matcher would pass every repo.
canary_out="$(node "$CHECK" --selftest 2>&1)"
case "$canary_out" in
  ""|*"CANARY FAILED"*)
    printf "FAIL %s - the check is BLIND. Its own control said: %s\n" "$NAME" "${canary_out:-nothing at all}"
    exit 1 ;;
esac

if ! sweep_out="$(node "$CHECK" --check "$ROOT" 2>&1)"; then
  printf "FAIL %s - %s\n" "$NAME" "$sweep_out"
  exit 1
fi
printf "ok %s\n" "$NAME"
