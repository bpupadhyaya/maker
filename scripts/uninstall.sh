#!/usr/bin/env bash
#
# Maker uninstaller — macOS / Linux. COMPLETE cleanup.
# Removes the `maker` launcher and ALL of Maker's app data (downloaded models,
# built tools, memory) under MAKER_HOME. Does NOT touch Node or Ollama (you
# installed those). The source repo is left in place; the script prints how to
# delete it too.
#
# Usage:   bash scripts/uninstall.sh [--yes]
# Env:     MAKER_BIN_DIR (default ~/.local/bin), MAKER_HOME (default ~/.maker)
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${MAKER_BIN_DIR:-$HOME/.local/bin}"
MAKER_HOME="${MAKER_HOME:-$HOME/.maker}"
LAUNCHER="$BIN_DIR/maker"

echo "Maker uninstaller — this removes:"
echo "  • launcher:  $LAUNCHER"
echo "  • app data:  $MAKER_HOME  (models, tools, memory)"
if [ -d "$MAKER_HOME" ]; then
  SIZE="$(du -sh "$MAKER_HOME" 2>/dev/null | cut -f1 || echo '?')"
  echo "    ($SIZE will be freed)"
fi
echo

if [ "${1:-}" != "--yes" ] && [ "${1:-}" != "-y" ]; then
  printf "Proceed? [y/N] "
  read -r ans
  case "$ans" in
    y|Y|yes|YES) : ;;
    *) echo "Cancelled — nothing removed."; exit 0 ;;
  esac
fi

if [ -f "$LAUNCHER" ]; then
  rm -f "$LAUNCHER"
  echo "✓ Removed launcher"
else
  echo "• No launcher at $LAUNCHER"
fi

if [ -d "$MAKER_HOME" ]; then
  rm -rf "$MAKER_HOME"
  echo "✓ Removed all app data ($MAKER_HOME)"
else
  echo "• No app data at $MAKER_HOME"
fi

echo
echo "Maker is fully uninstalled."
echo "The source repo is still here:  $REPO_DIR"
echo "Delete it too if you like:      rm -rf \"$REPO_DIR\""
echo "(Node and Ollama, if installed, are untouched.)"
