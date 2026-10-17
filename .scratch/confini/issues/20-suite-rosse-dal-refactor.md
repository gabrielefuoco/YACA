Status: ready-for-agent
Type: task

# 20 — Le suite che il refactor ha lasciato rosse

## Perché

La revisione di fine lavori (17/10/2026) ha eseguito **la suite intera** — cosa che nessuno aveva fatto durante la
notte, dove si sono corsi i file singoli. Risultato:

```
Test Suites: 6 failed, 1 skipped, 176 passed, 182 of 183
Tests:       13 failed, 3 skipped, 1797 passed
```

L'handoff del 17/10 dichiarava **4 suite rosse preesistenti**: quindi almeno due sono nostre. E leggendo i
fallimenti, l'attribuzione è questa:

| suite | fallimento | causa | di chi è |
|---|---|---|---|
| `heroPolicyAndTrakt` | `Expected "…heroes_v2_movie_kids"` / `Received "…heroes_v14_movie_kids_a_neutral"` | il test asserisce la **stringa della chiave di cache**, che è cambiata (v2 → v14 + il suffisso dei selettori) | **12 / 38-coda** |
| `heroPolicyAndTrakt` | `TypeError: buildHybridCatalog is not a function` | il builder è diventato una **voce del modulo pool** e non è più esportato | **12** |
| `heroDiversity` | `Expected 6 / Received 7` su `schemaVersion` | `HERO_CACHE_SCHEMA_VERSION` è stato alzato | **38-coda** |
| `heroDiversity` | «deduplica i quattro fallback freddi anche quando i builder falliscono» | il percorso dei fallback freddi è cambiato | **12** |
| `resilienceAuditFixes` | «manifest stream resource declaration includes anime» | **il 05 ha tolto `stream` da `buildManifest`** | **05 — e questa è una DECISIONE, non un test** |
| `heroMovieDateRegression` | 4 fallimenti su `releaseInfo` / pagina non azzerata | da attribuire: l'annotazione degli item è passata per il pool | **12 / 38-coda** (da verificare) |
| `metaHandlerEpisodeIds` | `Expected "1668", "tv", "test-key"` | da attribuire (il meta handler non è stato toccato: potrebbe essere preesistente) | **da verificare** |
| `searchTier2Merge` | ordinamento locale/Tier 2 e «indice assente» | da attribuire (`CatalogRouter` + tier2; il 10 ha toccato `src/api/tmdb.js`) | **da verificare** |

## La domanda vera, prima delle altre

`resilienceAuditFixes` contiene un test che si chiama *«manifest stream resource declaration includes anime»*: cioè
**qualcuno aveva dichiarato la risorsa `stream` nel manifest di proposito**, e il ticket 05 l'ha tolta (su consiglio
della revisione esterna: «se rimuovi `streamHandler`, togli anche la voce dal manifest»).

**Una dichiarazione nel manifest è un contratto con Stremio**: togliendola, i client smettono di vedere la risorsa.
La rotta c'è ancora (tre righe inline, `res.json({ streams: [] })`), quindi il gesto non rompe i client che hanno il
manifest in cache — ma **i nuovi client non chiederanno più gli stream**, e per un addon questo è un cambio di
superficie. Va deciso: o si **rimette** la dichiarazione (la rotta c'è, e risponde vuoto), o si **accetta** di non
esporre la risorsa e si aggiorna il test spiegando perché.

**Questa decisione è già in produzione** (il 05 è stato pushato alle 07:20): quindi non è teoria.

## Cosa deve uscire

1. **La decisione sulla risorsa `stream`**, presa e scritta (con il perché), e il test allineato di conseguenza.
2. **Le altre suite**: ognuna sistemata nella direzione giusta — e la direzione giusta è *aggiornare il test quando
   asserisce un dettaglio che il refactor ha cambiato di proposito*, oppure *sistemare il codice quando il test
   asserisce un comportamento che doveva restare*. La differenza va detta caso per caso, non decisa in blocco.
3. **L'attribuzione delle due «da verificare»**: eseguire i due file sul commit `03b14c0` (prima della notte) e
   dire se erano rossi anche lì. Se lo erano, sono preesistenti e si dichiarano tali; se no, sono nostre.
4. **Il numero finale**: la suite intera deve tornare a **4 suite rosse preesistenti** (o meno, se qualcuna delle
   quattro era già stata sistemata). Il comando è `npx jest --forceExit --silent` (~2 min 35 s), e va eseguito
   **prima e dopo**.

## Come si verifica

Il conteggio della suite intera prima e dopo (non i file singoli: è proprio la corsa per-file che ha lasciato
passare queste), e per ogni suite toccata il fallimento citato **con la sua riga** nel ticket.

## Nota di metodo

Questo ticket esiste perché la revisione di fine lavori ha fatto la cosa che l'anello veloce non fa: **la suite
intera**. Le prove per-file sono giuste per lavorare e insufficienti per chiudere: dieci ticket integrati in fila
si vedono solo insieme.

---

## La domanda sulla risorsa `stream`: RISOLTA (17/10/2026) — non è una decisione da riprendere

Verificata col proprietario e **con la documentazione della repo stessa**:

- `docs/STREMIO_INTERNALS.md:80` → *«**YACA non fa più da proxy ai flussi** (commit `6443a87`). `streamHandler.js` è
  oggi un guscio di 31 righe che ritorna `{ streams: [] }`»*. La dichiarazione `{ name: 'stream', types:
  ['movie','series','anime','other'], idPrefixes: ['tt','tmdb:','kitsu:'] }` è **il residuo di quell'epoca**: quei
  prefissi servivano a far arrivare al proxy le richieste di flusso in tutte le forme che sapeva leggere;
- **non serve agli anime**: il routing dei metadati anime passa dal **`meta`** (dichiarato con `anime`/`other` e il
  prefisso `kitsu:`, `docs/STREMIO_INTERNALS.md:139`), e gli stream anime li servono **altri addon** (Anime Kitsu,
  Torrentio) sulle loro richieste, coi prefissi del provider (`§2`). La risposta di YACA è vuota per costruzione;
- il test che la difendeva è una **regex sul testo del sorgente**, aggiunta in `6a614e6` (*«snapshot del lavoro in
  corso prima del merge dei fix»*): fotografa com'era, non dice perché.

**Quindi**: il ticket 05 ha fatto bene, non c'è niente da rimettere, e il lavoro di questo ticket su quella voce è
**allineare il test** citando `6443a87` e `docs/STREMIO_INTERNALS.md:80` — altrimenti il prossimo che lo legge crede
che sia stata tolta una cosa viva. La rotta resta (tre righe inline, `{streams: []}`): è la regola della doc,
*payload vuoto con 200, mai un errore*.
