Status: ready-for-agent
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
