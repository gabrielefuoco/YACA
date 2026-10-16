Status: resolved
Type: task
Blocked by: 04

# 05 — La root e i file spuri

> **Premessa corretta dall'inventario (04), 17/10/2026.** Questo ticket doveva cancellare il codice morto di
> `src/`: **non c'è** (zero moduli irraggiungibili da `index.js` o dai test). Il peso è altrove — **13 artefatti
> tracciati in git che non dovrebbero esserlo**, **8 test orfani**, i file spuri della root e un guscio di
> codice che finge di essere vivo (`streamHandler`, 31 righe che restituiscono sempre `{streams: []}`).

## Perché

Alla root convivono il prodotto e i residui di dieci sessioni: `blank.pdf` (362 KB, **tracciato in git**),
`untitled.md` (0 byte), `frontend.pdf`, `digest.txt` e `digest_7.txt` (~950 KB di digest di codice),
`bash.exe.stackdump`, `.pytest_cache/`, `misura-tempi-cataloghi.md`, `misura-tipo-ita.md`, `todo grafo.md`,
`Ottimizzazione e Futuro del Grafo YACA.md` (52 KB). Chi apre la repo non sa cosa è prodotto e cosa è
appunto — ed è il primo confine che si incontra, prima ancora di leggere una riga di codice.

## La domanda

Cosa resta alla root, e dove va il resto?

## Cosa deve uscire

Applicando l'inventario del ticket 04 (`ricerche/01-inventario.md`, con un comando di prova per ogni riga):

- **i 13 artefatti tracciati in git che non dovrebbero esserlo**, ognuno con chi lo legge e come si rigenera.
  Due avvertenze: il più grosso **non** è `src/data/bolle.json` (3,27 MB) ma
  **`.scratch/mappa-pesata/bolle-nuovi.json` (34,3 MiB)**, scritto da uno script e letto da nessuno; e
  `.scratch/` è **la memoria di altre mappe** (una cartella per sforzo) — prima di toccare qualcosa lì dentro,
  guarda a quale mappa appartiene. `src/data/bolle.json` e `src/data/hierarchical_graph.json` seguono il
  destino dei ticket **09** e **02**: non si cancellano qui;
- **gli 8 test orfani**: 5 che importano i 3 moduli non raggiungibili dal prodotto, 3 che importano script
  one-off. Un test che collauda codice irraggiungibile è codice irraggiungibile a sua volta — ma si cancella
  **dopo** aver guardato cosa asserisce: può essere l'unica descrizione di una regola;
- **`streamHandler`**: decidere se è un guscio da cancellare o una funzione da riempire. Non è una pulizia, è
  una decisione — una rotta di stream che risponde vuoto è una rotta che Stremio vede;
- **i file spuri della root**: `untitled.md`, `frontend.pdf`, `digest*.txt`, `bash.exe.stackdump`,
  `.pytest_cache/`, `blank.pdf`. L'inventario sa chi legge ciascuno; per `untitled.md` e `frontend.pdf` **non
  ha trovato chi li ha generati** — vanno guardati, non indovinati;
- **i documenti di lavoro** (`misura-tempi-cataloghi.md`, `misura-tipo-ita.md`, `todo grafo.md`,
  `Ottimizzazione e Futuro del Grafo YACA.md`): in `.scratch/`, che è dove sta il *percorso*, nella mappa a cui
  appartengono. `Ottimizzazione e Futuro del Grafo YACA.md` va **letto prima di decidere**: se contiene
  decisioni ancora valide, va in `docs/`;
