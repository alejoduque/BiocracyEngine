#!/usr/bin/env bash
# Watch what the server is actually spending, live.
#
# For the module A/B: run this, sit on module 6 until the numbers settle, note
# the PEAK column, then switch to module 1 and do the same. The question is
# whether peak CPU is high on 6 and low on 1.
#
#   peak near 100  -> blocks are already arriving at the wire. Any interruption
#                     (Space switch, app switch, compositing) costs one, and
#                     that is the tick. The fix is to spend less: lower
#                     ~percMaxLive, or ~scopeBands.
#   peak similar on both -> it is not DSP load, and the next step is a bisect
#                     from working-2026-09-01 rather than another hypothesis.
#
# Usage:  tools/watch_load.sh            (follows the live log)
#         tools/watch_load.sh --summary  (stats for what is already in the log)

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
LOG=sclang_log.txt
[ -f "$LOG" ] || { echo "no $LOG yet — start the ecosystem first"; exit 1; }

parse() {
  # cpu:avg/peak ... synths:N ... perc:live/max ref:N
  sed -n 's/.*cpu:\([0-9.]*\)\/\([0-9.]*\).*synths:\([0-9]*\).*perc:\([0-9]*\)\/\([0-9]*\) ref:\([0-9]*\).*/\1 \2 \3 \4 \5 \6/p'
}

if [ "${1:-}" = "--summary" ]; then
  grep -a MON "$LOG" | parse | awk '
    {n++; ca+=$1; if($2>mp)mp=$2; if($3>ms)ms=$3; if($4>mperc)mperc=$4; ref=$6}
    END{
      if(n==0){print "  no cpu: field yet — restart the ecosystem to pick up the new MON line"; exit}
      printf "  samples %d\n  cpu avg  mean %.1f%%\n  cpu peak max  %.1f%%\n  synths max    %d\n  perc live max %d\n  perc refused  %d\n", n, ca/n, mp, ms, mperc, ref
    }'
  exit 0
fi

echo "  CPU%avg  CPU%peak   worst   synths   perc   refused"
echo "  ------------------------------------------------------"
tail -F -n 0 "$LOG" 2>/dev/null | grep --line-buffered -a MON | parse | awk '
  {if($2>worst)worst=$2;
   printf "  %6.1f   %7.1f   %5.1f   %6d   %2d/%-2d   %7d\n", $1,$2,worst,$3,$4,$5,$6; fflush()}'
