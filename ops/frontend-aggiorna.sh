#!/usr/bin/env bash
# ==============================================================================
# YACA - Aggiornamento export statico Next.js sul server mate (Ticket 56)
# ==============================================================================
#
# Questo script scarica l'archivio tarball dell'export statico del frontend
# (costruito dal workflow .github/workflows/deploy-frontend.yml) e lo scompatta
# nella directory del volume host (/srv/yaca/frontend-out).
#
# NOTA ARCHITETTURALE (Ticket 56 - Zero Downtime):
# Il frontend è servito direttamente da express.static in index.js tramite un
# bind mount read-only: ./frontend-out:/app/frontend/out:ro nel compose.
# express.static rilegge i file da disco ad ogni richiesta HTTP:
# -> NON RIAVVIA IL CONTAINER yaca-app
# -> NON RIAVVIA L'ADDON STREMIO
# -> NON INTERROMPE I FLUSSI STREAMING / METADATI IN CORSO
#
# NOTA SUI BIND-MOUNT DOCKER (Preservazione Inode):
# La cartella di destinazione ($FRONTEND_DIR) NON deve mai essere cancellata e
# ricreata con `rm -rf && mkdir`. In Linux, un bind mount Docker punta all'inode
# della directory al momento del mount; cancellare la cartella lascerebbe il
# container connesso a un inode orfano/invisibile. Si svuota il contenuto interno
# preservando l'inode della directory principale.
#
# UTILIZZO:
#   ./ops/frontend-aggiorna.sh                   # Scarica l'ultimo release asset da GitHub
#   ./ops/frontend-aggiorna.sh /path/to/archive  # Scompatta un archivio tarball locale
#   ./ops/frontend-aggiorna.sh --help            # Mostra questo messaggio di aiuto
#
# VARIABILI D'AMBIENTE CONFIGURABILI:
#   FRONTEND_DIR   Cartella di destinazione host (default: /srv/yaca/frontend-out)
#   REPO           Repository GitHub (default: gabrielefuoco/YACA)
#   RELEASE_TAG    Tag della release da scaricare (default: frontend-latest)
# ==============================================================================

set -euo pipefail

# Mostra guida
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  grep '^# ' "$0" | cut -c3-
  exit 0
fi

# Configurazione cartella di destinazione (default: host /srv/yaca/frontend-out)
FRONTEND_DIR="${FRONTEND_DIR:-/srv/yaca/frontend-out}"
REPO="${REPO:-gabrielefuoco/YACA}"
RELEASE_TAG="${RELEASE_TAG:-frontend-latest}"
ARCHIVE_NAME="frontend-out.tar.gz"

echo "=========================================================="
echo "  YACA - Aggiornamento Frontend Statico (Ticket 56)"
echo "  Target host folder: ${FRONTEND_DIR}"
echo "=========================================================="

# Se passato come primo argomento, usa l'archivio tarball specificato
LOCAL_ARCHIVE="${1:-}"
TMP_DIR=""

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "${TMP_DIR:-}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

if [ -n "${LOCAL_ARCHIVE}" ]; then
  if [ ! -f "${LOCAL_ARCHIVE}" ]; then
    echo "[-] ERRORE: Il file archivio locale '${LOCAL_ARCHIVE}' non esiste." >&2
    exit 1
  fi
  TARGET_ARCHIVE="${LOCAL_ARCHIVE}"
  echo "[+] Uso archivio locale fornito: ${TARGET_ARCHIVE}"
else
  TMP_DIR="$(mktemp -d /tmp/yaca-frontend-XXXXXX)"
  TARGET_ARCHIVE="${TMP_DIR}/${ARCHIVE_NAME}"

  if command -v gh >/dev/null 2>&1; then
    echo "[+] Scaricamento tramite GitHub CLI (gh release download)..."
    gh release download "${RELEASE_TAG}" \
      --repo "${REPO}" \
      --pattern "${ARCHIVE_NAME}" \
      --dir "${TMP_DIR}" \
      --clobber
  elif command -v curl >/dev/null 2>&1; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ARCHIVE_NAME}"
    echo "[+] Scaricamento tramite curl da ${DOWNLOAD_URL}..."
    curl -f -sSL "${DOWNLOAD_URL}" -o "${TARGET_ARCHIVE}"
  elif command -v wget >/dev/null 2>&1; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ARCHIVE_NAME}"
    echo "[+] Scaricamento tramite wget da ${DOWNLOAD_URL}..."
    wget -q "${DOWNLOAD_URL}" -O "${TARGET_ARCHIVE}"
  else
    echo "[-] ERRORE: Nessuno strumento disponibile per il download (richiesto gh, curl o wget)." >&2
    exit 1
  fi
fi

if [ ! -s "${TARGET_ARCHIVE}" ]; then
  echo "[-] ERRORE: L'archivio scaricato è vuoto o mancante: ${TARGET_ARCHIVE}" >&2
  exit 1
fi

# Crea la cartella host di destinazione se non esiste ancora
mkdir -p "${FRONTEND_DIR}"

# Svuota il contenuto precedente preservando l'inode della cartella (fondamentale per bind mount Docker)
echo "[+] Pulizia contenuti precedenti in ${FRONTEND_DIR} (mantenimento inode)..."
find "${FRONTEND_DIR}" -mindepth 1 -delete

# Estrai il tarball direttamente nel volume host
echo "[+] Estrazione dell'archivio in ${FRONTEND_DIR}..."
tar --force-local -xzf "${TARGET_ARCHIVE}" -C "${FRONTEND_DIR}"

# Verifica presenza index.html
if [ ! -f "${FRONTEND_DIR}/index.html" ]; then
  echo "[-] ATTENZIONE: index.html non trovato nella cartella estratta. L'archivio potrebbe avere una struttura inattesa." >&2
else
  echo "[+] index.html verificato con successo in ${FRONTEND_DIR}/index.html."
fi

echo "=========================================================="
echo "  [OK] Aggiornamento frontend completato con successo!"
echo "  Nessun riavvio necessario: express.static serve i nuovi file."
echo "=========================================================="
exit 0
