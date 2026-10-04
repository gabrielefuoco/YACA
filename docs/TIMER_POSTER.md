# Timer Drenatore Poster: Rifare i Poster dalla Coda Eventi

Questo documento descrive il funzionamento, l'installazione, la verifica e la disinstallazione del timer di sistema per [`scripts/drena-coda-poster.js`](../scripts/drena-coda-poster.js) su ambiente Linux (host home server `mate`).

---

## 1. Cos'è e Obiettivo Operativo

I poster composti sono file statici serviti dalla rotta `/erdb-poster/<file>` (`src/api/staticPosters.js`) e, finché il titolo non cambia, quel file va bene per mesi. Ma quando un titolo **diventa doppiato** (o non lo è più) quel file è vecchio, e aspettare il TTL non è un'opzione: il catalogo darebbe una risposta con la grafica sbagliata.

Il giro di `services/doppiaggi-source` scrive a ogni passata un `ita_annotations.diff.json` con **quali titoli hanno cambiato doppiaggio**; `scripts/push-diff-in-coda.js` lo legge e mette in coda (`src/cache/codaEventi.js`, su Redis) un evento per ogni cambiamento. **`scripts/drena-coda-poster.js` è l'altra metà**: beve quella coda e rifà i file, uno per uno.

**La coda ha due produttori, non uno.** Oltre al diff, anche la rotta `/erdb-poster/<file>`: quando un file non è in cartella e l'istanza ERDB locale non lo rende entro il suo tetto di 5 s (`TIMEOUT_ERDB_MS`), la rotta risponde 404 come ha sempre risposto e **inoltra l'evento in coda** (`mettiInCoda` in `src/api/staticPosters.js`) invece di arrendersi. Il tetto di 5 s è volutamente più corto del render a freddo di un anime (8-12 s misurati, perché l'istanza ritenta sull'API degli anime irraggiungibile dal mate): senza la push quei poster resterebbero 404 per sempre, perché nessuno li produce e nessuno li chiede. Con la push il drenatore, che ha 20 s, li rende al giro dopo e la richiesta successiva arriva dalla cache. La push è lanciata e dimenticata (un guasto di Redis non può trasformarsi in un guasto della rotta) e la deduplica è della coda, quindi un utente che ricarica può ripeterla senza problemi.

- **Non è un servizio sempre acceso**: una raffica breve, un lotto piccolo, poi esce. Con coda vuota costa circa **0,7 secondi**.
- **Non lancia mai**: Redis giù, ERDB giù, evento malformato → si logga e si esce con **0**, e gli eventi restano in coda (tentativi e scarto li gestisce la coda). L'unica uscita diversa è **1**, ed è una sola: manca la base dell'istanza ERDB, cioè un errore di configurazione da correggere adesso, non un guasto da riprovare domani.
- **Non scarica niente se non serve**: se nel lotto non c'è nessun id TMDB da mappare, la mappa anime (qualche MB di mapping) non viene nemmeno caricata.

### Cadenza Operativa
Gli eventi sono **10-50 al giorno**: un giro ogni **10 minuti** li smaltisce tutti entro un'ora dalla produzione del diff, e un risveglio a coda vuota costa meno di un secondo. Più stretto non servirebbe, più largo farebbe aspettare troppo un poster già enqueued.

---

## 2. Architettura del Deploy: Perché Systemd Timer, e Perché Dentro il Container

Come gli altri job batch schedulati di YACA (`ops/yaca-doppiaggi.*`, `ops/yaca-backup.*`, `ops/yaca-dump-backup.*`) il lavoro è un **Systemd Timer + Oneshot Service**: dieci minuti di lavoro al giorno non giustificano un container sempre allocato su un server da 8 GB.

La differenza rispetto agli altri timer è **dove** gira il processo. `yaca-doppiaggi.service` chiama Node direttamente sull'host, ma lì il modulo ha le sue dipendenze e i suoi file. Il drenatore, invece, è uno script **dell'app** e ha bisogno di tre cose che sull'host non ci sono:

