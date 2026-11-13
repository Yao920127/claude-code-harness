#!/usr/bin/env bash
# Build the unsigned Apple silicon disk image of Claude Code Harness and install
# the app into /Applications (or --dest). Run from the repository root:
#
#   ./install-macos-arm64.sh [--skip-build] [--dmg PATH] [--dest DIR] [--no-launch]
#
#   --skip-build  install the newest DMG already in apps/desktop/release/mac-arm64/
#   --dmg PATH    install this DMG instead of building one
#   --dest DIR    install directory (default /Applications)
#   --no-launch   do not open the app after installing
#
# DSH_DESKTOP_APP_ID overrides the bundle identifier the build stamps; keep it
# stable so the installed app keeps its settings and single-instance lock.
set -euo pipefail

readonly PRODUCT_NAME='Claude Code Harness'
readonly DEFAULT_APP_ID='com.yao920127.claude-code-harness'
readonly MIN_NODE_22_MINOR=19

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$REPO_ROOT/apps/desktop/release/mac-arm64"

skip_build=0
mount_point=''
use_sudo=0
dmg=''
dest='/Applications'
launch=1

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
# Run a command with sudo only when the install directory is not writable.
privileged() { if (( use_sudo )); then sudo "$@"; else "$@"; fi; }
app_running() { pgrep -f "/$PRODUCT_NAME.app/Contents/MacOS/" >/dev/null 2>&1; }
cleanup() {
  [[ -n "$mount_point" ]] || return 0
  hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
  rmdir "$mount_point" 2>/dev/null || true
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) skip_build=1 ;;
    --dmg) [[ $# -ge 2 ]] || fail '--dmg needs a path'; dmg="$2"; shift ;;
    --dest) [[ $# -ge 2 ]] || fail '--dest needs a directory'; dest="$2"; shift ;;
    --no-launch) launch=0 ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "unknown option: $1 (see --help)" ;;
  esac
  shift
done

check_platform() {
  [[ "$(uname -s)" == 'Darwin' ]] || fail 'this script supports macOS only'
  [[ "$(uname -m)" == 'arm64' ]] || fail 'this script supports Apple silicon (arm64) only'
}

check_toolchain() {
  xcode-select -p >/dev/null 2>&1 || fail 'Xcode Command Line Tools are missing; run: xcode-select --install'
  command -v node >/dev/null 2>&1 || fail 'Node.js is missing; install Node 24 or newer (or 22.19+)'
  local major minor
  IFS=. read -r major minor _ <<<"$(node -p 'process.versions.node')"
  if (( major < 22 || (major == 22 && minor < MIN_NODE_22_MINOR) || major == 23 )); then
    fail "Node $(node -v) is not supported; use ^22.19 or >=24"
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    log 'Enabling pnpm through Corepack'
    corepack enable pnpm || fail 'pnpm is missing and Corepack could not enable it'
  fi
}

build_dmg() {
  log 'Installing workspace dependencies'
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile)
  log 'Building the workspace'
  (cd "$REPO_ROOT" && pnpm run build)
  log 'Packaging the unsigned Apple silicon disk image (this takes several minutes)'
  (cd "$REPO_ROOT" && DSH_DESKTOP_APP_ID="${DSH_DESKTOP_APP_ID:-$DEFAULT_APP_ID}" \
    pnpm run package:desktop:mac:arm64:unsigned)
}

newest_dmg() {
  local newest
  newest="$(ls -t "$RELEASE_DIR"/*-mac-arm64-unsigned.dmg 2>/dev/null | head -n 1 || true)"
  [[ -n "$newest" ]] || fail "no DMG in $RELEASE_DIR; run without --skip-build first"
  printf '%s\n' "$newest"
}

quit_running_app() {
  if app_running; then
    log "Quitting the running $PRODUCT_NAME"
    osascript -e "tell application \"$PRODUCT_NAME\" to quit" >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
      app_running || return 0
      sleep 0.5
    done
    fail "$PRODUCT_NAME is still running; quit it and run the script again"
  fi
}

install_app() {
  local image="$1" app target
  mount_point="$(mktemp -d "${TMPDIR:-/tmp}/cch-dmg.XXXXXX")"
  log "Mounting $(basename "$image")"
  hdiutil attach "$image" -nobrowse -readonly -noautoopen -mountpoint "$mount_point" -quiet
  app="$mount_point/$PRODUCT_NAME.app"
  [[ -d "$app" ]] || fail "the disk image holds no $PRODUCT_NAME.app"

  mkdir -p "$dest" 2>/dev/null || true
  [[ -w "$dest" ]] || use_sudo=1
  target="$dest/$PRODUCT_NAME.app"
  quit_running_app
  log "Installing to $target"
  privileged rm -rf "$target"
  privileged ditto "$app" "$target"
  # A locally built image carries no quarantine flag, but a copied one may; /usr/bin/xattr avoids
  # a Homebrew xattr whose Python interpreter may be gone.
  privileged /usr/bin/xattr -dr com.apple.quarantine "$target" 2>/dev/null || true
  /usr/bin/codesign --verify --deep "$target" || fail 'the installed app failed its signature check'
}

main() {
  check_platform
  if [[ -z "$dmg" ]]; then
    check_toolchain
    (( skip_build )) || build_dmg
    dmg="$(newest_dmg)"
  fi
  [[ -f "$dmg" ]] || fail "DMG not found: $dmg"
  install_app "$dmg"
  log "Installed $PRODUCT_NAME from $dmg"
  log "The disk image stays in $(dirname "$dmg")"
  (( launch )) && open "$dest/$PRODUCT_NAME.app"
  return 0
}

main
