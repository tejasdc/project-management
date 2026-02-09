#!/usr/bin/env bash
# reset-prod-data.sh — Safely reset production data via direct psql connection
#
# Usage:
#   ./reset-prod-data.sh <DATABASE_URL> [--dry-run] [--backup <file>]
#
# Modes:
#   --dry-run   Show row counts only, change nothing (DEFAULT if no flags given)
#   --backup    Export all data to a pg_dump file before truncating
#   (no flags)  Dry-run mode (safe default)
#
# Examples:
#   ./reset-prod-data.sh "$DATABASE_URL"                         # dry-run
#   ./reset-prod-data.sh "$DATABASE_URL" --dry-run               # explicit dry-run
#   ./reset-prod-data.sh "$DATABASE_URL" --backup backup.sql     # backup then truncate
#   CONFIRM_RESET=yes ./reset-prod-data.sh "$DATABASE_URL"       # truncate without backup

set -euo pipefail

# ── Args ──
DB_URL="${1:?Usage: reset-prod-data.sh <DATABASE_URL> [--dry-run] [--backup <file>]}"
DRY_RUN=true
BACKUP_FILE=""

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --backup) BACKUP_FILE="${2:?--backup requires a filename}"; DRY_RUN=false; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# FK-safe truncation order (leaf tables first)
TABLES=(
  review_queue
  entity_events
  entity_sources
  entity_relationships
  entity_tags
  entities
  epics
  raw_notes
  tags
  projects
)

PRESERVED=(users api_keys)

# ── Dry Run: Show current row counts ──
echo "=== PM Agent Data Reset ==="
echo ""
echo "Tables to reset:"
for table in "${TABLES[@]}"; do
  count=$(psql "$DB_URL" -t -A -c "SELECT count(*) FROM $table" 2>/dev/null || echo "ERROR")
  printf "  %-25s %s rows\n" "$table" "$count"
done
echo ""
echo "Preserved tables:"
for table in "${PRESERVED[@]}"; do
  count=$(psql "$DB_URL" -t -A -c "SELECT count(*) FROM $table" 2>/dev/null || echo "ERROR")
  printf "  %-25s %s rows\n" "$table" "$count"
done
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] No changes made. Use --backup <file> to proceed with reset."
  exit 0
fi

# ── Backup (if requested) ──
if [ -n "$BACKUP_FILE" ]; then
  mkdir -p "$(dirname "$BACKUP_FILE")"
  echo "Backing up data tables to: $BACKUP_FILE"
  pg_dump "$DB_URL" \
    --data-only \
    --no-owner \
    --no-privileges \
    $(printf -- '--table=%s ' "${TABLES[@]}") \
    > "$BACKUP_FILE"
  echo "Backup complete: $(wc -c < "$BACKUP_FILE") bytes"
  echo ""
fi

# ── Confirmation ──
if [ "${CONFIRM_RESET:-}" != "yes" ]; then
  echo "WARNING: This will permanently delete all data from the tables above."
  echo ""
  read -r -p "Type 'yes' to confirm: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# ── Truncate ──
echo ""
echo "Truncating tables..."
for table in "${TABLES[@]}"; do
  psql "$DB_URL" -c "TRUNCATE TABLE $table CASCADE;" 2>/dev/null
  printf "  %-25s truncated\n" "$table"
done

# ── Verify ──
echo ""
echo "Verification:"
for table in "${TABLES[@]}" "${PRESERVED[@]}"; do
  count=$(psql "$DB_URL" -t -A -c "SELECT count(*) FROM $table" 2>/dev/null || echo "ERROR")
  printf "  %-25s %s rows\n" "$table" "$count"
done

echo ""
echo "Done. All data tables reset. Users and API keys preserved."
