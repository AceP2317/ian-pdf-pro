#!/usr/bin/env bash
# guard.sh — run this repo's regression guards: one test per mistake this repo has already made.
#
# WHY THESE EXIST. Until 2026-09-11 these checks lived as prose entries in ~/.claude/LEDGER.md,
# executed by a nightly audit whose result nothing read. Measured that day: 62 of 403 recorded
# classes had fired AGAIN after being written down, and 190 were reporting the mistake present in
# some tree right now with no consequence anywhere. The checks themselves were sound; the wrapper
# around them was not. They now run here, before a commit, where a failure stops the work.
#
# EVERY TEST IS TWO HALVES AND BOTH MUST HOLD:
#   the control  plants the defect, or proves the search can see its own population
#   the sweep    finds live instances — silence means clean
# A test whose control has gone blind is reported as a FAILURE, not as a pass. That distinction is
# not theoretical: on the first run of this suite one converted check was found printing "CANARY
# FAILED" while the old nightly audit reported it clean, because that audit only ever treated a
# SILENT control as broken.
#
# TWO TIERS, AND THE SPLIT IS A MEASUREMENT RATHER THAN A PREFERENCE.
#   fast/     under FAST_BUDGET_MS each; runs before every commit
#   nightly/  a browser render or a full build; too slow for a commit and still worth running
# A gate people wait six minutes for gets bypassed, and a bypassed gate protects nothing.
#
# AND A THIRD, ADDED 2026-09-11, WHICH IS NOT A SLOWER TIER BUT A DIFFERENT KIND OF THING.
#   quarantine/  the check is correct and the defect it finds is REAL and still there
#
# Where it came from. Retiring ~/.claude/LEDGER.md into these suites hit a wall that the plan had
# not priced: of 286 classes still to convert, 192 could not become tests because the mistake each
# one describes is present in the tree RIGHT NOW, and a test written from one would start red. The
# three ways out were to repair all 192 first, to abandon them, or to let the check exist while
# failing. The third was chosen on 2026-09-11 because it is the only one that keeps the check ALIVE
# without blocking anything on repairs nobody has scheduled.
#
# HOW IT BEHAVES, AND EVERY LINE OF THIS IS THE POINT:
#   * it NEVER runs on the commit path. `guard.sh` with no argument is still fast/ alone.
#   * a FAILING quarantined test changes no exit code. That failure is the known debt, and 192
#     permanent reds mixed into the nightly verdict would drown the one new red that matters.
#   * a PASSING quarantined test is the loud event. Somebody fixed the defect, so the test should
#     graduate into fast/ or nightly/ and start defending the repair. Exit code 2 says so.
# A quarantine nobody ever empties is a rubbish bin. The graduation signal is what makes it a queue.
#
# Usage:
#   bash scripts/guard.sh                the fast tier   (npm run guard)
#   bash scripts/guard.sh --nightly      the slow tier   (npm run guard:nightly)
#   bash scripts/guard.sh --quarantine   the known-failing tier; exit 2 if any now PASSES
#   bash scripts/guard.sh --all          all three

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAST_BUDGET_MS="${FAST_BUDGET_MS:-2000}"

# A REPO MAY DECLARE ITS OWN FAST BUDGET, IN WRITING, IN guards/fast-budget.
# Format: one line, "<milliseconds>  <reason, and the date>". No reason, no override.
#
# WHY THIS EXISTS. The budget catches a fast test that has GROWN slow. It cannot tell that apart
# from a test that was always legitimately slower than 2000ms, and it offers only two remedies —
# make it cheaper, or move it to nightly. Measured 2026-09-17 in ECO-Translator: its type check
# runs 2.4s and its engine suite 3.2s, both on the commit path deliberately because that repo's
# product is an arithmetic answer a planner acts on, and it is the only one of seventeen that
# tests before a commit. Neither remedy applied, so two warnings fired on EVERY commit.
#
# THAT IS THE REAL DAMAGE, not the noise. A warning that always fires stops being read, and the
# third test to drift over would have gone unnoticed — the same reasoning that keeps thirteen
# known-stale runners out of the failure count rather than drowning the one that matters.
#
# THE REASON IS MANDATORY AND THE OVERRIDE IS ANNOUNCED ON EVERY RUN. An allowance nobody sees is
# how "make it cheaper" quietly becomes "raise the number", which would cost the instrument
# entirely rather than repair it.
if [ -f "$HERE/guards/fast-budget" ]; then
  _fb_line="$(head -1 "$HERE/guards/fast-budget" 2>/dev/null)"
  _fb_ms="${_fb_line%%[!0-9]*}"
  _fb_why="${_fb_line#"$_fb_ms"}"
  _fb_why="${_fb_why#"${_fb_why%%[![:space:]]*}"}"
  if [ -n "$_fb_ms" ] && [ -n "$_fb_why" ]; then
    FAST_BUDGET_MS="$_fb_ms"
  else
    printf 'guard.sh: guards/fast-budget must read "<milliseconds>  <reason>" — ignoring it and using %sms.\n' \
      "$FAST_BUDGET_MS" >&2
  fi
