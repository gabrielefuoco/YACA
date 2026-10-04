# Timer Doppiaggi ITA: Scraper Periodico & Unione Anime

Questo documento descrive il funzionamento, l'architettura, l'installazione, la verifica e la disinstallazione del timer di sistema per il modulo **`services/doppiaggi-source`** su ambiente Linux (host home server `mate`).

---

## 1. Cos'è e Obiettivo Operativo

Il servizio `services/doppiaggi-source` è il componente autonomo di YACA incaricato di costruire la verità sul doppiaggio italiano per film, serie e anime:
1. **Scraping cortese degli indici**: scarica le 79 pagine d'indice de *Il Mondo dei Doppiatori* (`antoniogenna.net/doppiaggio/`) con delay di 800 ms, connessione singola e `User-Agent` identificativo.
2. **Parsing & Disambiguazione**: applica le tre regole misurate (rimozione tag senza spazi, normalizzazione articolo invertito italiano e inglese, estrazione anno esatto di disambiguazione).
3. **Matching contro il catalogo**: incrocia le schede con i dump JSONL del catalogo YACA (`master_movies.jsonl`, `master_tv.jsonl`), producendo match `true` o `null` (omonimia irrisolta).
4. **Unione Anime**: interroga in sola lettura la collezione `anime_airing_state` su MongoDB Atlas (AnimeUnity) integrando gli anime doppiati col veto serie (`maxEpisodeNumber > 3` → `tv`).
5. **Scrittura atomica & Guardia**: produce il file `ita_annotations.jsonl` e il relativo file `ita_annotations.meta.json` accanto ai dump, con una guardia sul calo dei `true` (−2% → abort con exit code 2).

### Cadenza Operativa
Come stabilito nelle decisioni di cortesia e aggiornamento quotidiano (ticket 05 / 07):
- **Due passate al giorno: alle 04:00 e alle 16:00**.
- La cadenza dimezza la latenza di ricezione dei nuovi doppiaggi (massimo 12 ore) con un impatto di sole 158 richieste al giorno verso la fonte.

---

## 2. Architettura del Deploy: Perché Systemd Timer

A differenza del modulo gemello `services/anime-source` (che opera come demone persistente in container Docker `yaca-anime-source` con polling ogni 3 ore per le serie in corso), `doppiaggi-source` è stato implementato come **Systemd Timer + Oneshot Service**:

1. **Esecuzione episodica batch vs Demone 24/7**:
   L'esecuzione con cache calda richiede circa **6 secondi** (o 1-2 minuti in caso di riscaricamento indici). Tenere un container Docker Node.js sempre allocato in RAM per girare 12 secondi al giorno sprecherebbe circa 150–250 MB di memoria su un server a risorse limitate (8 GB RAM totali condivisi con OS, app, Redis e altri servizi).
2. **Accesso diretto ai dump del catalogo**:
   Il modulo ha bisogno di leggere `master_movies.jsonl` (~308 MB) e `master_tv.jsonl` (~50 MB) e di scrivere `ita_annotations.jsonl` nello stesso percorso. Eseguendosi nativamente come servizio systemd sull'host (con Node.js già disponibile a livello di sistema), accede direttamente al volume Docker `yaca_tmdb` (`/var/lib/docker/volumes/yaca_tmdb/_data` o `/data/tmdb`) senza la complessità di dover orchestrare mount e container effimeri.
3. **Coerenza con le operazioni esistenti**:
   Segue esattamente il pattern consolidato degli altri job batch schedulati di YACA (`ops/yaca-backup.*` e `ops/yaca-dump-backup.*`).

---

## 3. Componenti nel Repository (`ops/`)

- [`ops/yaca-doppiaggi.sh`](../ops/yaca-doppiaggi.sh): Wrapper bash eseguibile.
  - Carica le variabili da `/srv/yaca/.env` (in particolare `MONGODB_URI`).
  - Forza IPv4 su Node (`NODE_OPTIONS=--dns-result-order=ipv4first`) per evitare problemi di routing IPv6 casalingo.
  - Risolve automaticamente il percorso dei dump catalogo controllando `/data/tmdb`, `/var/lib/docker/volumes/yaca_tmdb/_data` o la cache locale.
  - Effettua il bootstrap automatico di `npm install --omit=dev` nella cartella del servizio se `mongodb` non è presente.
  - Supporta passthrough di argomenti CLI (es. `--health-check`, `--dry-run`, `--force-refresh`).
- [`ops/yaca-doppiaggi.service`](../ops/yaca-doppiaggi.service): Unità systemd di tipo `oneshot`.
- [`ops/yaca-doppiaggi.timer`](../ops/yaca-doppiaggi.timer): Timer systemd configurato su `OnCalendar=*-*-* 04,16:00:00` con `Persistent=true` e jitter di 60s.

---

## 4. Installazione sul Server (`mate`)

Dalla cartella principale del progetto sul server (`/srv/yaca`):

