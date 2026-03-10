#!/usr/bin/env bash
# CrownClaw startup script
# Usage:  ./start.sh [port]          (default port: 8000)

set -e
cd "$(dirname "$0")"

PORT=${1:-8000}

# Load .env if present, so developers don't need to export vars manually.
if [ -f .env ]; then
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
    echo "[crownland] Loaded .env"
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "  ⚠️  ANTHROPIC_API_KEY is not set."
    echo "  Copy .env.example → .env and add your key:"
    echo "    cp .env.example .env"
    echo "  Then edit .env and restart."
    echo ""
    echo "  The app will start but AI chat will not work until the key is set."
    echo ""
fi

echo "[crownland] Starting on http://0.0.0.0:$PORT"
exec uvicorn app:app --host 0.0.0.0 --port "$PORT" --reload