- **la regola, scritta**: cosa può stare alla root di YACA. Proposta: il codice d'ingresso (`index.js`), la
  configurazione (`package.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `eslint.config.js`), le
  cartelle di primo livello e **nient'altro** — più il `README.md`, che è l'unico md ammesso.

## Come si verifica

`git status --short` pulito alla fine (niente file nuovi non tracciati alla root), e un `ls` della root che
contiene solo le voci della regola. Prima di cancellare un file tracciato: `git log --oneline -1 -- <file>`
per sapere cosa si sta buttando, e il comando dell'inventario che dimostra che nessuno lo legge.

## Nota

`secrets.env` e `.env` sono alla root e **non sono tracciati** (verificato il 17/10/2026): non toccarli, ma
verifica che `.gitignore` li copra ancora.

---

## Emendamenti — revisione esterna del 17/10/2026 (verificati sul codice)

### 1. Gli otto «test orfani» sono **tre**, e due di quelli non si toccano

**Verificato**:

- `src/utils/mongoConnect.js` e `src/utils/retry.js` **non sono irraggiungibili in pratica**: sono usati da
  script **vivi** che restano — `scripts/find_user.js`, `scripts/fetch_catalogs.js`,
  `scripts/backfill-airing-anime.js`, `scripts/qa/lib/atlas.js`, `scripts/backfill-mediatype-anime.js` (e altri).
  Quindi i loro test **restano**;
- `src/utils/tasteClusters.js` è uno **shim di 7 righe** (`module.exports = require('../dna/dnaEngine')`). I due
  test che lo importano — `tests/characterization/dnaCharacterization.test.js` e
  `tests/characterization/dnaEngineExtraction.test.js` — **non collaudano codice morto: collaudano il DNA**, che
  è vivo. Il lavoro giusto è: cambiare il `require` dentro quei due test e **cancellare lo shim** (e
  `tests/tasteClusters.test.js` se duplica).

### 2. `streamHandler`: la rotta resta, il file no

Se si cancella `src/handlers/streamHandler.js` va tolta la voce `stream` da `buildManifest`
(`src/api/stremio.js:325`) — **ma la rotta** `/:userHandle/stream/:type/:id.json`
(`src/api/stremio.js:437-440`) **resta**, con un `res.json({ streams: [] })` inline di tre righe: i client
Stremio con un manifest in cache continuano a chiamarla finché non lo aggiornano, e un 404 è peggio di una
risposta vuota.

### 3. `migrate_library_itemid_null.js` ha un helper sotto test

`tests/ticket14CatalogFixes.test.js:5` importa `normalizeLegacyId` da lì: quel test va guardato **prima** di
cancellare lo script (se collauda anche il prodotto, l'helper si sposta, non muore).

---

## La regola della root

Alla root di YACA possono risiedere **esclusivamente**:
1. **Entry point di esecuzione**: `index.js`, `start.sh`.
2. **Configurazioni e contratti di build/runtime/tooling**: `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `secrets.env.example`, `.gitignore`, `eslint.config.js` (e i file locali ignorati coperti da `.gitignore`: `.env`, `secrets.env`).
3. **L'unico file markdown documentale**: `README.md`.
4. **Cartelle di primo livello del repository**: `src/`, `tests/`, `docs/`, `ops/`, `scripts/`, `services/`, `frontend/`, `graph/`, `public/`, `offline_graph_builder/`, `todo/`, `.scratch/`, `.agents/`, `.github/`, `node_modules/`.

Tutto il resto (documenti di lavoro, note di sessione, report di misura, fixture, blob di dati o file spuri) deve vivere dentro `.scratch/` o `docs/`, mai alla root.

---

## Esito (17/10/2026)

### 1. File cancellati dal repository (`git rm`)
Prima di ogni rimozione è stato eseguito `git log --oneline -1 -- <file>`:
- `blank.pdf` (362 KB): `b14968b docs(raccomandazione): il grafo, le bolle e la misura onesta — 32 report` — file PDF binario esportato da conversazione esterna, mai dovuto entrare in git. Rimosso con `git rm blank.pdf`.
- `src/handlers/streamHandler.js` (31 righe): `6443a87 refactor(stream): via la sonda torrent dal percorso degli stream` — guscio vuoto che rispondeva `{ streams: [] }`. Rimosso con `git rm src/handlers/streamHandler.js`.
- `src/utils/tasteClusters.js` (7 righe): `4ead42d refactor(dna): il motore matematico vive in src/dna/dnaEngine.js (passo 2, ticket 22)` — thin-shim di re-exporting verso `src/dna/dnaEngine`. Rimosso con `git rm src/utils/tasteClusters.js`.
- `tests/tasteClusters.test.js`: `3c41f5d feat(multivector): modulo di clustering deterministico sparse VSM e guardie di isteresi` — test orfano della sola shim `tasteClusters.js`, duplicato integralmente nei 40 test di `tests/characterization/dnaCharacterization.test.js`. Rimosso con `git rm tests/tasteClusters.test.js`.

### 2. File spuri e non tracciati della root verificati
- `untitled.md` (0 byte): file vuoto non tracciato nel checkout originale, non presente nel worktree.
- `frontend.pdf` (419 KiB): esportazione di una conversazione con Gemini sui rilievi frontend; verificato che il contenuto è già stato interamente analizzato, estratto e tracciato in `.scratch/frontend-verifica/ricerche/01-verifica-rilievi-frontend-pdf.md`. Non fa parte del codice di prodotto.
- `digest.txt`, `digest_7.txt`, `bash.exe.stackdump`, `.pytest_cache/`: file temporanei/cache/dump ignorati da `.gitignore`, non presenti nel worktree.

### 3. Artefatti pesanti de-indicizzati da git (`git rm --cached`)
- `.scratch/mappa-pesata/bolle-nuovi.json` (34,3 MiB blob git / 38,6 MB su disco): `adc5868 feat(coerenza): l'embedder delle keyword funziona, il reranker no, e il costo e' 23 minuti` — output di ricerca orfano dell'effort concluso `mappa-pesata`, generato da `colloca-nuovi.py` e non letto da nessuno script o modulo. Rimosso dall'indice git con `git rm --cached .scratch/mappa-pesata/bolle-nuovi.json` (preservando il file locale) e aggiunto a `.gitignore`.
- Nota: `src/data/bolle.json` e `src/data/hierarchical_graph.json` **non sono stati toccati**, come prescritto dai ticket 09 e 02.

### 4. Documenti di lavoro spostati (`git mv`)
- `misura-tempi-cataloghi.md` → `.scratch/documenti-origine/misura-tempi-cataloghi.md` (`c7677fb docs(tempo): dove va il tempo di risposta di un catalogo (ticket 06)`): report delle misure dei tempi sui cataloghi (`ops/timing/`).
- `misura-tipo-ita.md` → `.scratch/documenti-origine/misura-tipo-ita.md` (`a33338d merge(tipo): il tipo dell'anime si perde in tre punti, e 35 film doppiati restano senza badge`): analisi sul tipo anime per i badge ITA.
- `Ottimizzazione e Futuro del Grafo YACA.md` → `.scratch/documenti-origine/Ottimizzazione e Futuro del Grafo YACA.md` (`30761aa docs(grafo): la specifica e i 22 ticket della fase servibile`): trascrizione della sessione di handoff e risposta dell'esperto sul grafo di raccomandazione. Aggiornati i percorsi relativi in `.scratch/bolle-nitrile/fai-digest.py`, `.scratch/mappa-pesata/fai-digest.py` e `.scratch/modulo/fai-digest.py`.
- `todo grafo.md` → `.scratch/todo-grafo/todo grafo.md` (`117d62f docs(todo-grafo): la seconda revisione dell'esperto — 18 ticket, e la conclusione di prodotto ribaltata`): documento sorgente dell'effort `todo-grafo`.

### 5. `streamHandler` e `src/api/stremio.js`
- Eliminato l'import di `streamHandler` in `src/api/stremio.js`.
- Rimosso `'stream'` dalle `resources` di `buildManifest` (`resources: ['catalog', 'meta']`).
- Mantenuta la rotta compatibile `/:userHandle/stream/:type/:id.json` inline in 3 righe (`res.json({ streams: [] })`) senza query a MongoDB, garantendo risposta immediata HTTP 200 con `{ streams: [] }` ai client Stremio con manifest in cache.

### 6. Test mantenuti e corretti
- `tests/characterization/dnaCharacterization.test.js`: modificato il `require` per puntare direttamente a `../../src/dna/dnaEngine`. Tutti i 40 test passano con successo (0.67s).
- `tests/characterization/dnaEngineExtraction.test.js`: rimossi il `require` della shim eliminata e le relative asserzioni referenziali/numeriche. Tutti i 7 test rimasti passano con successo (0.94s).
- `tests/mongoConnectRetry.test.js` (7 test) e `tests/retry.test.js` (14 test): **mantenuti intatti**; i moduli `src/utils/mongoConnect.js` e `src/utils/retry.js` sono utilizzati attivamente da script vivi (`find_user.js`, `fetch_catalogs.js`, `backfill-airing-anime.js`, `qa/lib/atlas.js`, `drop-streambadges.js`).
- `tests/stremioProtocolFixes.test.js`: verificata la rotta stream inline (6/6 test passati).

### 7. Test dipendenti dalle eliminazioni del ticket 06 (non toccati)
Nessun file sotto `scripts/**` è stato modificato o eliminato, in quanto di competenza esclusiva del ticket 06. Di conseguenza sono stati lasciati invariati i seguenti 3 test che importano script one-off:
- `tests/ticket14CatalogFixes.test.js`: importa `normalizeLegacyId` da `scripts/migrate_library_itemid_null.js`.
- `tests/backfillMediatypeAnime.test.js`: importa `scripts/backfill-mediatype-anime.js`.
- `tests/seedLearnedNames.test.js`: invoca `scripts/seed_learned_names.js`.
Quando il ticket 06 interverrà su quegli script, dovrà estrarre `normalizeLegacyId` o adeguare i relativi test.

