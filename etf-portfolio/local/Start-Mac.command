#!/bin/bash
# ETF Portfolio - local test version for Mac.
# Double-click to start (first time: right-click > Open). Close the Terminal window to stop.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 local-server.py
fi
echo "Python 3 is needed. Install it from https://www.python.org/downloads/ and double-click this file again."
read -r -p "Press Enter to close."
