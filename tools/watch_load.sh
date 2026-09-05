#!/usr/bin/env bash
# Watch what the server is actually spending, live.
#
# For the module A/B: run this, sit on module 6 until the numbers settle, note
# the WORST column, then switch to module 1 and do the same.
#
#   worst near 100       -> blocks are arriving at the wire; any interruption
#                           costs one, and that is the tick. Spend less:
#                           ~percMaxLive, or ~scopeBands.
#   worst similar on both, and low
#                        -> it is NOT DSP load. Look at scheduling and the
#                           audio device, not at the synth count.
#
# Usage:  tools/watch_load.sh            follow live
#         tools/watch_load.sh --summary  stats for what is already in the log
#
# ── Why this is one awk and not a sed|awk pipeline ─────────────────────────
# It was, and it printed nothing for four and a half minutes. grep was given
# --line-buffered but sed was not, and BSD sed block-buffers into a pipe: at
# ~30 bytes per row and one row every 2 s, 4096 bytes is 137 rows. The data was
# correct and invisible, which is the worst kind of instrument — it reported
# "no findings" when what it meant was "not yet". One awk with fflush() has no
# intermediate buffer to stall in.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
LOG=sclang_log.txt
[ -f "$LOG" ] || { echo "no $LOG yet — start the ecosystem first"; exit 1; }

# cpu:avg/peak … synths:N … perc:live/max ref:N
READ='
  match($0, /cpu:[0-9.]+\/[0-9.]+/)   { cpu=substr($0,RSTART+4,RLENGTH-4) }
  match($0, /synths:[0-9]+/)          { syn=substr($0,RSTART+7,RLENGTH-7) }
  match($0, /perc:[0-9]+\/[0-9]+ ref:[0-9]+/) { pr=substr($0,RSTART+5,RLENGTH-5) }
  {
    if (cpu=="" || pr=="") next
    split(cpu,c,"/"); split(pr,p,"[/ ]"); sub(/ref:/,"",p[3])
    avg=c[1]+0; peak=c[2]+0; live=p[1]+0; max=p[2]+0; ref=p[3]+0
  }
'

if [ "${1:-}" = "--summary" ]; then
  grep -a MON "$LOG" | awk "$READ"'
    { n++; sa+=avg; if(peak>wp)wp=peak; if(syn+0>ms)ms=syn+0;
      if(live>ml)ml=live; lastref=ref; cap=max }
    END{
      if(n==0){print "  no cpu: field in the log — restart the ecosystem on the new code"; exit}
      printf "  samples        %d\n", n
      printf "  cpu avg  mean  %.1f%%\n", sa/n
      printf "  cpu peak worst %.1f%%\n", wp
      printf "  synths max     %d\n", ms
      printf "  perc live max  %d / %d\n", ml, cap
      printf "  perc refused   %d\n", lastref
    }'
  exit 0
fi

echo "  CPU%avg  CPU%peak   worst   synths   perc    refused"
echo "  -------------------------------------------------------"
# grep first. Without it awk sees EVERY line in the log — TX announcements,
# postln chatter, all of it — and the print block fires on each one carrying
# whatever the last MON line left behind, so a single sample is repeated dozens
# of times and the cadence of the readout is lost. Which is what it did.
tail -F -n 0 "$LOG" 2>/dev/null | grep --line-buffered -a "\[MON\]" | awk "$READ"'
  { if(peak>worst) worst=peak
    # An overrun is the whole point of watching, so it is marked rather than
    # left to be spotted in a column of numbers.
    flag = (peak > 100) ? "  <<< OVERRUN — dropout" : ""
    printf "  %6.1f   %7.1f   %5.1f   %6d   %2d/%-2d   %8d%s\n", avg,peak,worst,syn,live,max,ref,flag
    fflush() }'
