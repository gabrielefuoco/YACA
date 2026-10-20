#!/usr/bin/env bash
# ==============================================================================
# YACA - Aggiornamento IDEMPOTENTE dell'export statico (timer systemd)
# ==============================================================================
#
# PERCHE' ESISTE (20/10/2026). App e grafo si aggiornano da soli (Watchtower guarda le immagini
# Docker), il frontend no: e' una cartella montata, e l'unico passo che la aggiorna era manuale.
# Risultato: container aggiornati e dashboard con il JS di ieri, senza che nessuno se ne accorgesse
# (la dashboard si disegna dai dati dell'API, quindi sembrava a posto).
#
# COSA FA: scarica il tarball dell'export, legge il `version.json` che c'e' dentro e lo confronta con
# quello gia' servito. Se sono uguali non tocca niente (niente download inutile, niente estrazione,
# niente rischio di mezze cartelle). Se sono diversi, delega a `ops/frontend-aggiorna.sh` — che svuota
# preservando l'inode del bind mount — e registra la versione nuova.
#
# Uso:  ops/frontend-timer.sh            (una passata; lo chiama il timer ogni 5 minuti)
# Log:  journalctl -u yaca-frontend-update  (oppure /var/log/yaca-frontend.log se lanciato a mano)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${FRONTEND_DIR:-$ROOT/frontend-out}"
ASSET_URL="${FRONTEND_ASSET_URL:-https://github.com/gabrielefuoco/YACA/releases/download/frontend-latest/frontend-out.tar.gz}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[$(date -u +%FT%TZ)] controllo export statico..."

if ! curl -fsSL --max-time 120 -o "$TMP/export.tar.gz" "$ASSET_URL"; then
    echo "  download fallito: niente da aggiornare (riprovo al prossimo giro)"
    exit 0
fi

NUOVA="$(tar -xzOf "$TMP/export.tar.gz" ./version.json 2>/dev/null || tar -xzOf "$TMP/export.tar.gz" version.json 2>/dev/null || true)"
if [ -z "$NUOVA" ]; then
    echo "  l'asset non ha version.json: lo considero un export vecchio e NON lo installo"
    exit 1
fi

SHA_NUOVA="$(printf '%s' "$NUOVA" | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([a-f0-9]*\)".*/\1/p')"
SHA_ATTUALE=""
if [ -f "$TARGET/version.json" ]; then
    SHA_ATTUALE="$(sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([a-f0-9]*\)".*/\1/p' "$TARGET/version.json" || true)"
fi

if [ -n "$SHA_NUOVA" ] && [ "$SHA_NUOVA" = "$SHA_ATTUALE" ]; then
    echo "  gia' aggiornato (sha ${SHA_NUOVA:0:7})"
    exit 0
fi

echo "  nuovo export: ${SHA_ATTUALE:0:7} -> ${SHA_NUOVA:0:7}"
bash "$ROOT/ops/frontend-aggiorna.sh" "$TMP/export.tar.gz" >/dev/null
echo "  installato ${SHA_NUOVA:0:7} — nessun riavvio necessario (express.static rilegge da disco)"
