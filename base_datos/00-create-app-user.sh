#!/bin/sh
set -eu

: "${DB_APP_PASSWORD:?Define DB_APP_PASSWORD en el archivo .env}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=db_app_password="$DB_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE app_user LOGIN PASSWORD %L', :'db_app_password')
WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'app_user'
)
\gexec

ALTER ROLE app_user WITH LOGIN PASSWORD :'db_app_password';
SQL
