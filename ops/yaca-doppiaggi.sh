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

NODE_BIN=""
for candidate in \
  "/home/gabri/.local/share/mise/installs/node/22/bin/node" \
  "/home/gabri/.local/share/mise/installs/node/latest/bin/node" \
  "$(command -v node 2>/dev/null || true)" \
  "/usr/local/bin/node" \
  "/usr/bin/node"; do
  if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
    if "${candidate}" -v >/dev/null 2>&1; then
      NODE_BIN="${candidate}"
      break
    fi
  fi
done

if [ -z "${NODE_BIN}" ]; then
  echo "[-] ERRORE: Interprete Node.js non trovato o non funzionante." >&2
  exit 1
fi

export PATH="$(dirname "${NODE_BIN}"):${PATH}"

# 4. Bootstrap dipendenze del modulo se mancanti (modulo leggero: solo mongodb)
if [ ! -d "${SERVICE_DIR}/node_modules/mongodb" ]; then
  echo "[i] Dipendenza 'mongodb' non trovata in ${SERVICE_DIR}. Eseguo npm install..."
  NPM_BIN=""
  for candidate in \
    "$(dirname "${NODE_BIN}")/npm" \
    "/home/gabri/.local/share/mise/installs/node/22/bin/npm" \
    "$(command -v npm 2>/dev/null || true)" \
    "/usr/local/bin/npm" \
    "/usr/bin/npm"; do
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      if "${candidate}" -v >/dev/null 2>&1; then
        NPM_BIN="${candidate}"
        break
      fi
    fi
  done

  if [ -n "${NPM_BIN}" ]; then
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
  #    Niente `exec`: dopo la CLI c'e' la push del diff in coda (passo 8). Con `exec` il processo
  #    verrebbe sostituito e quel passo non esisterebbe mai — ed e' esattamente com'era prima.
  set +e
  "${NODE_BIN}" "${SERVICE_DIR}/cli.js" \
    --movies-path "${MOVIES_PATH}" \
    --tv-path "${TV_PATH}" \
    --cache-dir "${CACHE_DIR}" \
    "$@"
  CLI_STATUS=$?
  set -e

  if [ "${CLI_STATUS}" -ne 0 ]; then
    echo "[-] ERRORE: il giro dei doppiaggi e' uscito con stato ${CLI_STATUS}." >&2
  fi

  # 8. Push del diff in coda eventi — SENZA QUESTO PASSO LA CATENA E' FERMA AL PRIMO ANELLO.
  #    Il diff dice quali titoli hanno cambiato doppiaggio; la coda li fa ricomporre dal drenatore
  #    (ops/yaca-poster-eventi.timer) senza aspettare il TTL. Finche' era un comando a mano, i
  #    poster cambiati restavano vecchi finche' qualcuno non se ne ricordava.
  #    Dentro `yaca-app` perche' li' ci sono le tre cose che servono: le dipendenze dell'app
  #    (ioredis per la coda), la rete del compose (REDIS_URL=redis://redis:6379 non e'
  #    risolvibile dall'host) e il volume `yaca_tmdb` montato su /data/tmdb.
  #    Lo script e' idempotente — a deduplicare e' la coda — quindi si puo' lanciare anche a vuoto.
  DIFF_PATH="${TMDB_DIR}/ita_annotations.diff.json"
  if [ "${CLI_STATUS}" -eq 0 ] && [ -f "${DIFF_PATH}" ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Push del diff in coda eventi..."
    if docker exec --workdir /app yaca-app node scripts/push-diff-in-coda.js --file /data/tmdb/ita_annotations.diff.json; then
      echo "  [+] diff spinto: i poster cambiati sono in coda."
    else
      # Volutamente rumoroso, e volutamente un fallimento: un guasto qui non si vede da nessun'altra
      # parte, e significa poster vecchi in silenzio. Meglio la pagina dei failed del timer che un
      # guasto invisibile — la lezione della mappa poster-erdb.
      echo "[-] ERRORE: push del diff fallita. I poster cambiati NON verranno ricomposti" >&2
      echo "    finche' non riesce. Comando a mano:" >&2
      echo "      docker exec --workdir /app yaca-app node scripts/push-diff-in-coda.js --file /data/tmdb/ita_annotations.diff.json" >&2
      exit 1
    fi
  else
    echo "[i] Nessun diff da spingere (giro fallito o file assente: ${DIFF_PATH})."
  fi

  exit "${CLI_STATUS}"
