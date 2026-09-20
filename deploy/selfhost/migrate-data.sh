#!/usr/bin/env bash
#
# Move Global Intelligence OS data from Convex Cloud onto the self-hosted backend.
#
# Usage
#   ./migrate-data.sh export [backupDir]   # Convex Cloud  -> ./convex-backup/*.zip
#   ./migrate-data.sh import [backupDir]   # ./convex-backup -> self-hosted
#   ./migrate-data.sh verify               # health-check + row counts (self-hosted)
#   ./migrate-data.sh counts [--prod]      # row counts (cloud with --prod, else self-hosted)
#   ./migrate-data.sh reseed               # rebuild the corpus from code + RSS
#
# Environment
#   export  CONVEX_DEPLOY_KEY            prod deploy key of the cloud project
#   import  CONVEX_SELF_HOSTED_URL       https://api.example.com
#           CONVEX_SELF_HOSTED_ADMIN_KEY admin key from generate_admin_key.sh
#
# The script never touches your source files; it only drives the Convex CLI.

set -euo pipefail

MODE="${1:-}"
BACKUP_DIR="${2:-./convex-backup}"
CONVEX_BIN="${CONVEX_BIN:-npx --yes convex}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Row counts for the tables that must survive the move. Run it on the cloud
# deployment before migrating and on the self-hosted one after, then compare.
COUNTS_QUERY='
const out = {
  thinkTanks: (await ctx.db.query("thinkTanks").collect()).length,
  publications: (await ctx.db.query("publications").collect()).length,
  articleContent: (await ctx.db.query("articleContent").collect()).length,
  relationEvents: (await ctx.db.query("relationEvents").collect()).length,
  actors: (await ctx.db.query("actors").collect()).length,
  actorMentions: (await ctx.db.query("actorMentions").collect()).length,
  authorPages: (await ctx.db.query("authorPages").collect()).length,
  translations: (await ctx.db.query("translations").collect()).length,
  appSettings: (await ctx.db.query("appSettings").collect()).length,
};
return out;
'

require_self_hosted() {
  [[ -n "${CONVEX_SELF_HOSTED_URL:-}" ]] || fail "CONVEX_SELF_HOSTED_URL is not set (e.g. https://api.example.com)"
  [[ -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]] || fail "CONVEX_SELF_HOSTED_ADMIN_KEY is not set (see generate_admin_key.sh)"
}

case "$MODE" in
  export)
    # The self-hosted vars must be hidden here so the CLI targets the cloud
    # project rather than your own server.
    unset CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
    [[ -n "${CONVEX_DEPLOY_KEY:-}" ]] || fail "CONVEX_DEPLOY_KEY is not set (Convex dashboard → Project Settings → Deploy Keys)"
    mkdir -p "$BACKUP_DIR"
    say "Exporting the cloud deployment to $BACKUP_DIR"
    if ! $CONVEX_BIN export --prod --path "$BACKUP_DIR"; then
      cat <<'EOF'

✗ Export failed. The usual cause is that the cloud deployment is paused or
  disabled (e.g. a blocked free-plan deployment). Data can only be read while
  the deployment is live, so either restore/upgrade the plan and retry, or
  rebuild the corpus from code with:

      ./migrate-data.sh reseed

  That path re-creates the think-tank registry and re-fetches every RSS feed,
  but AI-derived artefacts (translations, briefs, claims) must be regenerated.
EOF
      exit 1
    fi
    ls -lh "$BACKUP_DIR"
    say "Next: run './migrate-data.sh import $BACKUP_DIR' with the self-hosted vars set."
    ;;

  import)
    require_self_hosted
    zip_file="$(find "$BACKUP_DIR" -maxdepth 1 -name '*.zip' -print -quit 2>/dev/null || true)"
    [[ -n "$zip_file" ]] || fail "No .zip found in $BACKUP_DIR — run './migrate-data.sh export' first"
    say "Importing $(basename "$zip_file") into $CONVEX_SELF_HOSTED_URL"
    $CONVEX_BIN import --replace "$zip_file"
    say "Verifying"
    $CONVEX_BIN data thinkTanks --limit 3
    say "Done. Documents keep their _id/_creationTime, so cross-table references stay intact."
    ;;

  verify)
    require_self_hosted
    say "Backend version"
    curl -fsS "${CONVEX_SELF_HOSTED_URL%/}/version" || fail "Backend is not reachable at $CONVEX_SELF_HOSTED_URL"
    printf '\n'
    say "Row counts on the self-hosted deployment"
    $CONVEX_BIN run --inline-query "$COUNTS_QUERY"
    say "Think-tank registry sample"
    $CONVEX_BIN data thinkTanks --limit 3
    say "Newest publications sample"
    $CONVEX_BIN data publications --limit 3
    ;;

  counts)
    # Compare cloud vs self-hosted: run with --prod before the move, without it after.
    if [[ "${2:-}" == "--prod" ]]; then
      unset CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
      [[ -n "${CONVEX_DEPLOY_KEY:-}" ]] || fail "CONVEX_DEPLOY_KEY is not set (needed to read the cloud deployment)"
      say "Row counts on the cloud deployment"
      $CONVEX_BIN run --inline-query "$COUNTS_QUERY" --prod
    else
      require_self_hosted
      say "Row counts on $CONVEX_SELF_HOSTED_URL"
      $CONVEX_BIN run --inline-query "$COUNTS_QUERY"
    fi
    ;;

  reseed)
    # No-export fallback: the registry and corpus are reproducible from code.
    require_self_hosted
    say "1/4 Sync think-tank registry"
    $CONVEX_BIN run thinkTankSeed:syncRegistry
    say "2/4 Fetch RSS feeds"
    $CONVEX_BIN run rssIngest:refreshFeeds
    say "3/4 Build author & program pages"
    $CONVEX_BIN run enrichment:buildAuthorIndex
    say "4/4 Evaluate alert rules"
    $CONVEX_BIN run alerts:evaluate
    say "Reseeded. Full texts, translations and AI briefs refill on the cron schedule"
    say "(or immediately by opening an article in the reader)."
    ;;

  *)
    sed -n '2,17p' "$0"
    exit 1
    ;;
esac
