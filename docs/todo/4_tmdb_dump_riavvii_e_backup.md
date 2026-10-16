# Obiettivo: rendere il dump TMDB sopravvivibile a riavvii, e ripristinabile

Due fragilità emerse durante il cold start del 22/09/2026 (server nuovo, DB vuoto): il dump ha richiesto ~8 ore e in quel momento **tutti i cataloghi serie sono rimasti vuoti** — perché `coldStart()` fa `['movies', 'tv']` e finché `tv.parquet` non esiste la tabella `tv` in RAM nasce vuota. Nessuna delle due è un bug del codice: sono cose che mancano.

## 1. Un riavvio di `yaca-app` a metà dump può distruggere il dump

Fatti verificati:
- `coldStart()` (`src/utils/tmdbDumpDaemon.js:54-58`) scrive `master_{movies,tv}.jsonl` e poi lancia `scripts/convert_to_parquet.js` → `.parquet` → hot reload di DuckDB. Il cursore è in `/data/tmdb/cursor.json` (`mediaType`, `index`, `completed`) e il resume funziona (verificato: `resuming at 358666/558707`);
- osservato il 22/09: `master_tv.jsonl` e `tv.parquet` **non esistevano** perché il cold start — atto volontario su un server nuovo con DB vuoto — era ancora alla fase `movies` (`coldStart()` fa `['movies','tv']`). Per tutta la sua durata **tutti i cataloghi serie sono vuoti**: non un guasto, ma un buco di copertura da conoscere. Il rischio da coprire è che un'interruzione *durante la scrittura* lasci il volume senza un file buono: il cursore e il resume mitigano, non eliminano;
- **Watchtower riavvia `yaca-app` ogni ora se su GHCR c'è un'immagine nuova** (`WATCHTOWER_POLL_INTERVAL=3600`, label sul servizio `app`), e **qualsiasi push su `main` ricostruisce l'immagine** (`deploy.yml` non ha filtro `paths`), anche per modifiche che con l'app non c'entrano. Quindi un normale `git push` può uccidere un dump in corso. Misurato il 22/09: ~15,4 titoli/s → 8 ore per movies+tv.

