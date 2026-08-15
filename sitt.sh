#!/usr/bin/env bash

set -euo pipefail

read -r -s -p "PostgreSQL migration URL: " RADA_MIGRATION_URL
printf '\n'

if [[ -z "$RADA_MIGRATION_URL" ]]; then
  echo "Migration URL cannot be empty." >&2
  exit 1
fi

trap 'unset RADA_MIGRATION_URL' EXIT
DATABASE_URL="$RADA_MIGRATION_URL" npm run db:migrate
