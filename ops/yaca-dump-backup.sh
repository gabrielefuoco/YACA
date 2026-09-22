#!/usr/bin/env bash
# ==============================================================================
# YACA - Script di Backup Database Locali (TMDB Parquet, Cursore, Cache Anime)
# ==============================================================================
#
# Salva su destinazione configurata (${R2_DESTINATION}) via rclone:
#  - tmdb/parquet/    : movies.parquet, tv.parquet, cursor.json (giornaliero)
#  - anime-source/    : airing-series.json, dubbed-series.json (giornaliero)
#  - tmdb/jsonl/      : master_movies.jsonl, master_tv.jsonl (settimanale con --full)
#
# REGOLA SUI FILE JSONL:
# I file master_*.jsonl vengono salvati solo con il flag '--full' e SOLO SE il
# cursore (/data/tmdb/cursor.json) attesta il completamento del dump TMDB
# (completed: { movies: true, tv: true }). Se non completo, il salvataggio dei
# JSONL viene saltato con un messaggio di log esplicativo (gate).
#
# PROCEDURA DI RESTORE:
# Per ripristinare i file salvati su destinazione remota o locale:
#
# 1. Elencare i file disponibili:
#      rclone lsf "${R2_DESTINATION:-r2:yaca-backups}/tmdb/parquet"
#      rclone lsf "${R2_DESTINATION:-r2:yaca-backups}/anime-source"
#      rclone lsf "${R2_DESTINATION:-r2:yaca-backups}/tmdb/jsonl"
#
# 2. Scaricare il file desiderato:
#      rclone copy "${R2_DESTINATION}/tmdb/parquet/<NOME_FILE>.parquet" /tmp/
#
# 3. Ripristinare nel container Docker appropriato:
#      docker cp /tmp/<NOME_FILE>.parquet yaca-app:/data/tmdb/movies.parquet
#      docker cp /tmp/<NOME_FILE>.json yaca-anime-source:/app/.cache/airing-series.json
# ==============================================================================

set -euo pipefail

FULL_BACKUP=false
for arg in "$@"; do
  case "$arg" in
    --full|full)
      FULL_BACKUP=true
      ;;
    -h|--help)
      echo "Uso: $0 [--full]"
      echo "  Senza argomenti: backup dei file leggeri (parquet, cursor, liste anime)"
      echo "  --full         : include anche i dump JSONL completi (se il cursore indica completamento)"
      exit 0
      ;;
  esac
done

# Preserva eventuali override passati esplicitamente da ambiente/CLI
SAVED_R2_DESTINATION="${R2_DESTINATION:-}"
SAVED_BACKUP_RETENTION="${BACKUP_RETENTION_DAYS:-}"
SAVED_JSONL_RETENTION="${JSONL_RETENTION_DAYS:-}"