1. **Le dipendenze dell'app**: `ioredis` per la coda e `better-sqlite3`/DuckDB per la mappa anime. Sono dentro l'immagine `ghcr.io/gabrielefuoco/yaca`, compilate per quella piattaforma.
2. **La rete del compose**: `REDIS_URL=redis://redis:6379` e `redis` è un nome interno della rete Docker — dall'host non si risolve.
3. **La cartella dei poster**: `ERDB_CACHE_DIR=/data/erdb-cache` è il volume `yaca_erdb_cache`, cioè **la stessa cartella che serve la rotta `/erdb-poster/<file>`**. Fuori dal container quel percorso non esiste; il drenatore scriverebbe file che nessuno vedrebbe mai.

Per questo `ExecStart` è un `docker exec` dentro il container `yaca-app`: è l'unico posto dove le tre cose sono già vere. Le variabili d'ambiente arrivano con `-e`, dallo stesso `/srv/yaca/.env` che il compose passa a `yaca-app`: il drenatore e l'app non possono così leggere due configurazioni diverse.

Il `--dry-run` esiste per lo stesso motivo: dentro un timer un errore non gestito accenderebbe la pagina dei failed e l'unico che la guarda è un umano che non c'è.

---

## 3. Componenti nel Repository (`ops/`)

- [`ops/yaca-poster-eventi.service`](../ops/yaca-poster-eventi.service): unità systemd `oneshot`.
  - `EnvironmentFile=-/srv/yaca/.env`: da lì arrivano `ERDB_LOCAL_BASE` e `ERDB_CACHE_DIR`, passate dentro il container con `-e`.
  - `ExecStart=/usr/bin/docker exec --workdir /app -e ERDB_LOCAL_BASE=… -e ERDB_CACHE_DIR=… yaca-app node scripts/drena-coda-poster.js`.
  - `Restart=no`: Redis o ERDB giù non fanno fallire l'unità (lo script esce 0). Se `docker` non è in `/usr/bin` sul server, va cambiato quel percorso.
  - `TimeoutStartSec=15min`: il default (90 s) taglierebbe un giro che sta caricando la mappa anime; a tagliare sul serio c'è già il watchdog interno dello script (10 minuti).
  - `StandardOutput/StandardError=journal`: `journalctl -u` basta.
- [`ops/yaca-poster-eventi.timer`](../ops/yaca-poster-eventi.timer): timer systemd su `OnCalendar=*-*-* *:00,10,20,30,40,50:00`, con `Persistent=true` e `RandomizedDelaySec=30`.

### Le due variabili d'ambiente

Vanno nel `.env` del server (`/srv/yaca/.env`), accanto alle altre:

```bash
# Base dell'istanza ERDB locale, COL TOKEN dentro il path (senza si prende un 404 su ogni
# poster). La base deve essere raggiungibile DA DENTRO il container yaca-app: se l'istanza ERDB
# sta sulla stessa rete compose del progetto `yaca`, si usa il nome del suo servizio
# (non 127.0.0.1: dentro il container quello è l'app stessa).
ERDB_LOCAL_BASE=http://erdb:3000/Tk-<tuo-token>

# Cartella dei poster già composti, servita da /erdb-poster/: dentro il container è il volume
# yaca_erdb_cache. Se la omitti, lo script usa il suo default, che è lo stesso (/data/erdb-cache).
ERDB_CACHE_DIR=/data/erdb-cache
```

Il drenatore non accetta una base senza token e non ha un default di comodo: senza, ogni richiesta sarebbe un 404 e la coda consumerebbe i suoi 5 tentativi per evento per scoprire ogni volta la stessa cosa. Per questo l'assenza è un errore **rumoroso** (exit 1 con il messaggio che spiega cosa mettere dove).

---

## 4. Installazione sul Server (`mate`)

Dalla cartella principale del progetto sul server (`/srv/yaca`):

```bash
# 1. Copiare le unità systemd nella directory di sistema
sudo cp /srv/yaca/ops/yaca-poster-eventi.service /etc/systemd/system/
sudo cp /srv/yaca/ops/yaca-poster-eventi.timer /etc/systemd/system/

# 2. Ricaricare la configurazione di systemd
sudo systemctl daemon-reload

# 3. Abilitare e avviare il timer
sudo systemctl enable --now yaca-poster-eventi.timer
```

Prima conviene accertarsi che `ERDB_LOCAL_BASE` e `ERDB_CACHE_DIR` siano nel `/srv/yaca/.env` (vedi §3): senza la base il primo giro esce 1 e lo dice.