```bash
# 1. Rendere eseguibile lo script wrapper
chmod +x /srv/yaca/ops/yaca-doppiaggi.sh

# 2. Copiare le unità systemd nella directory di sistema
sudo cp /srv/yaca/ops/yaca-doppiaggi.service /etc/systemd/system/
sudo cp /srv/yaca/ops/yaca-doppiaggi.timer /etc/systemd/system/

# 3. Ricaricare la configurazione di systemd
sudo systemctl daemon-reload

# 4. Abilitare e avviare il timer
sudo systemctl enable --now yaca-doppiaggi.timer
```

---

## 5. Verifica e Monitoraggio

### 5.1 Verifica dello stato del Timer
Per verificare che il timer sia attivo e visualizzare il prossimo orario di scatto (04:00 o 16:00):
```bash
systemctl list-timers yaca-doppiaggi.timer
# oppure
systemctl status yaca-doppiaggi.timer
```

### 5.2 Esecuzione manuale di prova
Per innescare immediatamente un ciclo senza attendere l'orario prefissato:
```bash
# Tramite systemd
sudo systemctl start yaca-doppiaggi.service

# Oppure direttamente tramite lo script wrapper
sudo /srv/yaca/ops/yaca-doppiaggi.sh
```

### 5.3 Controllo dei Log
Per visualizzare i log dettagliati dell'ultimo ciclo:
```bash
journalctl -u yaca-doppiaggi.service -n 100 --no-pager
```

### 5.4 Verifica Battito di Salute (`--health-check`)
Il modulo scrive un battito di salute in `last-run.json`. È possibile interrogarlo in qualsiasi momento (restituisce exit 0 se l'ultimo giro è avvenuto da meno di 24 ore):
```bash
sudo bash /srv/yaca/ops/yaca-doppiaggi.sh --health-check
```

> Nota (03/10/2026): il `bash` davanti non è un vezzo. Lo script era committato **senza il bit
eseguibile**, quindi il comando senza `bash` rispondeva `comando non trovato` — la verifica di fine
mappa `doppiaggio-ita` se n'è accorta. Il bit ora c'è, ma la riga resta con `bash` perché funzioni
anche se il file viene copiato perdendo i permessi.

### 5.5 Ispezione dei file prodotti
I file vengono scritti accanto ai dump JSONL:
```bash
# Ispezione conteggio righe
wc -l /var/lib/docker/volumes/yaca_tmdb/_data/ita_annotations.jsonl

# Statistiche salvate nel metadato
cat /var/lib/docker/volumes/yaca_tmdb/_data/ita_annotations.meta.json
```

A ogni giro scritto nasce anche `ita_annotations.diff.json`: **quali titoli hanno cambiato
doppiaggio** (diventati doppiati / non più doppiati), cioè quali poster composti vanno rifatti.
È calcolato *prima* della riscrittura del `.jsonl` (è l'unico momento in cui su disco c'è ancora il
giro precedente) e nel `journalctl` la riga da cercare è `[Diff] N cambi di doppiaggio in questo giro`.

```bash
# I cambi dell'ultimo giro
cat /var/lib/docker/volumes/yaca_tmdb/_data/ita_annotations.diff.json
```

Dal lato dell'app, `scripts/push-diff-in-coda.js` legge quell'artefatto e mette in coda
(`src/cache/codaEventi.js`) un evento per ogni cambiamento, così i poster vengono ricomposti senza
aspettare il TTL.

**Dal 04/10/2026 la push è dentro il giro** (`ops/yaca-doppiaggi.sh`, passo 8), non più un comando a
mano. Finché era manuale i poster cambiati restavano vecchi finché qualcuno non se ne ricordava — e
il diff è un **delta**: un cambiamento riportato in un giro non ricompare in quello dopo, quindi una
push dimenticata è una perdita **permanente** (quel poster resta vecchio fino al TTL della sua fascia,
che per un titolo concluso è **200 giorni**). Gira dentro `yaca-app` perché lì ci sono le tre cose che
servono: le dipendenze dell'app (ioredis), la rete del compose e il volume `yaca_tmdb` su `/data/tmdb`.

Lo script **aspetta che Redis sia connesso** (`--attesa-redis <ms>`, default 10 s) prima di spingere, e
**esce 1** se un evento non è finito in coda: distinguere "era già in coda" da "non ci sono riuscito"
è l'unica cosa che impedisce a un guasto di passare per un successo. La riga finale dice tre numeri
(spinte, già in coda, falliti) e **nomina** gli eventi perduti.

A mano resta possibile, ed è idempotente (a deduplicare è la coda):

```bash
docker exec --workdir /app yaca-app node scripts/push-diff-in-coda.js --file /data/tmdb/ita_annotations.diff.json
```

---

## 6. Disinstallazione

Per disattivare e rimuovere completamente il timer dal server:

```bash
# 1. Arrestare e disabilitare il timer
sudo systemctl stop yaca-doppiaggi.timer
sudo systemctl disable yaca-doppiaggi.timer

# 2. Rimuovere i file di configurazione systemd
sudo rm -f /etc/systemd/system/yaca-doppiaggi.service /etc/systemd/system/yaca-doppiaggi.timer

# 3. Ricaricare systemd
sudo systemctl daemon-reload
```