fi

# THE PER-TEST KILL, AND IT IS PER TIER BECAUSE ONE NUMBER WAS MEASURED WRONG (L-374).
# A single 600s bound was added on 2026-09-13 and KILLED A HEALTHY TEST on its first full nightly
# run: a suite executing 34 other suites takes 11m20s on a QUIET machine, so 600s was below its
# legitimate runtime rather than above it. The bound was doing the exact thing its own comment
# warned against — catching slowness instead of hangs, which is how a suite starts being run with
# the guard switched off.
#
# THE TWO TIERS HAVE DIFFERENT LEGITIMATE CEILINGS AND SO NEED DIFFERENT BOUNDS. A fast test lives
# under a 2000ms budget and the whole suite is killed by the commit hook at 60s. A nightly test can
# run whole suites, and the slowest measured on this estate is 11m20s.
#
# WITHOUT A BOUND, the only thing that notices a test which never returns is whatever kills the
# whole job from outside — and it kills the RUN, not the test. Every result already computed goes
# with it, and the morning report is not "test 14 hung", it is nothing. Measured 2026-09-13: a
# nightly tier ran 705,912ms across 82 tests, so one hang would have cost 81 good results.
GUARD_KILL_FAST="${GUARD_KILL_FAST:-120}"
GUARD_KILL_SLOW="${GUARD_KILL_SLOW:-1800}"
# Seconds between the polite stop at a bound and the forced one, for a test that ignores the first.
GUARD_KILL_GRACE="${GUARD_KILL_GRACE:-5}"
# A GRACE OF 0 SWITCHES THE FORCED STOP OFF, AND SAYS SO (2026-10-04, the review of login-starter
# 9d4a71f): GNU `timeout -k 0` sends no SIGKILL at all, measured with a check that ignores SIGTERM
# running on to its own end.
# THE TEST IS NUMERIC, AND A BOUND OF 0 IS CAUGHT TOO (2026-10-05, reviews C F3, F4, N2 and G F4): the
# old pattern listed 0, 00 and 000, so 0000 still switched the forced stop off, and it read any unit
# as junk, cutting a valid "1m" or "2.5" to 1 second with a line saying it was off. And a bound of 0
# makes `timeout 0s` no bound at all, with nothing said. The grace takes a duration `timeout -k`
# reads (a number, optionally with s, m, h or d); the bounds are plain seconds, as an "s" is appended.
# Each must hold a non-zero digit, and anything else falls back with a line naming the value.
guard_duration() { # name value fallback units-allowed -> REPLY
  local re='^[0-9]+(\.[0-9]+)?$'
  [ "$4" = units ] && re='^[0-9]+(\.[0-9]+)?[smhd]?$'
  if [[ "$2" =~ $re ]] && [[ "${2%[smhd]}" =~ [1-9] ]]; then REPLY="$2"; return 0; fi
  printf '  (%s=%s is not a duration above zero, and 0 switches it off; using %s)\n' "$1" "$2" "$3"
  REPLY="$3"
}
guard_duration GUARD_KILL_GRACE "$GUARD_KILL_GRACE" 1 units; GUARD_KILL_GRACE="$REPLY"
guard_duration GUARD_KILL_FAST "$GUARD_KILL_FAST" 120 plain; GUARD_KILL_FAST="$REPLY"
guard_duration GUARD_KILL_SLOW "$GUARD_KILL_SLOW" 1800 plain; GUARD_KILL_SLOW="$REPLY"
case "$GUARD_KILL_GRACE" in *[smhd]) GRACE_SHOWN="$GUARD_KILL_GRACE" ;; *) GRACE_SHOWN="${GUARD_KILL_GRACE}s" ;; esac

