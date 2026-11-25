#!/usr/bin/env bash
# ==============================================================================
# YACA - Watchdog per il container Docker yaca-anime-source
# ==============================================================================
#
# PERCHÉ ESISTE QUESTO WATCHDOG:
# Il container `yaca-anime-source` ha un healthcheck Docker che esegue
# `node cli.js --health-check` (exit 1 se nessun giro è andato a buon fine
# nelle ultime 12 ore), ma Docker NON riavvia un container unhealthy: si
# limita a riportarne lo stato. Inoltre `--health-check` controlla solo
# `last-run.json`, che viene scritto anche quando il parser legge zero item.
# INCIDENTE 2026-11-16 -> 2026-11-25: cambio dominio AnimeUnity (301 non seguito),
#   zero item letti per 9 giorni ma battito aggiornato -> healthcheck verde.
#
# COSA FA:
# - Verifica che `docker` e il demone siano raggiungibili (altrimenti esce 0).
# - Controlla se `yaca-anime-source` è in esecuzione; se è fermo, riavvia.
# - Esegue `docker exec yaca-anime-source node cli.js --health-check`; se
#   fallisce (exit != 0), logga il motivo ed esegue `docker restart`.
# - Dopo un `--health-check` verde, verifica anche la freschezza dei dati in
#   `/app/.cache/last-home-run.json` (soglia: 6 ore, dato che la passata home
#   incrementale gira ogni 15 minuti); se mancante o più vecchio di 6h, riavvia.
# - Esce SEMPRE con codice 0 (niente `set -e` che possa far fallire il timer
#   systemd su un healthcheck negativo).
# - Supporta `--dry-run` per segnalare cosa farebbe senza riavviare nulla.
# ==============================================================================

set -u

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    -h|--help)
      echo "Uso: $0 [--dry-run]"
      exit 0
      ;;
    *)
      echo "[watchdog] Opzione sconosciuta ignorata: ${arg}"
      ;;
  esac
done

CONTAINER="yaca-anime-source"
HOME_HEARTBEAT_PATH="/app/.cache/last-home-run.json"
MAX_HOME_AGE_SEC=21600 # 6 ore (la passata home incrementale gira ogni 15 min)

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [watchdog] $*"
}

restart_container() {
  local reason="$1"
  if [ "${DRY_RUN}" = true ]; then
    log "[dry-run] ${reason}; eseguirei: docker restart ${CONTAINER}"
    return 0
  fi

  log "${reason}; riavvio ${CONTAINER}..."
  if docker restart "${CONTAINER}"; then
    log "container '${CONTAINER}' riavviato con successo."
  else
    log "ATTENZIONE: docker restart ${CONTAINER} fallito (exit $?)."
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  if [ "${DRY_RUN}" = true ]; then
    log "[dry-run] comando 'docker' non trovato nel PATH; nessuna azione eseguibile."
  else
    log "comando 'docker' non trovato nel PATH; controllo saltato."
  fi
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  if [ "${DRY_RUN}" = true ]; then
    log "[dry-run] demone Docker non raggiungibile; nessuna azione eseguibile."
  else
    log "demone Docker non raggiungibile; controllo saltato."
  fi
  exit 0
fi

running_state="$(docker inspect -f '{{.State.Running}}' "${CONTAINER}" 2>/dev/null)"
inspect_rc=$?
if [ "${inspect_rc}" -ne 0 ]; then
  if [ "${DRY_RUN}" = true ]; then
    log "[dry-run] container '${CONTAINER}' non trovato; nessuna azione eseguibile."
  else
    log "container '${CONTAINER}' non trovato; controllo saltato."
  fi
  exit 0
fi

if [ "${running_state}" != "true" ]; then
  restart_container "container '${CONTAINER}' non è in esecuzione (running=${running_state})"
  exit 0
fi

hc_output="$(docker exec "${CONTAINER}" node cli.js --health-check 2>&1)"
hc_rc=$?
if [ "${hc_rc}" -ne 0 ]; then
  restart_container "health-check fallito (exit ${hc_rc}): ${hc_output:-nessun output}"
  exit 0
fi

home_mtime="$(docker exec "${CONTAINER}" stat -c %Y "${HOME_HEARTBEAT_PATH}" 2>/dev/null)"
stat_rc=$?
if [ "${stat_rc}" -ne 0 ] || ! [[ "${home_mtime}" =~ ^[0-9]+$ ]]; then
  restart_container "${HOME_HEARTBEAT_PATH} assente o illeggibile (exit ${stat_rc}) nonostante health-check OK"
  exit 0
fi

now_epoch="$(date -u +%s)"
home_age_sec=$((now_epoch - home_mtime))
if [ "${home_age_sec}" -lt 0 ]; then
  home_age_sec=0
fi
home_age_hours="$((home_age_sec / 3600)).$(((home_age_sec % 3600) / 360))"

if [ "${home_age_sec}" -gt "${MAX_HOME_AGE_SEC}" ]; then
  restart_container "dati home vecchi (${home_age_hours}h > 6h su ${HOME_HEARTBEAT_PATH}) nonostante health-check OK"
  exit 0
fi

log "OK (${CONTAINER}): ${hc_output:-health-check superato}; home aggiornata ${home_age_hours}h fa"
exit 0
