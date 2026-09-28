#!/bin/bash
# Run a heavy command while holding one of a few machine-wide slots.
#   bash scripts/slot.sh build   npx next build
#   bash scripts/slot.sh browser node scripts/shoot.mjs ...
# Up to 8 agents build in parallel on a 16 GB laptop. `build` allows 2 holders, `browser` 3.
# A slot whose holder process has died is reclaimed, so a crashed agent cannot wedge the rest.
set -u
kind="${1:-}"; shift || true
case "$kind" in
  build)   max=2 ;;
  browser) max=3 ;;
  *) echo "usage: slot.sh <build|browser> <command...>" >&2; exit 2 ;;
esac
[ "$#" -gt 0 ] || { echo "slot.sh: no command given" >&2; exit 2; }
root="${WITNESS_SLOT_DIR:-${TMPDIR:-/tmp}/witness-slots}"
mkdir -p "$root"
held=""; waited=0
while [ -z "$held" ]; do
  i=1
  while [ "$i" -le "$max" ]; do
    d="$root/$kind.$i"
    if mkdir "$d" 2>/dev/null; then echo "$$" > "$d/pid"; held="$d"; break; fi
    pid="$(cat "$d/pid" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      if ! kill -0 "$pid" 2>/dev/null; then rm -rf "$d"; continue; fi
    elif [ -n "$(find "$d" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then rm -rf "$d"; continue; fi
    i=$((i + 1))
  done
  if [ -z "$held" ]; then
    [ $((waited % 30)) -eq 0 ] && echo "slot.sh: waiting for a '$kind' slot (${waited}s)" >&2
    sleep 3; waited=$((waited + 3))
  fi
done
cleanup() { rm -rf "$held"; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM
"$@"
exit $?
