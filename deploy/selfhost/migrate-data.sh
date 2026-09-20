#!/usr/bin/env bash
#
# Move Global Intelligence OS data from Convex Cloud onto the self-hosted backend.
#
# Usage
#   ./migrate-data.sh inventory [snapshot] # local row counts from a snapshot file (no network)
#   ./migrate-data.sh export    [dir]      # Convex Cloud  -> ./convex-backup/*
#   ./migrate-data.sh import    [file]     # snapshot      -> self-hosted (needs FORCE=1)
#   ./migrate-data.sh import-tables [file] # same, table by table (skips leftover auth-* tables)
#   ./migrate-data.sh verify               # health-check + row counts on self-hosted
#   ./migrate-data.sh counts [--prod]      # live row counts (needs a deployment that runs queries)
#   ./migrate-data.sh reseed               # rebuild the corpus from code + RSS
#
# Environment
#   export   CONVEX_DEPLOY_KEY            prod deploy key of the cloud project
#   import   CONVEX_SELF_HOSTED_URL       https://api.example.com
#            CONVEX_SELF_HOSTED_ADMIN_KEY admin key from generate_admin_key.sh
#            FORCE=1                      acknowledge that --replace overwrites table data
#
# The script never touches your source files; it only drives the Convex CLI.
# Target selection is deliberately defensive: CONVEX_DEPLOY_KEY outranks every
# other selector in the Convex CLI, so all self-hosted modes unset it first —
# otherwise a snapshot import could land on the cloud deployment instead.

set -euo pipefail

MODE="${1:-}"
MODE_ARG="${2:-}"
BACKUP_DIR="${BACKUP_DIR:-./convex-backup}"
CONVEX_BIN="${CONVEX_BIN:-npx --yes convex}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

require_self_hosted() {
  [[ -n "${CONVEX_SELF_HOSTED_URL:-}" ]] || fail "CONVEX_SELF_HOSTED_URL is not set (e.g. https://api.example.com)"
  [[ -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]] || fail "CONVEX_SELF_HOSTED_ADMIN_KEY is not set (see generate_admin_key.sh)"
}

# Only a self-hosted deployment may be the target of a write.
target_self_hosted() {
  require_self_hosted
  unset CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT
}

auto_snapshot() {
  # Accept a file, a directory holding one, or nothing (default backup dir).
  local candidate="${1:-$BACKUP_DIR}"
  if [[ -f "$candidate" ]]; then printf '%s' "$candidate"; return; fi
  [[ -d "$candidate" ]] || return 0
  find "$candidate" -maxdepth 1 -type f \( -name '*.zip' -o -name 'convex-export*' -o -name '*snapshot*' \) -print -quit 2>/dev/null
}

# Tables this application actually reads. The cloud deployment still holds
# leftover auth-* tables from the removed authentication component, and a full
# snapshot import can choke on them — `import-tables` skips everything here.
APP_TABLES="thinkTanks publications articleContent relationEvents actors relationships
actorMentions changeLog actorSnapshots alerts translations authorPages aiArtifacts
dupCandidates users scenarios assessments claims articleRefs articleHighlights
networkMetrics tripwires sourceRegistry newsWires newsItems contentAlerts contentAlertRules
userWatchlists userNotes savedViews boardLayouts readingStates readingLists readingListItems
appSettings wargames"

# Row counts for the tables that must survive the move.
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

