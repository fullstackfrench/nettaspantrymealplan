#!/bin/zsh
# Isolated local PostgreSQL only. Does not read .env.local or any production URL.
set -eu
test_db="${MENU_ANNOUNCEMENT_TEST_DATABASE:-netta_announcement_test$(date +%Y%m%d%H%M%S)}"
if [[ ! "$test_db" =~ '^netta_announcement_test[0-9]+$' ]]; then
 print -u2 'Use a fresh netta_announcement_test database followed by digits.'
 exit 1
fi
createdb -h /private/tmp -p 55443 -E UTF8 -T template0 "$test_db"
psql -h /private/tmp -p 55443 -d "$test_db" -v ON_ERROR_STOP=1 \
 -f tests/menu-announcements-bootstrap.sql \
 -f supabase/migrations/20261031_menu_announcements.sql \
 -f tests/menu-announcements-database.sql
RUN_MENU_ANNOUNCEMENT_DATABASE_TESTS=true MENU_ANNOUNCEMENT_TEST_DATABASE="$test_db" node --test tests/menu-announcements-concurrency.cjs
print "Synthetic test database retained: $test_db"
