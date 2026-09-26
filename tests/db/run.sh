#!/usr/bin/env bash
# Creates a throwaway database, loads the Supabase stub + migration, and runs
# the SQL tests. Usage: tests/db/run.sh   (needs a local PostgreSQL 15+)
set -eo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-lockedin_test}
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f tests/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
"${PSQL[@]}" -d "$DB" -f tests/db/tests.sql 2>&1 >/dev/null | sed -n "s/.*NOTICE:  //p; /ERROR/p"
echo "Database tests passed."
