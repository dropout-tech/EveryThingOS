#!/usr/bin/env bash
# Glue D1 backups. Needs CLOUDFLARE_API_TOKEN (D1 edit, R2 edit) and CLOUDFLARE_ACCOUNT_ID in the environment.
#
#   scripts/d1-backup.sh export                 export the whole database, gzip, upload to R2 d1/<db>/<time>.sql.gz
#   scripts/d1-backup.sh info [time]            Time Travel bookmark now, or at a time (unix seconds or RFC3339)
#   scripts/d1-backup.sh restore <time>         Time Travel restore in place (asks first; prints the undo bookmark)
#   scripts/d1-backup.sh fetch <key> <file>     download one export from R2 (to load into a new database)
#
# Env: D1_DATABASE (default dropout-glue), D1_BACKUP_BUCKET (R2 bucket for exports).
set -euo pipefail
cd "$(dirname "$0")/.."

db="${D1_DATABASE:-dropout-glue}"
export D1_BACKUP_BUCKET="${D1_BACKUP_BUCKET:-dropout-backups}"
wr() { npx --no-install wrangler "$@"; }
need() { [ -n "${!1:-}" ] || { echo "要設定 $1" >&2; exit 2; }; }

case "${1:-}" in
export)
  need D1_BACKUP_BUCKET
  dir="$(mktemp -d)"; trap 'rm -rf "$dir"' EXIT
  stamp="$(TZ=Asia/Taipei date +%Y%m%d-%H%M%S)"
  file="$dir/$db-$stamp.sql"
  # A remote export blocks other queries on the database while it runs; schedule it away from the glue's 02:00 daily job.
  wr d1 export "$db" --remote --output="$file" >/dev/null
  [ -s "$file" ] || { echo "匯出的檔案是空的" >&2; exit 1; }
  gzip -9 "$file"
  key="d1/$db/$stamp.sql.gz"
  wr r2 object put "$D1_BACKUP_BUCKET/$key" --file "$file.gz" --content-type application/gzip --remote >/dev/null
  echo "已上傳 $key（$(du -h "$file.gz" | cut -f1)）"
  ;;
info)
  if [ -n "${2:-}" ]; then wr d1 time-travel info "$db" --timestamp="$2"; else wr d1 time-travel info "$db"; fi
  ;;
restore)
  [ -n "${2:-}" ] || { echo "用法：$0 restore <unix 秒或 RFC3339，例 2026-10-11T01:00:00+08:00>" >&2; exit 2; }
  echo "會把 $db 整個回到 $2 的狀態，之後的變更都會消失（之後可以用印出的 bookmark 再還原回來）。"
  read -r -p "輸入資料庫名稱 $db 確認：" typed
  [ "$typed" = "$db" ] || { echo "名稱不符，沒有還原"; exit 1; }
  wr d1 time-travel info "$db" --timestamp="$2"
  wr d1 time-travel restore "$db" --timestamp="$2"
  ;;
fetch)
  need D1_BACKUP_BUCKET
  [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "用法：$0 fetch d1/$db/<時間>.sql.gz <存檔路徑>" >&2; exit 2; }
  wr r2 object get "$D1_BACKUP_BUCKET/$2" --file "$3" --remote >/dev/null
  echo "已下載 $3；gunzip 之後用 wrangler d1 execute <新資料庫> --remote --file=<sql> 載入"
  ;;
*)
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
  ;;
esac
