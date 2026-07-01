#!/usr/bin/env bash
#
# Maker uninstaller for the macOS app (.dmg install). Double-click to run
# (Finder opens it in Terminal), or: bash scripts/uninstall.command [--yes]
#
# COMPLETE cleanup — removes the app AND all Maker data (models, tools, memory)
# AND the tiny macOS per-app leftovers. Does NOT touch Node or Ollama.
# Env: MAKER_HOME (default ~/.maker), MAKER_APP (default /Applications/Maker.app),
#      DRY_RUN=1 to preview without deleting.
#
set -euo pipefail

BUNDLE_ID="com.equalinformation.maker"
MAKER_HOME="${MAKER_HOME:-$HOME/.maker}"
APP="${MAKER_APP:-/Applications/Maker.app}"
[ -d "$APP" ] || APP="$HOME/Applications/Maker.app"
DRY="${DRY_RUN:-}"

echo "Maker uninstaller (macOS app) — complete cleanup"
echo

# Quit Maker if it's running (ignore errors).
osascript -e 'quit app "Maker"' >/dev/null 2>&1 || true

TARGETS=(
  "$APP"
  "$MAKER_HOME"
  "$HOME/Library/Caches/$BUNDLE_ID"
  "$HOME/Library/Preferences/$BUNDLE_ID.plist"
  "$HOME/Library/Application Support/$BUNDLE_ID"
  "$HOME/Library/WebKit/$BUNDLE_ID"
  "$HOME/Library/HTTPStorages/$BUNDLE_ID"
  "$HOME/Library/Saved Application State/$BUNDLE_ID.savedState"
)

FOUND=0
echo "This will remove:"
for t in "${TARGETS[@]}"; do
  if [ -e "$t" ]; then
    FOUND=1
    SZ="$(du -sh "$t" 2>/dev/null | cut -f1 || echo '?')"
    echo "  • $t   ($SZ)"
  fi
done
[ "$FOUND" -eq 0 ] && { echo "  (nothing found — Maker isn't installed here)"; exit 0; }
echo

if [ "${1:-}" != "--yes" ] && [ "${1:-}" != "-y" ]; then
  printf "Proceed? [y/N] "
  read -r ans
  case "$ans" in y|Y|yes|YES) : ;; *) echo "Cancelled — nothing removed."; exit 0 ;; esac
fi

for t in "${TARGETS[@]}"; do
  [ -e "$t" ] || continue
  if [ -n "$DRY" ]; then
    echo "[dry-run] would remove: $t"
  else
    rm -rf "$t" && echo "✓ removed: $t"
  fi
done

echo
echo "Maker is fully removed."
echo "Also delete the downloaded installer from ~/Downloads (Maker*.dmg)."
echo "(Node and Ollama, if you installed them, are untouched.)"
