Status: resolved
Type: grilling
Blocked by: 11

# 17 — L'export statico del client: chi lo serve

## Perché

Questa domanda stava nel fog della mappa («l'export statico del frontend: resta servito da Express o diventa
un suo contenitore/CDN?») e **non è fog**: è già tagliente, ha un costo preciso, ed è un confine — chi serve
il client. Il test di wayfinder è «sai formularla adesso?», e la risposta è sì. Quindi diventa un ticket.

## I fatti, ad oggi

- `frontend/out` è l'**export statico** di Next (`next build` con export), **non versionato**
  (`git ls-files frontend/out` → 0) e **escluso** dal `.dockerignore`;
- è costruito nello **stage 1 del `Dockerfile`** (`frontend-builder`: `npm install` + `npm run build`) e
  copiato nel runner con `COPY --from=frontend-builder /app/frontend/out ./frontend/out`;
- è servito dall'**app Express**: `app.use(express.static(path.join(__dirname, 'frontend', 'out')))` e una
  catch-all che manda `index.html` per ogni percorso che sembra una pagina (`index.js`, ultime righe di
  rotte);
- quindi **client e addon Stremio escono dallo stesso processo, dalla stessa porta e dalla stessa origine**:
  nessun CORS, nessun dominio separato, un solo deploy, e un `docker-compose` con un servizio solo.

## La domanda

L'export statico **resta servito dall'app**, o diventa un servizio suo (contenitore `nginx`/`caddy`, o CDN)?

## Cosa pesa nella risposta

- **Il costo di separarlo**: un secondo servizio da costruire e deployare (la CI diventa due immagini), il
  CORS da configurare fra le due origini, il cookie di sessione (`yaca_session`) da rendere cross-site o da
  passare per un proxy — cioè **autenticazione e cookie**, che oggi funzionano perché l'origine è una sola;
