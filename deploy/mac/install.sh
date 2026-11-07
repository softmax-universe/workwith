#!/bin/bash
# Codinger on a Mac on your tailnet (a Mac mini at home, say), from a laptop with SSH to it.
# Safe to re-run. See deploy/mac/README.md.
#   deploy/mac/install.sh <ssh host> [people, e.g. "ada@example.com=Ada,grace@example.com=Grace"]
# Optional: PORT (4545), DIR (the Mac's checkout, relative to its home; dev/workwith),
# REPO (what the Mac clones; this checkout's origin).
# A second desk on the same Mac: NAME=hyperdesk PORT=4546 SERVE=8446 deploy/mac/install.sh mini
# gives it its own data (~/.hyperdesk, as CODINGER_HOME), checkout (~/services/hyperdesk),
# launchd job (app.codinger.hyperdesk), name (Hyperdesk) and URL (https://mini.<tailnet>.ts.net:8446).
set -euo pipefail
H=${1:?ssh host}; PEOPLE=${2:-}
HERE="$(cd "$(dirname "$0")" && pwd)"; W="$(cd "$HERE/../.." && pwd)"
NAME=${NAME:-}; PORT=${PORT:-4545}; SERVE=${SERVE:-443}
REPO=${REPO:-$(git -C "$W" remote get-url origin)}
if [ -n "$NAME" ]; then
  [ "$SERVE" != 443 ] || { echo "a second desk needs its own SERVE port (SERVE=8446, say)"; exit 1; }
  LABEL=app.codinger.$NAME; DATA=.$NAME; DIR=${DIR:-services/$NAME}; REMOTE_NAME=$NAME
  AGENT_NAME="$(printf %s "${NAME:0:1}" | tr '[:lower:]' '[:upper:]')${NAME:1}"
else
  LABEL=app.codinger.desk; DATA=.codinger; DIR=${DIR:-dev/workwith}; REMOTE_NAME=$H; AGENT_NAME=
fi

# The checkout, built once; later code comes by git push (post-receive) or the updater.
ssh "$H" "DIR='$DIR' REPO='$REPO' DATA='$DATA' zsh -l -s" <<'REMOTE'
set -e
for c in git node npm claude tailscale; do command -v $c >/dev/null || { echo "the Mac has no $c (brew install node tailscale; claude.ai/download)"; exit 1; }; done
[ -d ~/"$DIR"/.git ] || { mkdir -p ~/"$(dirname "$DIR")"; git clone -q "$REPO" ~/"$DIR"; }
cd ~/"$DIR"
[ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error
git config receive.denyCurrentBranch updateInstead
# post-receive reads the desk's PORT from here.
git config codinger.home ~/"$DATA"
mkdir -p ~/"$DATA" ~/Library/LaunchAgents
REMOTE
scp -q "$HERE/run.sh" "$H:$DATA/run.sh"
scp -q "$HERE/post-receive" "$H:$DIR/.git/hooks/post-receive"

# The settings, the launchd job and the tailnet URL.
ssh "$H" "DIR='$DIR' PORT='$PORT' SERVE='$SERVE' PEOPLE='$PEOPLE' LABEL='$LABEL' DATA='$DATA' AGENT_NAME='$AGENT_NAME' zsh -l -s" <<'REMOTE'
set -e
chmod +x ~/"$DATA"/run.sh ~/"$DIR"/.git/hooks/post-receive
name=$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')
host=$name; [ "$SERVE" = 443 ] || host=$name:$SERVE
env=~/"$DATA"/desk.env
if [ ! -f "$env" ]; then
  # tailscale serve names the person in Tailscale-User-Login, and strips one the browser sends.
  cat > "$env" <<EOF
PORT=$PORT
# launchd starts the next server when Codinger restarts (run.sh builds the page first).
CODINGER_SUPERVISED=1
CODINGER_USER_HEADER=Tailscale-User-Login
CODINGER_HOSTS=$host
CODINGER_PEOPLE='$PEOPLE'
# A named desk: CODINGER_AGENT_NAME, CODINGER_AGENT_AVATAR, ... (server/agent.ts)
EOF
  [ -z "$AGENT_NAME" ] || echo "CODINGER_AGENT_NAME=$AGENT_NAME" >> "$env"
  echo "wrote $env"
else
  echo "kept $env"
fi
p=~/Library/LaunchAgents/$LABEL.plist
cat > "$p" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$HOME/$DATA/run.sh</string><string>$HOME/$DIR</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>CODINGER_HOME</key><string>$HOME/$DATA</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/$DATA/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/$DATA/launchd.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# A restart under the old job leaves its server running; run.sh waits for it, so stop it.
pkill -f "$HOME/$DIR/server/index.ts" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$p"
# The first time, this waits for Serve to be turned on for the tailnet (it prints the link).
tailscale serve --bg --https="$SERVE" "$PORT" > ~/"$DATA"/serve.log 2>&1 &
sleep 5; cat ~/"$DATA"/serve.log
echo "https://$host"
REMOTE

# This checkout pushes to the Mac as a remote named for the host (or the desk).
git -C "$W" remote get-url "$REMOTE_NAME" >/dev/null 2>&1 || git -C "$W" remote add "$REMOTE_NAME" "$H:$DIR"
echo "push with: git push $REMOTE_NAME main"
