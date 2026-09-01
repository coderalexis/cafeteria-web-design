#!/usr/bin/env bash
# Corre la suite SQL contra un Postgres recién nacido:
#   1. el shim de Supabase (roles, auth.uid, pgcrypto),
#   2. las 36 migraciones de docs/supabase en orden, tal cual están en el repo,
#   3. cada tests/sql/t_*.sql dentro de su propia transacción, que SIEMPRE se
#      revierte: una prueba deja la base exactamente como la encontró.
#
# Una prueba falla levantando una excepción; con ON_ERROR_STOP psql sale con
# código distinto de cero y el CI se pone rojo. No hay framework: es el mismo
# estilo de «ensayo con reversión» que se venía haciendo a mano, pero
# repetible y en cada push.
#
# Uso: DATABASE_URL=postgres://postgres:pruebas@localhost:5433/pruebas tests/sql/run.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Falta DATABASE_URL}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

echo "── Shim de Supabase"
"${PSQL[@]}" -f tests/sql/00_supabase_shim.sql

echo "── Migraciones"
for f in $(ls docs/supabase/[0-9][0-9]_*.sql | sort); do
  printf '   %s\n' "$(basename "$f")"
  "${PSQL[@]}" -f "$f"
  # Gancho para lo que una base virgen necesita ENTRE migraciones (p. ej. el
  # usuario operador que la 09 da por existente). Se nombra por la migración
  # a la que sigue, para que se vea de un vistazo a qué pertenece.
  gancho="tests/sql/despues_de_$(basename "$f")"
  if [ -f "$gancho" ]; then
    printf '   └ %s\n' "$(basename "$gancho")"
    "${PSQL[@]}" -f "$gancho"
  fi
done

echo "── Ayudantes de prueba"
"${PSQL[@]}" -f tests/sql/01_helpers.sql

echo "── Pruebas"
fallas=0
for t in $(ls tests/sql/t_*.sql | sort); do
  nombre="$(basename "$t" .sql)"
  # Cada prueba corre entre BEGIN y ROLLBACK aunque el archivo no los traiga:
  # así ni la que pasa ni la que falla puede ensuciar a la siguiente.
  if { echo 'begin;'; cat "$t"; echo 'rollback;'; } | "${PSQL[@]}" -f - >/tmp/prueba.log 2>&1; then
    printf '   ✓ %s\n' "$nombre"
  else
    printf '   ✗ %s\n' "$nombre"
    sed 's/^/       /' /tmp/prueba.log | grep -v '^\s*$' | tail -12
    fallas=$((fallas + 1))
  fi
done

if [ "$fallas" -gt 0 ]; then
  echo "── $fallas prueba(s) fallaron"
  exit 1
fi
echo "── Todo en verde"
