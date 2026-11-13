#!/bin/sh
# Fresh local test database built from the real migrations. Never point this at the live database.
P="psql -h ${PGHOST:-/var/tmp/pgtest} -p ${PGPORT:-54329} -U postgres"
R="$(dirname "$0")/../../supabase"
$P -q -c "drop database if exists ${1:-t}" -c "create database ${1:-t}" && $P -q -d ${1:-t} -v ON_ERROR_STOP=1 -f $R/tests/local_stub.sql -f $R/migrations/001_foundation.sql -f $R/migrations/002_checkout.sql >/dev/null && echo "db ${1:-t} ready"