- **il guadagno**: l'app smette di servire file statici (irrilevante: sono piccoli e la cache HTTP c'è già),
  e il client si può aggiornare senza riavviare un processo che carica DuckDB in RAM per minuti — **questo è
  il vero argomento**, ed è l'unico che vale la pena misurare: quanto costa oggi un rilascio di solo frontend
  (boot dell'app: conversione TMDB + DuckDB in RAM, minuti);
- **l'addon**: Stremio chiama `manifest.json` e `/catalog/…` **sull'app** — se il client va altrove, quei
  percorsi restano comunque dell'app, e le due cose non si confondono;
- **il ticket 11** cambia le rotte che il client nomina (superficie di dominio): è il momento giusto per
  guardare il confine dall'altro lato, ed è il motivo del blocco.

## Come si verifica

La decisione è presa quando si può dire, in una riga, **chi serve il client** e **perché** — con l'argomento
che ha vinto (rilascio indipendente? semplicità? cookie?) e il costo che si accetta (CORS, cookie cross-site,
seconda immagine in CI). Se la risposta è «resta com'è», allora va scritto **nel `Dockerfile` e nel `README`**
che è una scelta, non un residuo: è la differenza fra un confine e una cosa che non è mai stata guardata.

---

## La revisione esterna consiglia: **resta dentro Express** (17/10/2026)

L'argomento, che è forte e verificabile: oggi `yaca_session` è un cookie `HttpOnly` **sulla stessa origine**
(`src/api/auth/index.js:26-41`); separare il client significa proxy/CORS/cookie cross-site **e** una seconda
immagine in CI/watchtower — per un guadagno quasi nullo (l'app non serve file statici in modo costoso).

E soprattutto: **il fastidio vero non è il client, è il boot di `yaca-app`** (minuti: conversione dei parquet
TMDB e DuckDB in RAM). Quel fastidio si cura in un altro modo, che vale per *tutti* i deploy e non solo per il
frontend: **persistere il file `.duckdb` già inizializzato sul volume** (`/data/tmdb`, quello di `yaca_tmdb`) e
ricostruirlo solo quando i parquet cambiano. Se quella strada funziona, questo ticket si chiude con «resta
com'è, ed ecco perché» — che è comunque una risposta, ed è quella che mi aspetto.

## Esito (17/10/2026)

### 1. La Decisione: Resta dentro Express
Si accoglie pienamente la raccomandazione: **l'export statico del frontend resta servito da Express**, all'interno dello stesso processo e sullo stesso container dell'addon Stremio.

**I motivi che hanno vinto**:
1. **Autenticazione same-origin priva di attriti**: il cookie `yaca_session` è `HttpOnly` e opera sulla stessa identica origine. Separare il client imporrebbe `SameSite=None; Secure`, gestione del blocco dei cookie di terze parti sui browser moderni (Safari ITP, Brave) oppure l'introduzione di un reverse proxy dedicato (Nginx/Caddy), introducendo un ulteriore elemento di fragilità infrastrutturale.
2. **Deploy atomico e singolo artefatto CI**: oggi un commit su `main` genera una singola immagine Docker `yaca` su GHCR, aggiornata atomicamente da Watchtower sul `mate`. Separare il client richiederebbe una seconda immagine (`yaca-frontend`), un secondo workflow GitHub Actions e coordinamento di versioning per evitare disallineamenti tra schema API e dashboard.
3. **Overhead statico trascurabile**: `frontend/out` è un export statico leggero (<15 MB), servito con caching HTTP (`max-age`). Il consumo di CPU e memoria del server Express per la consegna degli asset è irrilevante rispetto al resto del runtime.
4. **Il vero problema è ortogonale al client**: la tentazione di separare il frontend nasceva dal boot pesante del container `yaca-app`. Ma separare il client per velocizzarne i rilasci è una soluzione palliativa al problema sbagliato: il boot lento va risolto alla radice ottimizzando la persistenza del catalogo TMDB/DuckDB sul volume.

### 2. La Misura del Boot in Produzione
Misurazione effettuata senza riavvii né perturbazioni dell'ambiente di produzione, interrogando i log temporizzati del container `yaca-app` sul server `mate`:

```bash
ssh mate 'docker logs -t yaca-app 2>&1 | grep -E "DuckDB|Tier2|YACA Server in esecuzione|TmdbDump" | head -20'
```

Dall'ispezione dello stato del container (`StartedAt: 2026-10-17T07:34:06.824Z`):
- **07:34:07.993Z (+1,17 s)**: `🚀 YACA Server in esecuzione su http://localhost:7860`. Il socket HTTP Express apre l'ascolto in poco più di 1 secondo.
- **07:34:08.082Z – 07:34:22.395Z (+14,31 s)**: Conversione JSONL in Parquet (`[DuckDB Convert]` elabora 97.876 movie in 11,9 s e 19.651 serie in 2,4 s). In questa fase DuckDB non è ancora pronto (`[DuckDB Store] DB non inizializzato`).
- **07:34:22.413Z – 07:34:25.576Z (+3,16 s)**: Inizializzazione modulo DuckDB in RAM, caricamento tabelle da parquet, creazione indici FTS e tabella `anime_mappings`.
- **07:34:25.576Z (+18,75 s)**: `[TmdbDump] DuckDB riavviato con successo e connesso ai nuovi Parquet`. **A 18,8 secondi dal boot DuckDB è pienamente operativo** (perfettamente coerente con lo `start_period: 25s` configurato nell'healthcheck di Docker Compose).
- **07:34:25.576Z – 07:34:57.542Z (+31,97 s)**: Ricostruzione indice Tier 2 su SQLite FTS5 (`titles_fts5.db`, 1.494.167 record analizzati in 31,97 s).
- **07:34:57.542Z (+50,72 s)**: Indice Tier 2 completato, avvio sync giornaliero TMDB Changes.

**Sintesi numerica del boot attuale**:
- **Socket HTTP / Static Server**: pronto in **1,2 s**.
- **Cataloghi DuckDB in RAM**: pronti in **18,8 s**.
- **Indice Tier 2 SQLite**: pronto in **50,7 s**.

### 3. Cosa è stato Documentato e Dove
La scelta è stata esplicitata nei punti nevralgici del progetto per certificarla come confine architetturale permanente:
- **`Dockerfile`** (riga 47): commentato il passo `COPY --from=frontend-builder /app/frontend/out ./frontend/out` evidenziando i tre pilastri (cookie same-origin, singola immagine Docker, overhead trascurabile).
- **`README.md`**: annotata la riga dell'Architettura Frontend SPA nei Documenti Chiave e aggiornato lo schema ASCII dell'Architettura di Sistema per esplicitare che `app` serve anche l'export statico.
- **`docs/FRONTEND.md`**: espansa la sezione *Architettura Generale* indicando la decisione consapevole di confine del ticket 17.

### 4. Proposta: Persistenza di `.duckdb` su Volume (Ticket Dedicato)
Il collo di bottiglia del boot (18,8 s per DuckDB, 50,7 s per Tier 2) non dipende dal frontend ma dal ciclo di `TmdbDumpDaemon` che, riscontrando `isFirstRun`, ricompila i Parquet da JSONL e rigenera le tabelle `:memory:` e gli indici FTS anche quando i dati su disco non sono variati.

**Cosa cambierebbe**:
1. **Database su file persistente**: DuckDB non viene aperto con `:memory:`, bensì su file persistente `/data/tmdb/catalog.duckdb` situato nel named volume `yaca_tmdb` (accanto a `movies.parquet`, `tv.parquet` e `cursor.json`).
2. **Bypass della conversione al boot**: `isFirstRun` controlla l'esistenza di `catalog.duckdb` e la freschezza rispetto ai JSONL. Se il database è integro e aggiornato, DuckDB si connette immediatamente senza invocare `scripts/convert_to_parquet.js` né ricreare gli indici FTS da zero.
3. **Bypass Tier 2 se invariato**: `titles_fts5.db` (176 MB) non viene rigenerato se il daily export TMDB `.json.gz` ha la stessa data dell'ultimo run registrato in un file di metadati.

**Dove vivrebbe**:
- File `/data/tmdb/catalog.duckdb` nel volume `yaca_tmdb`.

**Criterio di accettazione numerico**:
- Al riavvio del container (`docker restart yaca-app`), delta timestamp da `StartedAt` a `[DuckDB Store] Inizializzazione completata`: **< 2,0 secondi** (rispetto agli attuali **18,75 s**, una riduzione >89%).
- Zero secondi spesi in `[DuckDB Convert]` all'avvio su dataset preesistente.
