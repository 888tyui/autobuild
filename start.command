#!/usr/bin/env bash
# autobuild — one-click launcher for macOS / Linux
# Mirrors start.bat. macOS users can double-click this file in Finder.

set -e
cd "$(dirname "$0")"

echo
echo "  ============================================================"
echo "   autobuild  -  starting orchestrator + dashboard"
echo "  ============================================================"
echo "   orchestrator: http://localhost:4001"
echo "   dashboard:    http://localhost:4000"
echo
echo "   Ctrl+C to stop both processes."
echo "  ============================================================"
echo

if [ ! -d "node_modules/concurrently" ]; then
  echo "  [setup] installing root dependencies..."
  npm install
fi
if [ ! -d "dashboard/node_modules/next" ]; then
  echo "  [setup] installing dashboard dependencies..."
  npm --prefix dashboard install
fi

# Open the dashboard after a short delay (best-effort, OS-dependent).
( sleep 6 && (open http://localhost:4000 2>/dev/null || xdg-open http://localhost:4000 2>/dev/null || true) ) &

npm start
