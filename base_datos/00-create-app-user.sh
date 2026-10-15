#!/bin/sh
set -eu

: "${DB_APP_PASSWORD:?Define DB_APP_PASSWORD en el archivo .env}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=db_app_password="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE app_user LOGIN;
ALTER ROLE app_user PASSWORD :'db_app_password';
SQL
