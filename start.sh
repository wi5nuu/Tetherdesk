#!/usr/bin/env bash
# TetherDesk — one-click starter for macOS / Linux
# Usage: bash start.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  TetherDesk"
echo "  --------------------------------------"
echo ""

# ── 1. Locate cloudflared ─────────────────────────────────────────────────────
CLOUDFLARED=""
if [[ -x "$ROOT/apps/web/cloudflared" ]]; then
  CLOUDFLARED="$ROOT/apps/web/cloudflared"
elif command -v cloudflared &>/dev/null; then
  CLOUDFLARED="$(command -v cloudflared)"
else
  echo "  [ERROR] cloudflared not found." >&2
  echo "  Place the cloudflared binary at apps/web/cloudflared" >&2
  echo "  Download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

echo "  [1/3] Starting Cloudflare tunnel..."

# Start cloudflared in the background; capture both stdout+stderr for URL parsing.
TUNNEL_LOG="$(mktemp)"
"$CLOUDFLARED" tunnel --url http://localhost:3000 >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# ── 2. Wait for tunnel URL (max 30s) ─────────────────────────────────────────
TUNNEL_URL=""
DEADLINE=$(( $(date +%s) + 30 ))
while [[ -z "$TUNNEL_URL" && $(date +%s) -lt $DEADLINE ]]; do
  sleep 0.5
  # Modern form: url=https://...trycloudflare.com
  if grep -qE "url=https://[^ ]+\.trycloudflare\.com" "$TUNNEL_LOG" 2>/dev/null; then
    TUNNEL_URL="$(grep -oE "url=https://[^ ]+\.trycloudflare\.com" "$TUNNEL_LOG" | head -1 | sed 's/url=//')"
  # Legacy box form
  elif grep -qE "https://[^ ]+\.trycloudflare\.com" "$TUNNEL_LOG" 2>/dev/null; then
    TUNNEL_URL="$(grep -oE "https://[^ ]+\.trycloudflare\.com" "$TUNNEL_LOG" | head -1)"
  fi
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "  [ERROR] Timed out waiting for cloudflared tunnel URL (30s)." >&2
  kill "$TUNNEL_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
  exit 1
fi

echo "  Tunnel URL: $TUNNEL_URL"

# ── 3. Write agent config (BOM-free UTF-8) ────────────────────────────────────
CONFIG_DIR="$HOME/.tetherdesk"
mkdir -p "$CONFIG_DIR"
printf '{"backendOrigin":"%s"}' "$TUNNEL_URL" > "$CONFIG_DIR/config.json"
echo "  Config written to $CONFIG_DIR/config.json"

# ── 4. Free port 3000 if occupied ────────────────────────────────────────────
if lsof -ti:3000 &>/dev/null; then
  PORT_PID="$(lsof -ti:3000)"
  echo "  Port 3000 in use by PID $PORT_PID — stopping..."
  kill "$PORT_PID" 2>/dev/null || true
  sleep 0.5
fi

# ── 5. Start Next.js backend in a new terminal tab / background ──────────────
echo ""
echo "  [2/3] Starting backend (Next.js)..."
BACKEND_LOG="$(mktemp)"
(cd "$ROOT" && pnpm --filter @tetherdesk/web dev >"$BACKEND_LOG" 2>&1) &
BACKEND_PID=$!

echo "  Waiting for backend to be ready (8s)..."
sleep 8

# ── 6. Start agent ────────────────────────────────────────────────────────────
echo "  [3/3] Starting agent..."
(cd "$ROOT" && pnpm --filter @tetherdesk/agent dev) &
AGENT_PID=$!

echo ""
echo "  TetherDesk is running!"
echo ""
echo "  Dashboard : $TUNNEL_URL"
echo "  How to use:"
echo "    1. Open $TUNNEL_URL in your browser"
echo "    2. Scan the QR code with your phone"
echo "    3. Tap Allow on this laptop to approve the connection"
echo ""
echo "  Press Ctrl+C to stop all processes."

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "  Stopping all processes..."
  kill "$TUNNEL_PID" "$BACKEND_PID" "$AGENT_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG" "$BACKEND_LOG"
  echo "  Done."
}
trap cleanup EXIT INT TERM

# Wait for agent (foreground process)
wait "$AGENT_PID" 2>/dev/null || true
