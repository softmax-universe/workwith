#!/bin/bash
# Started (and kept alive) by launchd, as ~/.codinger/run.sh <checkout>: the job
# deploy/mac/install.sh writes. The settings (CODINGER_*, PORT) come from ~/.codinger/desk.env.
# With CODINGER_SUPERVISED=1 a restart only stops the server, and launchd starts this again.
# Without it, Codinger restarts by starting a new, detached server and exiting (server/index.ts,
# restart()), whose command line names server/index.ts from the start, while it builds. So
# wait while any server of this checkout is up, then build and take over.
# A second desk on the same Mac (install.sh with NAME=) sets CODINGER_HOME in its launchd job.
set -u
W=${1:?the checkout}
cd "$W" || exit 1
D=${CODINGER_HOME:-$HOME/.codinger}
if [ -f "$D/desk.env" ]; then set -a; . "$D/desk.env"; set +a; fi
sleep 2
while pgrep -qf "$W/server/index.ts"; do sleep 5; done
npx vite build >> "$D/server.log" 2>&1 || echo "vite build failed; serving the last build" >&2
exec node "$W/server/index.ts"