tiers="fast"
case "${1:-}" in
  --nightly)    tiers="nightly" ;;
  --quarantine) tiers="quarantine" ;;
  --all)        tiers="fast nightly quarantine" ;;
  "")           ;;
  *) printf 'usage: guard.sh [--nightly|--quarantine|--all]\n' >&2; exit 2 ;;
esac

pass=0; fail=0; over=0; total=0; ran=0; absent=''; empty=''
qpass=0; qfail=0; declare -a GRADUATES=()

# --- THE RUN LOG ---------------------------------------------------------------------------------
# WHY IT EXISTS. Until 2026-09-14 this runner printed per-test lines to the terminal and kept
# nothing. That is fine while you are watching. It is useless the moment a failure does not
# reproduce: on 2026-09-14 a commit in claude-home was refused with "39 run, 38 passed, 1 failed",
# the identical retry passed 39/39, and two further full runs passed 39/39 — and WHICH test failed
# was already unrecoverable, because the only copy of that line had scrolled past.
#
# EVERY RUN IS KEPT, NOT JUST THE FAILING ONES. Operator's call, 2026-09-14, and the reason is that
# a run which dies partway through never reaches the point where it would decide it was worth
# saving — so "save only failures" reintroduces the blindness this is here to remove. A green run
# of forty tests costs about 4 KB.
#
# TWO BOUNDS, AND THE AGE ONE BITES FIRST. Lines older than GUARD_LOG_MAX_DAYS go, then if the file
# is still over GUARD_LOG_MAX_BYTES the oldest survivors go until it is not. Every line carries its
# own date as the first field, so trimming is a line filter and can never leave half a record. All
# lines of one run share the run's start date, so a run is never half-trimmed.
#
# IT IS OUTSIDE EVERY REPO, keyed by repo name, so no repo needs a .gitignore line for it and two
# repos cannot overwrite each other's history.
GUARD_LOG_MAX_BYTES="${GUARD_LOG_MAX_BYTES:-4194304}"   # 4 MB, roughly 1,000 runs of forty tests
GUARD_LOG_MAX_DAYS="${GUARD_LOG_MAX_DAYS:-14}"
if [ -z "${GUARD_LOG+x}" ]; then
  _glog_repo="$(basename "$(cd "$HERE/.." 2>/dev/null && pwd)" 2>/dev/null)"
  GUARD_LOG="${HOME}/.claude/cache/guard-runs-${_glog_repo:-unknown}.log"
fi
printf -v _GLOG_DAY '%(%Y-%m-%d)T' -1
printf -v _GLOG_AT  '%(%H:%M:%S)T' -1
_GLOG_RUN="$$"

# WARN, NEVER FAIL SILENTLY. A log that cannot be written says so once on stderr and the run
# continues — a runner that dies because its diary is unwritable is worse than no diary.
if [ -n "$GUARD_LOG" ]; then
  if ! mkdir -p "$(dirname "$GUARD_LOG")" 2>/dev/null; then
    printf 'guard.sh: cannot create %s — this run is NOT being recorded.\n' "$(dirname "$GUARD_LOG")" >&2
    GUARD_LOG=''
  fi
fi

_glog() { [ -n "$GUARD_LOG" ] || return 0
          printf '%s %s %s %s\n' "$_GLOG_DAY" "$_GLOG_AT" "$_GLOG_RUN" "$*" >> "$GUARD_LOG" 2>/dev/null || true; }

# One line per test, plus the captured output when it did not pass. The label mirrors the terminal
# exactly, so a reader of the log and a reader of the screen are reading the same verdict.
_glog_test() {  # <tier> <rc> <ms> <name> <output>
  [ -n "$GUARD_LOG" ] || return 0
  local _t="$1" _rc="$2" _ms="$3" _n="$4" _o="$5" _label
  if [ "$_t" = quarantine ]; then
    [ "$_rc" -eq 0 ] && _label=PASSES || _label=known
  elif [ "$_rc" -eq 0 ]; then _label=ok
  elif [ "$_rc" -eq 124 ]; then _label=KILLED
  else _label=FAIL
  fi
  _glog "$(printf '%-6s %6sms  %s/%s' "$_label" "$_ms" "$_t" "$_n")"
  case "$_label" in
    FAIL|KILLED|PASSES) printf '%s\n' "$_o" | while IFS= read -r _l; do _glog "    | $_l"; done ;;
  esac
}

