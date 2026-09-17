#!/usr/bin/env bash
# A dependency is added without anyone looking up what version is current
#
# WHY THIS TEST EXISTS
# A dependency gets copied into a new project along with the code that uses it, and the version
# comes with it. Nobody chose that version; it arrived. The project then tests against it for
# months while something else entirely is installed wherever the app actually runs, and every
# green test is a statement about code that does not ship.
#
# WHEN IT FIRED
# 2026-09-17, ECO-Translator. It had asked for pdfjs-dist ^4.10.38 since its first commit,
# copied out of CO-Implementation-Planner with the change-order reader. Abacus served 6.3.289
# the whole time — two major versions apart, on the single most version-sensitive thing in the
# tool, a parser that reads a PDF by where text sits on the page. It surfaced only because the
# operator asked why the versions differed.
#
# WHAT IT DOES NOT DO
# It does not demand the newest release, because "newest" cannot be defined mechanically. On
# 2026-09-17 prisma's registry tag pointed at 8.0.0-rc.15, an unfinished release candidate,
# while @types/node's pointed two majors BELOW what was installed. It demands that somebody
# looked and said which they picked; a deliberate choice to stay behind goes in deps-why.json.
#
# It only fires on a dependency this commit ADDS. What is already here is the nightly sweep's
# business, by the operator's call on 2026-09-17.

set -uo pipefail
NAME="a-dependency-is-added-without-anyone-looking-it-up"
CHECK="$HOME/.claude/dep-freshness.mjs"

if [ ! -f "$CHECK" ]; then
  printf "FAIL %s - the shared checker is missing from %s\n" "$NAME" "$CHECK"
  exit 1
fi

# THE CONTROL RUNS FIRST. It exercises the version comparison against fixed inputs — the pdfjs
# pin that shipped among them — with no network and no git, so it costs milliseconds. A sweep
# from a comparison that always answers "reachable" would pass on the very tree it exists to
# catch, and that is indistinguishable from a clean tree unless this runs.
canary_out="$(node "$CHECK" --selftest 2>&1)"
case "$canary_out" in
  ""|*"CANARY FAILED"*)
    printf "FAIL %s - the check is BLIND. Its own control said: %s\n" \
      "$NAME" "${canary_out:-nothing at all}"
    printf "     A clean sweep below would prove nothing while this is true.\n"
    exit 1 ;;
esac

# THE SWEEP. Silent and zero means no dependency was added, or every one added is current or
# excused. Non-zero means one was added behind the current release with no reason recorded.
if ! sweep_out="$(node "$CHECK" --added 2>&1)"; then
  printf "FAIL %s\n%s\n" "$NAME" "$sweep_out"
  exit 1
fi

printf "ok   %s\n" "$NAME"
