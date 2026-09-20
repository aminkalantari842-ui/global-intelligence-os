#!/usr/bin/env bash
#
# Build the Global Intelligence OS frontend against your self-hosted backend and
# optionally publish the static bundle to the server that runs Caddy.
#
# Vite inlines VITE_CONVEX_URL at build time, so the value below is the only thing
# that decides which Convex deployment the browser talks to. Nothing in src/ changes.
#
# Usage
#   VITE_CONVEX_URL=https://api.example.com ./deploy-web.sh --build-only
#   VITE_CONVEX_URL=https://api.example.com DEPLOY_TARGET=root@1.2.3.4 ./deploy-web.sh --prune
#
# Environment
#   VITE_CONVEX_URL   required — public https URL of the self-hosted backend
#   DEPLOY_TARGET     optional — ssh target ("user@host" or "user@host:/srv/...")
#   APP_DIR           remote directory (default /srv/global-intelligence-os)
#   --prune           delete stale hashed bundles on the remote (rsync --delete)

set -euo pipefail

BUILD_ONLY=0
PRUNE=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --prune)      PRUNE=1 ;;
    -h|--help)    sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${APP_DIR:-/srv/global-intelligence-os}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -n "${VITE_CONVEX_URL:-}" ]] || fail "VITE_CONVEX_URL is not set (e.g. https://api.example.com)"
case "$VITE_CONVEX_URL" in
  https://*) ;;
  *) fail "VITE_CONVEX_URL must be https:// — an http backend is blocked as mixed content by the browser" ;;
esac

cd "$ROOT_DIR"
[[ -f package.json ]] || fail "package.json not found in $ROOT_DIR"

say "Building with VITE_CONVEX_URL=$VITE_CONVEX_URL"
if [[ -f bun.lock || -f bun.lockb ]]; then
  bun install --frozen-lockfile
else
  bun install
fi
VITE_CONVEX_URL="$VITE_CONVEX_URL" bun run build

[[ -d dist ]] || fail "the build produced no dist/ directory"
[[ -f dist/index.html ]] || fail "dist/index.html is missing — is this a Vite SPA build?"

# Prove the URL really got baked into the bundle: a wrong/original URL here is
# the single most common cause of a blank preview after self-hosting.
say "Verifying the backend URL is inlined in the bundle"
if grep -rlF "$VITE_CONVEX_URL" dist >/dev/null 2>&1; then
  grep -rlF "$VITE_CONVEX_URL" dist | head -3 | sed 's/^/  ✓ /'
else
  fail "the backend URL was not found in dist/ — the build did not pick up VITE_CONVEX_URL"
fi
printf '  bundle size: %s\n' "$(du -sh dist | cut -f1)"

if [[ "$BUILD_ONLY" == "1" ]]; then
  say "Build only. Bundle is in $ROOT_DIR/dist"
  exit 0
fi

[[ -n "${DEPLOY_TARGET:-}" ]] || fail "DEPLOY_TARGET is not set (e.g. root@1.2.3.4). Use --build-only to stop after the build."
remote_path="${DEPLOY_TARGET#*:}"
if [[ "$remote_path" == "$DEPLOY_TARGET" ]]; then
  remote_host="$DEPLOY_TARGET"
  remote_dir="$APP_DIR"
else
  remote_host="${DEPLOY_TARGET%%:*}"
  remote_dir="$remote_path"
fi
[[ -n "$remote_host" ]] || fail "DEPLOY_TARGET has no host part"

say "Publishing dist/ to $remote_host:$remote_dir"
ssh "$remote_host" "mkdir -p '$remote_dir'"
rsync_args=(-az --human-readable --info=stats1,progress2)
[[ "$PRUNE" == "1" ]] && rsync_args+=(--delete)
rsync "${rsync_args[@]}" dist/ "$remote_host:$remote_dir/"

say "Done"
cat <<EOF
The static bundle is live at $remote_dir (served by the app.example.com block in
the Caddyfile). Caddy needs no reload for static files — just open the domain and
hard-refresh if the old shell is cached.
EOF