# TRIMMED AT MOST ONCE A DAY UNLESS THE SIZE BOUND DEMANDS IT SOONER, because this runs on the
# commit path and an unconditional pass over a 4 MB file at every commit is a cost with no payer.
_glog_trim() {
  [ -n "$GUARD_LOG" ] && [ -s "$GUARD_LOG" ] || return 0
  local _stamp='' _bytes _cut _tmp
  [ -f "$GUARD_LOG.trimmed" ] && read -r _stamp < "$GUARD_LOG.trimmed" 2>/dev/null
  _bytes=$(wc -c < "$GUARD_LOG" 2>/dev/null) || _bytes=0
  [ "$_stamp" = "$_GLOG_DAY" ] && [ "${_bytes:-0}" -le "$GUARD_LOG_MAX_BYTES" ] && return 0
  _cut=$(date -d "-${GUARD_LOG_MAX_DAYS} days" +%Y-%m-%d 2>/dev/null) || _cut=''
  _tmp="$GUARD_LOG.tmp.$$"
  if [ -n "$_cut" ]; then
    awk -v c="$_cut" 'substr($0,1,10) >= c' "$GUARD_LOG" > "$_tmp" 2>/dev/null || { rm -f "$_tmp"; return 0; }
  else
    cp "$GUARD_LOG" "$_tmp" 2>/dev/null || { rm -f "$_tmp"; return 0; }
  fi
  # THE SIZE BOUND IS SECOND AND IT CUTS ON A LINE BOUNDARY. `tail -c` alone would leave a partial
  # first line whose date field is truncated, which the age filter above would then read as a date
  # that sorts wrong forever; dropping that first line is what makes the two bounds composable.
  if [ "$(wc -c < "$_tmp" 2>/dev/null || echo 0)" -gt "$GUARD_LOG_MAX_BYTES" ]; then
    tail -c "$GUARD_LOG_MAX_BYTES" "$_tmp" | tail -n +2 > "$_tmp.2" 2>/dev/null && mv -f "$_tmp.2" "$_tmp"
  fi
  mv -f "$_tmp" "$GUARD_LOG" 2>/dev/null && printf '%s\n' "$_GLOG_DAY" > "$GUARD_LOG.trimmed" 2>/dev/null
  rm -f "$_tmp" "$_tmp.2" 2>/dev/null || true
}

_glog_trim
_glog "=== run start  tiers:$tiers  repo:$(cd "$HERE/.." 2>/dev/null && pwd)"