---

## 5. Verifica e Monitoraggio

### 5.1 Verifica dello stato del Timer
```bash
systemctl list-timers yaca-poster-eventi.timer
# oppure
systemctl status yaca-poster-eventi.timer
```

### 5.2 Esecuzione manuale di prova
Per innescare immediatamente un ciclo senza attendere i dieci minuti:
```bash
# Tramite systemd
sudo systemctl start yaca-poster-eventi.service

# Oppure, come fa la unit, direttamente nel container
cd /srv/yaca && docker exec --workdir /app yaca-app node scripts/drena-coda-poster.js
```

### 5.3 Prova a mano senza toccare nulla (`--dry-run`)
Il `--dry-run` prende gli eventi e **dice** quali file scriverebbe: nessun download, nessuna scrittura, nessun `done`/`fail`. Serve a verificare base e cartella **prima** di lasciare girare il timer:
```bash
cd /srv/yaca && docker exec --workdir /app \
  -e ERDB_LOCAL_BASE="$(grep '^ERDB_LOCAL_BASE=' /srv/yaca/.env | cut -d= -f2-)" \
  yaca-app node scripts/drena-coda-poster.js --dry-run
```
Se la coda è vuota l'ultima riga è `coda vuota: niente da rifare`. Altrimenti elenca un `da rifare <file> (n/N)` per ogni file che il giro vero avrebbe scritto.

### 5.4 Controllo dei Log
Il log del drenatore finisce tutto nel journal della unit (stdout e stderr):
```bash
# Ultime righe dell'ultimo giro
journalctl -u yaca-poster-eventi.service -n 100 --no-pager

# Solo dalla unit appena abilitata
journalctl -u yaca-poster-eventi.service -f
```
**Se non funziona, il primo posto da guardare è questo.** La riga di chiusura di ogni giro è il riepilogo:
```
[Drena] 6 presi, 6 resi, 0 falliti — out=/data/erdb-cache
```
e, quando qualcosa non torna, dice perché: `motivi: http_404=6, timeout=2`, `avvisi: redis=1`, `mappa anime NON pronta (store_non_pronto su 4 eventi…)`. **`avvisi: redis=1` non è una coda vuota**: è una coda che non si è potuta leggere, e la differenza è tutta lì.

### 5.5 Quando qualcosa non funziona
| Cosa si vede | Cosa significa | Cosa fare |
|---|---|---|
| exit 1 e `CONFIGURAZIONE: manca la base dell'istanza ERDB locale` | manca `ERDB_LOCAL_BASE` nel `.env` (o la variabile non è passata dentro il container) | metterla in `/srv/yaca/.env`, riavviare la unit |
| `docker exec`: `No such container: yaca-app` | il container dell'app non è acceso | `docker compose up -d app` |
| `avvisi: redis=1` | Redis non raggiungibile | controllare `docker compose ps redis` |
| `motivi: http_404=N` quasi tutti | base ERDB sbagliata (manca il token nel path, o host/porta non è quello) | riverificare `ERDB_LOCAL_BASE` con un `curl` |
| `mappa anime NON pronta` | la mappa TMDB→Kitsu non è stata caricata in tempo: i poster anime di quel giro hanno solo il lato TMDB | il giro successivo la ricarica; se persiste, guardare il `journalctl` del servizio |
| la unit è `failed` ma il journal è vuoto | il problema è a monte del drenatore (Docker, container) | `systemctl status yaca-poster-eventi.service` |

---

## 6. Disinstallazione

Per disattivare e rimuovere completamente il timer dal server:

```bash
# 1. Arrestare e disabilitare il timer
sudo systemctl stop yaca-poster-eventi.timer
sudo systemctl disable yaca-poster-eventi.timer

# 2. Rimuovere i file di configurazione systemd
sudo rm -f /etc/systemd/system/yaca-poster-eventi.service /etc/systemd/system/yaca-poster-eventi.timer

# 3. Ricaricare systemd
sudo systemctl daemon-reload
```

La coda non si svuota disinstallando il timer: gli eventi restano in Redis e vengono presi al giro successivo, quando il timer torna su. Se non torna mai più, vanno presi a mano con `docker exec … node scripts/drena-coda-poster.js`.
