#!/usr/bin/env bash
# Compile-check every .scd file the way SuperCollider actually loads it.
#
# WHY THIS EXISTS
# A single misplaced line — an assignment sitting between two `var`
# declarations — is a syntax error in sclang, and it fails the WHOLE FILE.
# When that file is 5_beat_engine.scd the result is no beat, no drone, no pad
# and a dark BEAT light, with the only evidence buried in sclang_log.txt.
#
# The obvious check does NOT catch it: `File.readAllString(p).compile` wraps
# the text as a function body and happily accepts var/statement orders the
# real loader rejects. thisProcess.interpreter.compileFile(p) parses it the
# way the interpreter does, and returns nil on failure.
#
# Usage:  tools/check_scd.sh        (exit 0 = all good, 1 = something failed)
set -uo pipefail
SCLANG="${SCLANG:-/Applications/SuperCollider.app/Contents/MacOS/sclang}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

[ -x "$SCLANG" ] || { echo "sclang not found at $SCLANG (set \$SCLANG)"; exit 2; }

TMP="$(mktemp -t chkscd).scd"
trap 'rm -f "$TMP"' EXIT

{
  echo "var dir = \"$ROOT/\";"
  echo 'var bad = 0;'
  echo 'var files = ['
  ( cd "$ROOT" && ls -1 *.scd | sort ) | sed 's/.*/    "&",/'
  echo '    nil ];'
  cat <<'EOF'
files.do { |f|
    if(f.notNil) {
        var fn = thisProcess.interpreter.compileFile(dir ++ f);
        if(fn.isNil) { bad = bad + 1; ("  FAIL  " ++ f).postln } { ("  ok    " ++ f).postln };
    };
};
("SCD CHECK: " ++ bad ++ " failure(s)").postln;
if(bad > 0) { 1.exit } { 0.exit };
EOF
} > "$TMP"

"$SCLANG" -D "$TMP" 2>&1 | grep -E "^  ok|^  FAIL|^SCD CHECK|syntax error"
exit "${PIPESTATUS[0]}"