for tier in $tiers; do
  dir="$HERE/guards/$tier"
  # A TIER THAT DOES NOT EXIST AND A TIER THAT EXISTS AND IS EMPTY ARE DIFFERENT EVENTS, and until
  # 2026-09-11 this runner treated both as nothing to report. A repo that has never used the slow
  # tier is fine and says so. A tier DIRECTORY holding no tests is a suite whose guards were removed
  # or whose glob stopped matching, and it reports "0 failed" — which reads exactly like a clean
  # run. Measured that day: six of eleven repos reported clean having executed nothing at all.
  if [ ! -d "$dir" ]; then absent="$absent $tier"; continue; fi
  printf '\n%s tier:\n' "$tier"
  # SAID OUT LOUD, EVERY RUN. A raised budget nobody sees is how the instrument gets spent.
  # The FACT is announced every run; the REASON stays in the file. Printing the whole reason
  # was the first version and it put 400 characters on every commit — noise of exactly the kind
  # this override exists to remove.
  if [ "$tier" = fast ] && [ -n "${_fb_why:-}" ] && [ "$FAST_BUDGET_MS" != 2000 ]; then
    printf '  budget raised to %sms for this repo — why, in scripts/guards/fast-budget\n' "$FAST_BUDGET_MS"
  fi
  tier_ran=0
  for t in "$dir"/*.sh; do
    [ -e "$t" ] || continue
    # QUARANTINED TESTS ARE NOT IN `ran`, so "N test(s) run, P passed, F failed" still adds up.
    # They are counted on their own line below, which is the whole reason the tier exists.
    [ "$tier" = quarantine ] || ran=$((ran+1))
    tier_ran=$((tier_ran+1))
    # BOTH BOUNDS ARE HANG DETECTORS AND NEITHER IS A SPEED LIMIT, which is why each sits far above
    # any legitimate runtime for its tier. Speed already has its own instrument: FAST_BUDGET_MS
    # NAMES a fast test that has grown slow without killing it. A bound tight enough to catch
    # slowness would eventually kill a legitimate slow test, which is how a suite starts being run
    # with the guard switched off — and that is not hypothetical, it is what the single 600s bound
    # did on its first nightly run before it was split into the pair above.
    #
    # THE FALLBACK KEEPS THIS WORKING WHERE `timeout` IS ABSENT, because a runner that dies on a
    # missing tool is worse than an unbounded one.
    #
    # THE OUTPUT GOES TO A FILE, AND A FORCED STOP FOLLOWS THE POLITE ONE (2026-10-04, the review of
    # skills 4d5e6eb). Read through `$(...)`, the runner waited for every process holding the pipe, so a
    # check that left a background child running held the run for as long as that child lived, past
    # any bound. And `timeout` alone sends SIGTERM, which a check can ignore and run on to its own
    # end; `-k` sends SIGKILL GUARD_KILL_GRACE seconds later, and `timeout` then exits 137, not 124.
    # WHAT A PASSING CHECK LEAVES BEHIND IS KILLED WITH IT, AND QUIETLY (2026-10-04, found by review B
    # of claude-home 1450c2c4, fixed in dc22d0aa): with the output in a file nothing waited on a background child, so one a check left
    # running outlived the whole run; and a forced stop made bash print "Killed" for the job, naming no
    # check. `timeout` leads its own process group, so the group is killed once the check returns, and
    # the subshell absorbs the job notice.
    _kill=""; _cap="$(mktemp 2>/dev/null)" || _cap=""
    [ -n "$_cap" ] || printf '  (no temp file: %s is read through a pipe, which a child it leaves running can hold open)\n' "$(basename "$t")"
    # THE CLOCK BRACKETS THE CHECK ALONE (2026-10-04, the review of login-starter 9d4a71f): started
    # before mktemp and stopped after cat and rm, it charged each check about 100ms of the runner's own
    # work, measured 202-213ms against 102-106ms, which tipped checks near the budget over it.
    s=$(date +%s%3N)
    if command -v timeout >/dev/null 2>&1; then
      if [ "$tier" = fast ]; then _kill="$GUARD_KILL_FAST"; else _kill="$GUARD_KILL_SLOW"; fi
      if [ -n "$_cap" ]; then
        ( timeout -k "$GUARD_KILL_GRACE" "${_kill}s" bash "$t" > "$_cap" 2>&1 & _tp=$!
          wait "$_tp"; _trc=$?
          kill -KILL -- "-$_tp" 2>/dev/null
          exit "$_trc" ) 2>/dev/null; rc=$?
      else out="$(timeout -k "$GUARD_KILL_GRACE" "${_kill}s" bash "$t" 2>&1)"; rc=$?; fi
    else
      if [ -n "$_cap" ]; then bash "$t" > "$_cap" 2>&1; rc=$?; else out="$(bash "$t" 2>&1)"; rc=$?; fi
    fi
    ms=$(( $(date +%s%3N) - s )); total=$((total+ms))
    if [ -n "$_cap" ]; then out="$(cat "$_cap" 2>/dev/null)"; rm -f "$_cap" 2>/dev/null; fi
    # A forced stop at the bound is the same event as a polite one, so it reads as 124 below.
    [ "$rc" -eq 137 ] && [ -n "$_kill" ] && [ "$ms" -ge $(( _kill * 1000 )) ] && rc=124
    name="$(basename "$t" .sh)"
    # RECORDED BEFORE THE BRANCHES BELOW, not inside them. Those arms end in `continue` and each
    # prints its own wording, so a log call per arm is several chances to add a new arm later and
    # forget one. One call here cannot be missed by a branch that does not exist yet.
    _glog_test "$tier" "$rc" "$ms" "$name" "$out"
    # THE QUARANTINE TIER READS ITS RESULTS THE OTHER WAY UP. A failure there is the debt being
    # confirmed, which is expected and carries no consequence; a PASS is news, because it means the
    # defect the test was parked on has been fixed and the test should now be defending that fix.
    if [ "$tier" = quarantine ]; then
      if [ "$rc" -eq 0 ]; then
        qpass=$((qpass+1)); GRADUATES+=("$name")
        printf '  PASSES %5dms  %s\n' "$ms" "$name"
        printf '         ^ the defect this was parked on is GONE. Move it to fast/ or nightly/.\n'
      else
        qfail=$((qfail+1)); printf '  known %6dms  %s\n' "$ms" "$name"
      fi
      continue
    fi
    if [ "$rc" -eq 0 ]; then
      pass=$((pass+1)); printf '  ok    %6dms  %s\n' "$ms" "$name"
      # A FAST TEST THAT HAS GROWN SLOW IS SAID, NEVER SILENTLY TOLERATED. That is how a
      # commit-time suite turns into one nobody waits for, one test at a time.
      if [ "$tier" = fast ] && [ "$ms" -gt "$FAST_BUDGET_MS" ]; then
        over=$((over+1))
        printf '        ^ over the %dms budget — make it cheaper or move it to guards/nightly/\n' "$FAST_BUDGET_MS"
      fi
    elif [ "$rc" -eq 124 ]; then
      # KILLED IS NOT FAILED, and 124 is `timeout`'s own exit code for a command it stopped. It
      # counts against the suite exactly like a failure — a test that did not finish proves
      # nothing — but it is NAMED differently, because the fix is different. A failing test has
      # FOUND something; a killed one has HUNG, and the output below is whatever it managed first.
      fail=$((fail+1)); printf '  KILLED %5dms  %s\n' "$ms" "$name"
      printf '         ^ hit the %ss per-test bound for the %s tier; one that ignores the polite stop runs up\n' "$_kill" "$tier"
      printf '           to %s more before the forced one, so its time can pass the bound. Every other test in this run\n' "$GRACE_SHOWN"
      printf '           still reported, which is the whole point of the bound (L-374).\n'
      printf '%s\n' "$out" | sed 's/^/          /'
    else
      fail=$((fail+1)); printf '  FAIL  %6dms  %s\n' "$ms" "$name"
      printf '%s\n' "$out" | sed 's/^/          /'
    fi
  done
  # AN EMPTY QUARANTINE IS THE GOAL, NOT A FAULT. Every other tier holding no tests means its
  # guards went missing; this one holding none means the debt is paid.
  [ "$tier_ran" -eq 0 ] && [ "$tier" != quarantine ] && empty="$empty $tier"
done

printf '\n%d test(s) run, %d passed, %d failed, %dms total.\n' "$ran" "$pass" "$fail" "$total"
# THE SUMMARY IS THE LAST THING WRITTEN, so a record with no "run end" line is a run that died
# partway — which is a fact worth reading, and the one a save-only-on-failure design cannot record.
_glog "$(printf '=== run end    %d run, %d passed, %d failed, %dms total' "$ran" "$pass" "$fail" "$total")"

# THE QUARANTINE IS COUNTED ON ITS OWN LINE, never folded into the numbers above. Folding a known
# failure into "failed" is how a board of 192 expected reds hides the one unexpected one.
if [ "$(( qpass + qfail ))" -gt 0 ]; then
  printf 'quarantine: %d still failing as expected, %d now PASSING.\n' "$qfail" "$qpass"
fi
if [ "${#GRADUATES[@]}" -gt 0 ]; then
  printf 'READY TO GRADUATE — the defect each of these was parked on is fixed:\n'
  printf '  %s\n' "${GRADUATES[@]}"
  printf 'Move each into fast/ or nightly/ so it starts defending the repair.\n'
fi

# SAID, NEVER SILENT. A tier this repo does not use is a fact worth one line; it is not a failure,
# because a repo that has no slow tests yet is in a normal state and blocking its commits over that
# would make the runner the problem.
[ -n "$absent" ] && printf 'no%s tier in this repo — nothing to run there.\n' "$absent" >&2

# AND A TIER THAT EXISTS AND RAN NOTHING IS A FAILURE. Its tests were removed, or the glob stopped
# matching, and the summary line above it says "0 failed" in exactly the tone a clean run uses.
# Precedent: the same reasoning ledger-audit.sh carries about printing `0 entries — 0 clean`.
if [ -n "$empty" ]; then
  printf 'GUARD SUITE RAN NOTHING in the%s tier, which EXISTS and holds no tests.\n' "$empty" >&2
  printf '  That is a failure, not a pass. Check scripts/guards/ for a directory emptied by accident.\n' >&2
  exit 1
fi

[ "$over" -gt 0 ] && printf '%d fast test(s) over budget.\n' "$over"

# THE SUITE'S TOTAL, NOT JUST EACH TEST'S. Added 2026-09-11, and the per-test budget above does not
# cover this: forty tests can each sit comfortably under 2000ms while their SUM walks into the
# commit hook's kill. Past that the suite is killed, the commit is refused, and NOTHING WAS
# CHECKED — the worst of both. Measured the day this was added: claude-home's fast tier reached 38
# tests and 23.5s mid-conversion, 39% of the kill, with more still to convert. A warning at 60%
# leaves room to move the slowest tests to nightly/ before the gate starts refusing work.
#
# THE NUMBER IS READ OUT OF THE HOOK THAT ENFORCES IT AND IS WRITTEN DOWN NOWHERE ELSE HERE, from
# 2026-09-17. This block used to carry `${GUARD_HOOK_KILL_MS:-60000}` and a comment stating the
# kill was 60s. NOTHING ANYWHERE SET THAT VARIABLE, so the fallback was always what ran — and the
# hook was raised to 90s on 2026-09-14. Every one of the eighteen copies of this runner therefore
# warned at 36s against a real ceiling of 90s, and said 60 in prose beside it. A duplicated number
# does not announce that it has drifted; it just quietly reports the wrong percentage.
#
# THE FALLBACK WARNS RATHER THAN GUESSING QUIETLY. If the hook cannot be read the old 60000 is used
# and says so on the error channel, because a percentage measured against an invented ceiling looks
# exactly like one measured against the real thing.
if [ "$ran" -gt 0 ] && printf '%s' "$tiers" | grep -q fast; then
  KILL_MS="${GUARD_HOOK_KILL_MS:-}"
  if [ -z "$KILL_MS" ]; then
    _gr_hook="${GUARD_HOOK_PATH:-$HOME/.claude/githooks/pre-commit}"
    # ANCHORED ON THE LINE THAT RUNS THE SUITE, AND THAT ANCHOR IS THE WHOLE CORRECTNESS OF THIS.
    # The hook carries TWO `timeout -k` lines: the gate's own 20s on estate-check.sh, and the
    # suite's kill further down. A first-match extraction returns 20 and the warning would fire at
    # 12s — worse than the 60000 it replaced, and confidently so. Measured 2026-09-17: the naive
    # form returned 20, this one returns 90.
    _gr_secs="$(sed -n 's|.*timeout -k [0-9]*s \([0-9]*\)s .*scripts/guard\.sh.*|\1|p' "$_gr_hook" 2>/dev/null | head -1)"
    # A value outside this range means the pattern matched something that is not a timeout.
    case "$_gr_secs" in
      ''|*[!0-9]*) _gr_secs="" ;;
      *) [ "$_gr_secs" -lt 10 ] || [ "$_gr_secs" -gt 900 ] && _gr_secs="" ;;
    esac
    if [ -n "$_gr_secs" ]; then
      KILL_MS="${_gr_secs}000"
    else
      KILL_MS=60000
      printf 'WARNING: the commit kill could not be read from %s, so the suite-total\n' "$_gr_hook" >&2
      printf '  warning below is measured against a GUESSED 60000ms. Check the real timeout\n' >&2
      printf '  in that file before acting on the percentage.\n' >&2
    fi
  fi
  if [ "$total" -gt $(( KILL_MS * 60 / 100 )) ]; then
    printf 'THIS SUITE IS %dms, %d%% of the %dms the commit hook kills at.\n' \
      "$total" $(( total * 100 / KILL_MS )) "$KILL_MS" >&2
    printf '  Past that kill the commit is refused AND nothing was checked. Move the slowest\n' >&2
    printf '  tests into guards/nightly/ — the lines above are sorted by cost.\n' >&2
  fi
fi

# A REAL FAILURE OUTRANKS A GRADUATION, because one is something broken and the other is something
# fixed. Exit 2 is reserved for "nothing is broken AND there is quarantined work ready to move",
# which is the only state a caller needs to tell apart from a plain clean run.
[ "$fail" -eq 0 ] || exit 1
[ "$qpass" -eq 0 ] || exit 2
exit 0
