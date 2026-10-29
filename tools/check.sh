#!/bin/sh
# Syntax-check every ES module in src/ (node --check needs .mjs)
T=$(mktemp -d)
fail=0
for f in $(find src -name '*.js'); do
  cp "$f" "$T/x.mjs"
  if ! node --check "$T/x.mjs" 2>"$T/err"; then echo "== $f"; head -5 "$T/err"; fail=1; fi
done
rm -rf "$T"
[ $fail = 0 ] && echo "all ok"
