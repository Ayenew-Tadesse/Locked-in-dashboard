#!/usr/bin/env bash
# For each SQL test file: creates a throwaway database, loads the Supabase
# stub + all migrations, and runs the tests.
# Usage: tests/db/run.sh   (needs a local PostgreSQL 15+)
set -eo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-lockedin_test}
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
for test in tests/db/tests.sql tests/db/teams.sql; do
  echo "== $test"
  "${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
  "${PSQL[@]}" -d "$DB" -f tests/db/supabase-stub.sql
  for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
  "${PSQL[@]}" -d "$DB" -f "$test" 2>&1 >/dev/null | sed -n "s/.*NOTICE:  //p; /ERROR/p"
done
echo "Database tests passed."
