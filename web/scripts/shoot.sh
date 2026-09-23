#!/bin/bash
# OWNER: T0 (wave 0). FROZEN once T0 merges.
#
# Look at your work: start `next dev` for THIS worktree, screenshot routes, stop the server.
#
#   bash scripts/shoot.sh --port <p> --out <dir> --route <path> [--route <path>...]
#        [--width 375,768,1280,1440] [--height 900] [--settle <ms>] [--timeline <ms,ms,...>]
#        [--press <key>]... [--reduced-motion] [--full] [--contrast high] [--lenient]
#
# Writes <out>/<route-slug>@<width>.png (+ -full.png, -t<ms>.png, -press.png, -press-t<ms>.png)
# and <out>/report.json. See scripts/shoot.mjs --help for every option.
#
# Guarantees
#   - Holds one machine-wide `browser` slot (scripts/slot.sh) for the whole run.
#   - Refuses a port that is already in use (next dev would silently move to the next one).
#   - The dev server runs in its own process group and never outlives this command: it is
#     stopped on normal exit, on error and on INT/TERM, and a watchdog inside the group
#     stops it if this script is killed outright (SIGKILL cannot be trapped).
#   - Works from any worktree: paths are resolved from this file, --out from your cwd.
# Exit status is shoot.mjs's: non-zero on a navigation failure, a page answering >= 400,
# page or console errors, a sub-resource answering >= 400, or horizontal overflow
# (unless --lenient). Network-level request failures are reported but do not fail it.
# Port busy / bad arguments: exit 2. Dev server never answered: exit 1 with its log tail.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$(cd "$here/.." && pwd)"

# 1. Take a browser slot, then re-enter this script inside it.
if [ "${PRGUARD_SHOOT_IN_SLOT:-}" != "1" ]; then
  export PRGUARD_SHOOT_IN_SLOT=1
  exec bash "$here/slot.sh" browser bash "$here/shoot.sh" "$@"
fi

port=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--port" ]; then port="$arg"; fi
  if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then exec node "$here/shoot.mjs" --help; fi
  prev="$arg"
done
case "$port" in
  ''|*[!0-9]*) echo "shoot.sh: --port <number> is required" >&2; exit 2 ;;
esac

port_busy() { nc -z localhost "$1" >/dev/null 2>&1 || nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }
if port_busy "$port"; then
  echo "shoot.sh: port $port is already in use — pick your track's own port or stop that server" >&2
  exit 2
fi

log="${TMPDIR:-/tmp}/prguard-shoot-$port.log"
export NEXT_TELEMETRY_DISABLED=1
SHOOT_PID=$$

# 2. Start next dev in its own process group (job control gives the background job one).
#    The group leader is a watchdog — a separate `sh -c` program, so it has its own argv
#    (a `pkill -f shoot.sh` cannot take it down with this script) and its $$ is the
#    group id. It outlives the first TERM (a *caught* TERM: an ignored one would be
#    inherited by next dev) and, once this script or the dev server is gone, stops the
#    whole group: TERM, then KILL for anything still alive after 5s.
set -m
sh -c '
  trap "true" TERM
  cd "$1" || exit 1
  npx next dev -p "$2" &
  dev=$!
  while kill -0 "$3" 2>/dev/null && kill -0 "$dev" 2>/dev/null; do sleep 1; done
  kill -TERM -- "-$$" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -g "$$" node >/dev/null 2>&1 || exit 0
    sleep 0.5
  done
  kill -KILL -- "-$$" 2>/dev/null
' prguard-dev-watchdog "$web" "$port" "$SHOOT_PID" >"$log" 2>&1 &
group=$!
set +m

stop() {
  kill -TERM -- "-$group" 2>/dev/null || return 0
  for _ in $(seq 1 40); do
    kill -0 -- "-$group" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -KILL -- "-$group" 2>/dev/null
  return 0
}
trap stop EXIT
trap 'exit 130' INT TERM

# 3. Wait (≤ 180s) for the port to answer HTTP.
deadline=$((SECONDS + 180))
until [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "http://localhost:$port/favicon.ico" 2>/dev/null)" != "000" ]; do
  if ! kill -0 -- "-$group" 2>/dev/null; then
    echo "shoot.sh: next dev exited before answering; last lines of $log:" >&2
    tail -n 40 "$log" >&2
    exit 1
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "shoot.sh: next dev did not answer on :$port within 180s; last lines of $log:" >&2
    tail -n 40 "$log" >&2
    exit 1
  fi
  sleep 1
done

# 4. Shoot. Run in the background and `wait`, so a TERM/INT reaches the trap at once
#    (bash defers traps while a foreground child runs); the EXIT trap then stops the server.
node "$here/shoot.mjs" "$@" &
shooter=$!
trap 'kill -TERM "$shooter" 2>/dev/null; exit 130' INT TERM
wait "$shooter"
exit $?