Da fare:
- [ ] Scrittura **atomica** del dump: mai cancellare/sovrascrivere il file buono prima che il nuovo sia completo (scrivi su `.tmp` + `rename`, e fai lo stesso per il `.parquet`).
- [ ] Conservare l'ultimo `.parquet` valido come `.parquet.bak` e usarlo all'avvio se il nuovo manca: così un'interruzione non azzera i cataloghi.
- [ ] Esporre nel container (file o endpoint, sulla falsariga del `--health-check` del modulo `anime-source`) lo stato "dump in corso + progresso", così un umano e un'automazione possono saperlo.
- [ ] Impedire il riavvio durante il dump: la via più semplice è un check che, se il dump è in corso, **rimanda** l'aggiornamento (Watchtower non ha hook: alternative — pausa di Watchtower via timer, oppure `deploy.yml` con filtro `paths`, oppure un `docker compose stop` esplicito nel runbook di deploy).
- [ ] Mettere un filtro `paths` anche su `deploy.yml` (o comunque non ricostruire l'app per modifiche a `services/**`, `.github/**`, `docs/**`).
- [ ] Documentare la trappola in `docs/DEPLOYMENT_HOME_SERVER.md` §8 (Trappole note) e nel runbook di deploy: **non riavviare l'app mentre il dump gira**.

## 2. Il dump TMDB non ha backup, e nemmeno Mongo ne ha (timer mai installato)

Fatti verificati:
- quando `master_tv.jsonl` è sparito, l'unico rimedio è stato rifare il cold start: ~8 ore di cataloghi serie vuoti. Non esiste copia del dump (né del `.parquet`, che è di pochi MB);
- `ops/yaca-backup.timer` + `ops/yaca-backup.service` **esistono nel repo ma non sono installati su `mate`**: `systemctl list-timers` non mostra nulla di YACA e non esiste un crontab. Quindi anche i backup Mongo sono, oggi, manuali.

Da fare:
- [ ] Installare e abilitare i timer già pronti: copiare `ops/yaca-backup.{service,timer}` in `/etc/systemd/system/`, `systemctl daemon-reload && systemctl enable --now yaca-backup.timer`, e verificare che il primo backup produca davvero un archivio.
- [ ] Aggiungere al backup il **dump TMDB** (almeno `*.parquet` e `cursor.json`: poche decine di MB) — è il dato che costa 8 ore ricostruire.
- [ ] Scrivere la procedura di **ripristino** (dove si mettono i file nel volume `yaca_tmdb`, quali permessi, e che il daemon va lasciato ripartire pulito) e provarla almeno una volta su un volume di prova.
- [ ] Aggiungere la verifica di "backup recente" al monitoraggio esterno (se il file più recente ha più di N giorni, allarme).

## 3. Minore (log fuorviante nel modulo `anime-source`)

- [ ] In `services/anime-source/cli.js:250,300` il log stampa `[matched: ${result.matchedCount}]`: su un **inserimento nuovo** `matchedCount` è 0, quindi sembra un fallimento mentre invece il documento è stato creato. Distinguere `created` da `updated` (il dato c'è già: `upsertedId`).

---

## Stato al 2026-09-22 (aggiornamento, non riscrivere le caselle sopra: restano come promemoria)

**Fatto:**
- `yaca-backup.timer` **installato e attivo** su `mate`: dump MongoDB ogni notte alle ~03:32, retention 14 giorni, destinazione `/srv/yaca/backups-local`.
- **Restore provato davvero**: archivio ripristinato in un database di prova → 31.281 documenti, 0 falliti, 18 collezioni, `streambadges` 24798 e `anime_airing_state` 60 come attesi. Il db di prova è stato eliminato.
- `yaca-dump-backup.timer` (~04:30, file leggeri: parquet, cursore, liste anime) e `yaca-dump-backup-full.timer` (domenica ~05:00, `--full`) **installati e attivi**; sottocartelle `tmdb/parquet/`, `tmdb/jsonl/`, `anime-source/` con retention separate.
- **Gate sui dump incompleti** implementato e verificato: i `master_*.jsonl` si salvano **solo** se `cursor.json` attesta `completed.movies && completed.tv`. Provato oggi: il gate ha correttamente saltato i jsonl (cold start ancora in corso) mentre parquet e liste passavano.
- Due bug del vecchio script trovati eseguendolo la prima volta: `--entrypoint mongodump` obbligatorio (l'entrypoint dell'immagine `mongo:7` cambia utente → `permission denied`), e in systemd **`EnvironmentFile` vince su `Environment=`**, quindi la destinazione va nel `.env`.

**Ancora aperto:**
- **Off-site**: i backup sono sul **disco dei dati** → coprono l'errore umano, non la morte del disco. In attesa del service account Google Drive (il piano è nel ticket; servono il JSON della chiave e l'ID della cartella).
- **Procedura di restore dei file**: documentata in testa a `ops/yaca-dump-backup.sh` (`docker cp` inverso) ma **non ancora provata** su un ripristino reale.
- **Monitoraggio "backup recente"**: nessun controllo automatico che avvisi se un backup non è stato fatto per N giorni.
- Il punto 1 (riavvii a metà dump) resta tutto da fare: scrittura atomica, `tv.parquet.bak`, stato "dump in corso", filtro `paths` su `deploy.yml`.

### Aggiornamento serale (2026-09-22, dopo il passaggio a Google Drive)

- **Off-site FATTO**: destinazione su **Google Drive** via **OAuth** (il service account non può scrivere su Drive personale: quota zero — errore `storageQuotaExceeded`). Token in `/root/.config/rclone/rclone.conf` (600, root).
- **Restore verificato DA DRIVE**: archivio scaricato da Drive e ripristinato in un db di prova → 32.378 documenti, 0 falliti, 18 collezioni (`userlibraryitems` 169, `anime_airing_state` 941, `streambadges` 24798), db di prova eliminato.
- **Struttura su Drive**: `mongo/`, `tmdb/parquet/`, `tmdb/jsonl/`, `anime-source/` — sottocartelle separate perché la retention di `rclone delete` è **ricorsiva**: il backup Mongo scriveva nella radice e avrebbe cancellato anche gli altri artefatti (corretto).
- **Misurato l'upstream di casa: ~0,3 Mbps.** Conseguenza da decidere: il backup settimanale dei `master_*.jsonl` (~800 MB) impiegherebbe **~6 ore**. Proposta: **comprimere prima dell'upload** (gzip: ~200 MB → ~1,5 ore), oppure accettare che il ripristino del dump richieda il cold start (i parquet, che sono ciò che YACA usa davvero, sono già salvati ogni giorno e sono piccoli).
- **Ancora aperto**: il controllo automatico "backup recente" (nessuno avvisa se un backup non parte) e tutto il punto 1 (riavvii a metà dump).

### Backup automatici: SOSPESI (2026-09-22 sera) — cosa serve per riprenderli

**Stato**: i tre timer sono **disabilitati** su `mate` (`systemctl disable --now yaca-backup.timer yaca-dump-backup.timer yaca-dump-backup-full.timer`). Gli script e le unità restano nel repo (`ops/yaca-backup.sh`, `ops/yaca-dump-backup.sh` + unità) e funzionano: sono solo spenti. Una copia locale esiste in `/srv/yaca/backups-local/` (dall'ultima esecuzione riuscita).

**Cosa funziona già**: dump Mongo (con `--entrypoint mongodump`), backup dei file (parquet, cursore, liste) con **gate** sui dump incompleti, sottocartelle per tipo (`mongo/`, `tmdb/parquet/`, `tmdb/jsonl/`, `anime-source/`), retention separate, e **restore verificato** (32.378 documenti ripristinati, 0 falliti). Tutto tranne il pezzo Google.

**Cosa blocca: la destinazione Google Drive.** Due trappole in fila, entrambe risolte solo in parte:
1. **Service account su Drive personale**: quota zero → `Error 403 storageQuotaExceeded`. Vale solo per Shared Drive di Workspace. (La chiave sta in `~/.pi/agent/skills/backup-drive/secrets/` e su `/srv/yaca/secrets/`.)
2. **OAuth con il client pubblico di rclone**: l'upload funziona come meccanismo (token in `/root/.config/rclone/rclone.conf` su `mate`), ma il progetto Google di rclone (`projects/202264815644`) ha la **quota per progetto condivisa con tutti gli utenti rclone del mondo** → `Error 403 RATE_LIMIT_EXCEEDED`, e rclone entra in un ciclo di retry che rispedisce lo stesso file per mezz'ora (visto: 1,47 GB inviati per un file da 58 MB).

**Le quattro uscite, con i costi**:
- **(a)** client OAuth tuo + **pubblicare** l'app: quota tua e token che non scadono, ma Google pretende home page, privacy policy, ToS e **domini autorizzati/verificati** → serve un dominio dell'utente (e le pagine le può scrivere l'agente).
- **(b)** client tuo in **Testing**: quota tua, i 403 spariscono, ma il token scade ogni **7 giorni** → ri-autorizzo settimanale a mano.
- **(c)** restare su rclone con la sua quota condivisa: nessun setup, ma i file grandi **falliscono nelle ore di punta** (alle 02:30 UTC probabilmente passa). Mitigazioni: comprimere i `jsonl`, `RuntimeMaxSec=` sul servizio per non farlo girare mezz'ora, retry brevi.
- **(d)** provider diverso (Backblaze B2: 10 GB gratis, S3, zero burocrazia): i dati veri sono **<1 GB**, quindi basta. È la strada più corta e la raccomandazione dell'orchestratore.

**Diagnostica che ha smascherato il problema** (da riusare): `ss -tinp | grep rclone` → se `bytes_sent` è molte volte la dimensione del file, **non è lento, è un ciclo di retry**. E per misurare la linea senza inquinare: fare il test **prima** di lanciare altri upload (la prima misura, 0,3 Mbps, era falsata dall'upload in corso; la linea vera fa ~19 Mbps in salita).

**Comando per riaccendere** (una volta risolta la destinazione): `sudo systemctl enable --now yaca-backup.timer yaca-dump-backup.timer yaca-dump-backup-full.timer`
