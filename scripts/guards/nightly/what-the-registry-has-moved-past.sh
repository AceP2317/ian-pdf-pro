#!/usr/bin/env bash
# What the registry has moved past since this project last looked
#
# WHY THIS EXISTS
# The commit-path check only fires on a dependency being ADDED, by the operator's call on
# 2026-09-17: habits for new work, reporting for what is already here. This is the reporting
# half. It never refuses anything, so a project built before the convention existed is visible
# without being blocked.
#
# IT IS NIGHTLY BECAUSE IT IS SLOW. Thirteen packages queried in parallel took 52 seconds on
# the operator's machine, all of it network wait. That cannot sit on a commit path with a
# two-second budget.
#
# READ IT WITH SUSPICION IN TWO PLACES, both measured 2026-09-17:
#   a registry "latest" tag can be an unfinished release candidate — prisma's was 8.0.0-rc.15
#   a registry "latest" tag can be OLDER than what you run — @types/node's was, by two majors
# The report prints the tag beside the highest stable release wherever they disagree, and
# neither is automatically the right answer.

set -uo pipefail
NAME="what-the-registry-has-moved-past"
CHECK="$HOME/.claude/dep-freshness.mjs"

if [ ! -f "$CHECK" ]; then
  printf "FAIL %s - the shared checker is missing from %s\n" "$NAME" "$CHECK"
  exit 1
fi

# THE CONTROL, same as the fast tier's: a comparison that cannot say "behind" would report
# every project clean forever, which is the most comfortable way for this to be useless.
canary_out="$(node "$CHECK" --selftest 2>&1)"
case "$canary_out" in
  ""|*"CANARY FAILED"*)
    printf "FAIL %s - the check is BLIND. Its own control said: %s\n" \
      "$NAME" "${canary_out:-nothing at all}"
    exit 1 ;;
esac

node "$CHECK" --sweep 2>&1
printf "ok   %s\n" "$NAME"