case "$MODE" in
  inventory)
    command -v unzip >/dev/null || fail "unzip is required for inventory"
    snapshot="$(auto_snapshot "$MODE_ARG")"
    [[ -n "$snapshot" ]] || fail "no snapshot found — pass a path: ./migrate-data.sh inventory <file>"
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT
    unzip -qq "$snapshot" -d "$tmp_dir" || fail "$snapshot is not a readable snapshot archive"
    say "Rows per table in $(basename "$snapshot")"
    for docs in "$tmp_dir"/*/documents.jsonl; do
      [[ -e "$docs" ]] || continue
      printf '%8s  %s\n' "$(awk 'END {print NR+0}' "$docs")" "$(basename "$(dirname "$docs")")"
    done | sort -rn
    ;;

  export)
    # Hide the self-hosted vars so the CLI targets the cloud project.
    unset CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
    [[ -n "${CONVEX_DEPLOY_KEY:-}" ]] || fail "CONVEX_DEPLOY_KEY is not set (Convex dashboard → Project Settings → Deploy Keys)"
    if [[ -n "$MODE_ARG" ]]; then BACKUP_DIR="$MODE_ARG"; fi
    mkdir -p "$BACKUP_DIR"
    stamp="$(date +%Y%m%d-%H%M%S)"
    say "Exporting the cloud deployment to $BACKUP_DIR"
    # A snapshot export is served by the dashboard backend, so it keeps working
    # even when function execution is blocked by a plan limit.
    if ! $CONVEX_BIN export --path "$BACKUP_DIR/cloud-snapshot-$stamp.zip"; then
      cat <<'EOF'

✗ Export failed. Two usual causes:
  • the cloud deployment is paused or deleted — restore it in the Convex dashboard
    (a snapshot export still works while function execution is blocked);
  • CONVEX_DEPLOY_KEY is missing or belongs to another project.

  If the cloud data is gone for good, rebuild the corpus from code instead:

      ./migrate-data.sh reseed

  That path re-creates the think-tank registry and re-fetches every RSS feed,
  but AI-derived artefacts (translations, briefs, claims) must be regenerated.
EOF
      exit 1
    fi
    ls -lh "$BACKUP_DIR"
    say "Inspect it offline, then import:"
    printf '  ./migrate-data.sh inventory "%s"\n' "$BACKUP_DIR/cloud-snapshot-$stamp.zip"
    printf '  FORCE=1 ./migrate-data.sh import "%s"\n' "$BACKUP_DIR/cloud-snapshot-$stamp.zip"
    ;;

  import)
    target_self_hosted
    snapshot="$(auto_snapshot "$MODE_ARG")"
    [[ -n "$snapshot" ]] || fail "no snapshot found — pass a path: ./migrate-data.sh import <file>"
    [[ "${FORCE:-}" == "1" ]] || fail "import replaces data in every table present in the snapshot.
  Target: $CONVEX_SELF_HOSTED_URL
  Check that this is your own server, then re-run with: FORCE=1 ./migrate-data.sh import $snapshot"
    import_args=(--replace -y)
    # Snapshot downloads have no extension, and the CLI refuses to guess.
    base="$(basename "$snapshot")"
    [[ "$base" == *.* ]] || import_args+=(--format zip)
    say "Importing $base into $CONVEX_SELF_HOSTED_URL"
    $CONVEX_BIN import "${import_args[@]}" "$snapshot"
    say "Verifying against the snapshot"
    $CONVEX_BIN run --inline-query "$COUNTS_QUERY"
    ;;

  import-tables)
    target_self_hosted
    snapshot="$(auto_snapshot "$MODE_ARG")"
    [[ -n "$snapshot" ]] || fail "no snapshot found — pass a path: ./migrate-data.sh import-tables <file>"
    [[ "${FORCE:-}" == "1" ]] || fail "import-tables replaces data table by table.
  Target: $CONVEX_SELF_HOSTED_URL
  Check that this is your own server, then re-run with: FORCE=1 ./migrate-data.sh import-tables $snapshot"
    command -v unzip >/dev/null || fail "unzip is required for import-tables"
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT
    unzip -qq "$snapshot" -d "$tmp_dir" || fail "$snapshot is not a readable snapshot archive"
    say "Importing $(basename "$snapshot") into $CONVEX_SELF_HOSTED_URL, table by table"
    for table in $APP_TABLES; do
      docs="$tmp_dir/$table/documents.jsonl"
      if [[ ! -s "$docs" ]]; then printf '  – %-18s empty, skipped\n' "$table"; continue; fi
      $CONVEX_BIN import --table "$table" --replace -y "$docs" >/dev/null
      printf '  \033[32m✓\033[0m %-18s %s rows\n' "$table" "$(awk 'END {print NR+0}' "$docs")"
    done
    say "Done. Leftover auth-* tables were intentionally not migrated."
    ;;

  verify)
    target_self_hosted
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
    if [[ "$MODE_ARG" == "--prod" ]]; then
      unset CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
      [[ -n "${CONVEX_DEPLOY_KEY:-}" ]] || fail "CONVEX_DEPLOY_KEY is not set (needed to read the cloud deployment)"
      say "Row counts on the cloud deployment"
      $CONVEX_BIN run --inline-query "$COUNTS_QUERY" --prod
    else
      target_self_hosted
      say "Row counts on $CONVEX_SELF_HOSTED_URL"
      $CONVEX_BIN run --inline-query "$COUNTS_QUERY"
    fi
    ;;

  reseed)
    # No-export fallback: the registry and corpus are reproducible from code.
    target_self_hosted
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
    sed -n '2,21p' "$0"
    exit 1
    ;;
esac
