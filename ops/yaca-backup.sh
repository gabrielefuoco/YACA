#!/usr/bin/env bash
# ==============================================================================
# YACA - Script di Backup MongoDB Atlas su Cloudflare R2 via rclone
# ==============================================================================
#
# PROCEDURA DI RESTORE:
# Per ripristinare un backup salvato su Cloudflare R2:
#
# 1. Elencare i backup disponibili su Cloudflare R2:
#      rclone lsf "${R2_DESTINATION:-r2:yaca-backups}/mongo"
#
# 2. Scaricare il file di archivio desiderato in una cartella temporanea:
#      rclone copy "${R2_DESTINATION:-r2:yaca-backups}/mongo/<NOME_BACKUP>.archive.gz" /tmp/
#
# 3. Eseguire il restore su MongoDB Atlas:
#    - Con mongorestore nativo sull'host:
#        mongorestore --uri="${MONGODB_URI}" --archive="/tmp/<NOME_BACKUP>.archive.gz" --gzip --drop
#
#    - Oppure tramite container Docker (se gli strumenti Mongo non sono installati sull'host):
#        docker run --rm --user "$(id -u):$(id -g)" --entrypoint mongorestore \
#          -v /tmp:/backup mongo:7 \
#          --uri="${MONGODB_URI}" --archive="/backup/<NOME_BACKUP>.archive.gz" --gzip --drop
#      (nota: `--entrypoint` è obbligatorio — vedi la nota sull'entrypoint più sotto)
#
#    NOTA: Il flag '--drop' sovrascrive le collezioni esistenti prima del ripristino.
#          Omettere '--drop' se si intende eseguire un merge non distruttivo.
#
#    NOTA: In una shell manuale le variabili non sono esportate: prima dei comandi
#          eseguire `set -a; . /srv/yaca/.env; set +a` (oppure esportare MONGODB_URI a mano).
# ==============================================================================

set -euo pipefail

# Se lanciato a mano (es. `sudo ./yaca-backup.sh`) l'ambiente non ha le variabili:
# ricaricale dal .env del server.
if [ -z "${MONGODB_URI:-}" ] && [ -f /srv/yaca/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /srv/yaca/.env
  set +a
fi

# Controllo variabili d'ambiente obbligatorie
if [ -z "${MONGODB_URI:-}" ]; then
  echo "[-] ERRORE: La variabile d'ambiente MONGODB_URI non è definita." >&2
  exit 1
fi

# Variabili configurabili con valori di default
R2_DESTINATION="${R2_DESTINATION:-r2:yaca-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Verifica disponibilità di rclone
if ! command -v rclone >/dev/null 2>&1; then
  echo "[-] ERRORE: Il comando 'rclone' non è installato o non si trova nel PATH." >&2
  exit 1
fi

# Configurazione cartella temporanea e cleanup automatico su exit
TMP_DIR="$(mktemp -d -t yaca-backup-XXXXXX)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"
ARCHIVE_NAME="yaca-mongo-backup-${TIMESTAMP}.archive.gz"
ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Avvio dump database MongoDB Atlas..."

# Esecuzione dump: tenta mongodump nativo o ricorre al container docker
if command -v mongodump >/dev/null 2>&1; then
  mongodump --uri="${MONGODB_URI}" --archive="${ARCHIVE_PATH}" --gzip
elif command -v docker >/dev/null 2>&1; then
  echo "[i] 'mongodump' non trovato sull'host. Esecuzione tramite container Docker (mongo:7)..."
  # Due dettagli non negoziabili, verificati il 2026-09-22:
  #  - `--entrypoint mongodump`: invocare `mongodump` come comando del container lo fa passare
  #    dall'entrypoint dell'immagine, che cambia utente e fa fallire la scrittura con
  #    "permission denied" sulla cartella montata. Con --entrypoint il binario parte diretto.
  #  - `--user` + `HOME=/tmp`: il file deve nascere con l'uid dell'invocante (root sotto systemd),
  #    altrimenti il resto dello script non lo può leggere/copiare.
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp --entrypoint mongodump \
    -v "${TMP_DIR}:/backup" mongo:7 \
    --uri="${MONGODB_URI}" --archive="/backup/${ARCHIVE_NAME}" --gzip
else
  echo "[-] ERRORE: Né 'mongodump' né 'docker' sono disponibili per generare il dump." >&2
  exit 1
fi

# Verifica che il file di archivio sia stato creato e non sia vuoto
if [ ! -s "${ARCHIVE_PATH}" ]; then
  echo "[-] ERRORE: Il file di backup '${ARCHIVE_PATH}' non è stato creato o è vuoto." >&2
  exit 1
fi

FILE_SIZE="$(du -h "${ARCHIVE_PATH}" | cut -f1)"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Dump generato con successo: ${ARCHIVE_NAME} (${FILE_SIZE})."

# Caricamento su Cloudflare R2
# Sottocartella dedicata: la retention qui sotto è ricorsiva, quindi senza
# separazione cancellerebbe anche gli artefatti degli altri backup.
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Caricamento archivio su ${R2_DESTINATION}/mongo/..."
rclone copy "${ARCHIVE_PATH}" "${R2_DESTINATION}/mongo"

# Applicazione retention policy sui backup remoti
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Applicazione retention: rimozione backup più vecchi di ${BACKUP_RETENTION_DAYS} giorni..."
rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" "${R2_DESTINATION}/mongo" || true

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup completato con successo su ${R2_DESTINATION}."
