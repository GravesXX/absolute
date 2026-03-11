#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/plugin"

echo "[Absolute] Installing dependencies..."
cd "$PLUGIN_DIR" && npm install

echo "[Absolute] Verifying build..."
npx tsc --noEmit

echo "[Absolute] Running tests..."
npx vitest run

echo ""
echo "[Absolute] Installation complete."
echo ""
echo "To add Absolute to OpenClaw, add to ~/.openclaw/openclaw.json:"
echo "  agents.list: { \"absolute\": { \"name\": \"Absolute\", \"plugin\": \"$PLUGIN_DIR/src/index.ts\" } }"
echo "  workspaces: { \"absolute\": \"$SCRIPT_DIR/workspace\" }"
