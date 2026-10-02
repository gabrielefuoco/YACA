#!/usr/bin/env bash
# ==============================================================================
# YACA - Script di esecuzione periodica per scraping doppiaggi ITA
# Servizio: services/doppiaggi-source
# ==============================================================================
#
# Esegue lo scraping degli indici di antoniogenna.net/doppiaggio/ (79 pagine),
# riconciliazione con il catalogo YACA (master_movies.jsonl, master_tv.jsonl)
# e fusione con i dati di AnimeUnity (MongoDB anime_airing_state).
# Produce il file ita_annotations.jsonl e il relativo file meta accanto ai dump.
#
# Cadenza operativa decisa: 04:00 e 16:00 (due volte al giorno).
# ==============================================================================

set -euo pipefail

# 1. Caricamento ambiente di produzione
if [ -f /srv/yaca/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /srv/yaca/.env
  set +a
fi

# 2. Forzatura IPv4 per DNS/fetch (IPv6 non instradato sull'host di produzione)
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"

# 3. Individuazione cartella del servizio e dell'interprete Node
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_DIR="${BASE_DIR}/services/doppiaggi-source"
CACHE_DIR="${CACHE_DIR:-${SERVICE_DIR}/.cache}"
mkdir -p "${CACHE_DIR}"

NODE_BIN="$(command -v node || echo /usr/bin/node)"
if [ ! -x "${NODE_BIN}" ]; then
  echo "[-] ERRORE: Interprete Node.js non trovato." >&2
  exit 1
fi

# 4. Bootstrap dipendenze del modulo se mancanti (modulo leggero: solo mongodb)
if [ ! -d "${SERVICE_DIR}/node_modules/mongodb" ]; then
  echo "[i] Dipendenza 'mongodb' non trovata in ${SERVICE_DIR}. Eseguo npm install..."
  NPM_BIN="$(command -v npm || echo /usr/bin/npm)"
  if [ -x "${NPM_BIN}" ]; then
    (cd "${SERVICE_DIR}" && "${NPM_BIN}" install --omit=dev --no-audit --no-fund)
  else
    echo "[-] ERRORE: npm non trovato per installare le dipendenze in ${SERVICE_DIR}." >&2
    exit 1
  fi
fi

# 5. Gestione immediata dell'health-check
for arg in "$@"; do
  if [ "$arg" = "--health-check" ]; then
    exec "${NODE_BIN}" "${SERVICE_DIR}/cli.js" --cache-dir "${CACHE_DIR}" --health-check
  fi
done

# 6. Risoluzione percorso dump catalogo TMDB
TMDB_DIR="${TMDB_DIR:-}"
if [ -z "${TMDB_DIR}" ]; then
  if [ -f "/data/tmdb/master_movies.jsonl" ]; then
    TMDB_DIR="/data/tmdb"
  elif [ -f "/var/lib/docker/volumes/yaca_tmdb/_data/master_movies.jsonl" ]; then
    TMDB_DIR="/var/lib/docker/volumes/yaca_tmdb/_data"
  elif [ -f "${BASE_DIR}/.cache/tmdb/master_movies.jsonl" ]; then
    TMDB_DIR="${BASE_DIR}/.cache/tmdb"
  else
    echo "[-] ERRORE: Impossibile trovare i dump master_movies.jsonl e master_tv.jsonl." >&2
    echo "    Percorsi controllati:" >&2
    echo "      - /data/tmdb" >&2
    echo "      - /var/lib/docker/volumes/yaca_tmdb/_data" >&2
    echo "      - ${BASE_DIR}/.cache/tmdb" >&2
    exit 1
  fi
fi

MOVIES_PATH="${TMDB_DIR}/master_movies.jsonl"
TV_PATH="${TMDB_DIR}/master_tv.jsonl"

if [ ! -f "${MOVIES_PATH}" ] || [ ! -f "${TV_PATH}" ]; then
  echo "[-] ERRORE: Uno o entrambi i dump JSONL mancano in ${TMDB_DIR}." >&2
  exit 1
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Avvio passata doppiaggi-source..."
echo "  Dump catalogo : ${TMDB_DIR}"
echo "  Cache indici  : ${CACHE_DIR}"
echo "  Output target : ${TMDB_DIR}/ita_annotations.jsonl"

# 7. Esecuzione CLI
exec "${NODE_BIN}" "${SERVICE_DIR}/cli.js" \
  --movies-path "${MOVIES_PATH}" \
  --tv-path "${TV_PATH}" \
  --cache-dir "${CACHE_DIR}" \
  "$@"