# Se lanciato a mano (es. `sudo ./yaca-dump-backup.sh`) carica le variabili dal .env del server
if [ -f /srv/yaca/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /srv/yaca/.env
  set +a
fi

# Variabili configurabili con valori di default
R2_DESTINATION="${SAVED_R2_DESTINATION:-${R2_DESTINATION:-r2:yaca-backups}}"
BACKUP_RETENTION_DAYS="${SAVED_BACKUP_RETENTION:-${BACKUP_RETENTION_DAYS:-30}}"
JSONL_RETENTION_DAYS="${SAVED_JSONL_RETENTION:-${JSONL_RETENTION_DAYS:-21}}"

# Verifica disponibilità comandi indispensabili
if ! command -v rclone >/dev/null 2>&1; then
  echo "[-] ERRORE: Il comando 'rclone' non è installato o non si trova nel PATH." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[-] ERRORE: Il comando 'docker' non è installato o non si trova nel PATH." >&2
  exit 1
fi

# Configurazione cartella temporanea e cleanup automatico su exit
TMP_DIR="$(mktemp -d -t yaca-dump-backup-XXXXXX)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"

mkdir -p "${TMP_DIR}/tmdb/parquet"
mkdir -p "${TMP_DIR}/tmdb/jsonl"
mkdir -p "${TMP_DIR}/anime-source"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Avvio backup database locali YACA (modalità: $([ "$FULL_BACKUP" = true ] && echo "completa --full" || echo "standard / file leggeri"))..."

# Funzione per estrarre file da un container docker in modo sicuro
# Non interrompe l'esecuzione se un file opzionale/in-corso non esiste
copy_from_container() {
  local container="$1"
  local src_path="$2"
  local dest_path="$3"
  local description="$4"

  if ! docker ps -a --format '{{.Names}}' | grep -qx "${container}"; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [!] Container '${container}' non presente nel sistema: salto ${description}."
    return 0
  fi

  local err_output
  if ! err_output=$(docker cp "${container}:${src_path}" "${dest_path}" 2>&1); then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [i] File '${src_path}' non trovato nel container '${container}': salto ${description}."
    return 0
  fi

  if [ -s "${dest_path}" ]; then
    local file_size
    file_size="$(du -h "${dest_path}" | cut -f1)"
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Copiato ${description} (${file_size}): $(basename "${dest_path}")"
    return 0
  else
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [!] File '${src_path}' copiato ma vuoto (0 byte): ${description}."
    return 0
  fi
}

# ------------------------------------------------------------------------------
# 1. Copia file leggeri (TMDB parquet, cursore, liste anime)
# ------------------------------------------------------------------------------
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Estrazione file database TMDB da 'yaca-app'..."
copy_from_container "yaca-app" "/data/tmdb/movies.parquet" "${TMP_DIR}/tmdb/parquet/movies-${TIMESTAMP}.parquet" "movies.parquet"
copy_from_container "yaca-app" "/data/tmdb/tv.parquet" "${TMP_DIR}/tmdb/parquet/tv-${TIMESTAMP}.parquet" "tv.parquet"
copy_from_container "yaca-app" "/data/tmdb/cursor.json" "${TMP_DIR}/tmdb/parquet/cursor-${TIMESTAMP}.json" "cursor.json"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Estrazione cache anime da 'yaca-anime-source'..."
copy_from_container "yaca-anime-source" "/app/.cache/airing-series.json" "${TMP_DIR}/anime-source/airing-series-${TIMESTAMP}.json" "airing-series.json"
copy_from_container "yaca-anime-source" "/app/.cache/dubbed-series.json" "${TMP_DIR}/anime-source/dubbed-series-${TIMESTAMP}.json" "dubbed-series.json"

# ------------------------------------------------------------------------------
# 2. Gestione dump JSONL grandi (--full con gate di completamento)
# ------------------------------------------------------------------------------
JSONL_SAVED=false
if [ "${FULL_BACKUP}" = true ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Opzione --full attiva: verifica stato dump in cursor.json..."
  CURSOR_LOCAL="${TMP_DIR}/tmdb/parquet/cursor-${TIMESTAMP}.json"
  DUMP_COMPLETE=false

  if [ -f "${CURSOR_LOCAL}" ]; then
    if command -v jq >/dev/null 2>&1; then
      if jq -e '.completed.movies == true and .completed.tv == true' "${CURSOR_LOCAL}" >/dev/null 2>&1; then
        DUMP_COMPLETE=true
      fi
    elif command -v node >/dev/null 2>&1; then
      if node -e '
        const fs = require("fs");
        try {
          const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
          process.exit(c?.completed?.movies === true && c?.completed?.tv === true ? 0 : 1);
        } catch(e) { process.exit(1); }
      ' "${CURSOR_LOCAL}" >/dev/null 2>&1; then
        DUMP_COMPLETE=true
      fi
    elif command -v python3 >/dev/null 2>&1; then
      if python3 -c '
import json, sys
try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    comp = d.get("completed", {})
    sys.exit(0 if (comp.get("movies") is True and comp.get("tv") is True) else 1)
except Exception:
    sys.exit(1)
' "${CURSOR_LOCAL}" >/dev/null 2>&1; then
        DUMP_COMPLETE=true
      fi
    fi
  fi

  if [ "${DUMP_COMPLETE}" = true ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Gate superato: il cursore TMDB attesta dump completato (movies: true, tv: true). Estrazione JSONL..."
    copy_from_container "yaca-app" "/data/tmdb/master_movies.jsonl" "${TMP_DIR}/tmdb/jsonl/master_movies-${TIMESTAMP}.jsonl" "master_movies.jsonl"
    copy_from_container "yaca-app" "/data/tmdb/master_tv.jsonl" "${TMP_DIR}/tmdb/jsonl/master_tv-${TIMESTAMP}.jsonl" "master_tv.jsonl"
    JSONL_SAVED=true
  else
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [!] Gate non superato: il cursore TMDB indica che il dump non è completo (richiesto: movies=true, tv=true). Salto il backup dei file JSONL."
  fi
fi

# Verifica che almeno un file sia stato effettivamente estratto
COPIED_COUNT="$(find "${TMP_DIR}" -type f | wc -l)"
if [ "${COPIED_COUNT}" -eq 0 ]; then
  echo "[-] ERRORE: Nessun file di backup è stato recuperato dai container Docker." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 3. Caricamento su destinazione remota o locale (${R2_DESTINATION}) via rclone
# ------------------------------------------------------------------------------
if [ -d "${TMP_DIR}/tmdb/parquet" ] && [ -n "$(find "${TMP_DIR}/tmdb/parquet" -type f)" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Caricamento parquet e cursore su ${R2_DESTINATION}/tmdb/parquet/..."
  rclone copy "${TMP_DIR}/tmdb/parquet" "${R2_DESTINATION}/tmdb/parquet"
fi

if [ -d "${TMP_DIR}/anime-source" ] && [ -n "$(find "${TMP_DIR}/anime-source" -type f)" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Caricamento cache anime su ${R2_DESTINATION}/anime-source/..."
  rclone copy "${TMP_DIR}/anime-source" "${R2_DESTINATION}/anime-source"
fi

if [ "${FULL_BACKUP}" = true ] && [ "${JSONL_SAVED}" = true ] && [ -d "${TMP_DIR}/tmdb/jsonl" ] && [ -n "$(find "${TMP_DIR}/tmdb/jsonl" -type f)" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Caricamento dump JSONL su ${R2_DESTINATION}/tmdb/jsonl/..."
  rclone copy "${TMP_DIR}/tmdb/jsonl" "${R2_DESTINATION}/tmdb/jsonl"
fi

# ------------------------------------------------------------------------------
# 4. Applicazione retention policy per tipologia di file
# ------------------------------------------------------------------------------
apply_retention() {
  local target_path="$1"
  local days="$2"
  local label="$3"

  if rclone lsf "${target_path}" >/dev/null 2>&1; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Applicazione retention (${days} giorni) su ${label}..."
    rclone delete --min-age "${days}d" "${target_path}" || true
  fi
}

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Applicazione policy di retention sui backup..."
apply_retention "${R2_DESTINATION}/tmdb/parquet" "${BACKUP_RETENTION_DAYS}" "tmdb/parquet"
apply_retention "${R2_DESTINATION}/anime-source" "${BACKUP_RETENTION_DAYS}" "anime-source"
apply_retention "${R2_DESTINATION}/tmdb/jsonl" "${JSONL_RETENTION_DAYS}" "tmdb/jsonl"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup database locali completato con successo su ${R2_DESTINATION}."
