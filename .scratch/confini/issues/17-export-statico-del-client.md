Status: ready-for-agent
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
