# Mappa: i confini di YACA — moduli, contratti, e ciò che non serve più

**Aperta**: 17/10/2026 · **Natura**: cambiamento sul posto — ogni ticket decide un confine **e lo applica**
**Origine**: «penso ci sia qualche problema di fondo su responsabilità tra frontend e backend e separazione
dei moduli» — da lì una sessione di charting con sette decisioni.

## Destination

YACA con i confini dove servono:

- il **motore delle raccomandazioni è un servizio** con un contratto stretto — titoli + opzioni entrano,
  liste spiegate escono — e l'artefatto smette di essere un file del prodotto;
- il **frontend è un client** che nomina solo il dominio e **mai** l'infrastruttura;
- il **vecchio stack** (DNA · grafo delle keyword · scoring) ha un confine anche lui, e il feed smette di
  conoscerne gli interni;
- la repo non contiene più ciò che nessuno raggiunge, e `docs/` descrive il grafo nuovo.

La destinazione è un **codice** più che un documento: ogni ticket taglia un confine e lo applica.

## Notes

**Regole di lavoro che valgono per ogni ticket di questa mappa.**

- **Un confine per volta, mai un big bang.** Il merge su `main` va in produzione **da solo** (CI → ghcr →
  watchtower sul mate, `.github/workflows/deploy.yml`): ogni ticket lascia il prodotto funzionante, e il
  boot dura minuti (conversione TMDB, DuckDB in RAM) — aspettare prima di provare.
- **Verificare eseguendo, non leggendo**: `docker exec yaca-app node -e "…"` per far girare il codice
  deployato. Nove modifiche fatte a naso su un percorso non hanno spostato un numero; la prima esecuzione
  dentro il container ha dato la risposta in trenta secondi.
- **Test veloci, sempre**: pytest ~3 s per 22 test, un file jest ~4 s. **Mai** `tsc`/`npm run build`
  nell'anello (sono build: minuti; il frontend lo verifica la CI).
- **La chiave di cache va alzata** ogni volta che cambia *cosa entra* in una struttura memorizzata
  (`HERO_CACHE_KEY_VERSION` e sorelle). Dieci volte il 17/10, dieci volte è stata la differenza fra un fix
  che funziona e uno che non produce effetto.
- **Un `node -e` che carica un modulo del prodotto NON esce**: `src/cache/cacheInstances` apre ioredis (e i
  modelli mongoose) e l'event loop resta vivo — quindi un `node -e "require('./src/api/…')"` stampa la sua
  riga e poi appende la shell **per sempre** (successo il 17/10/2026: otto ore di comando bloccato). Chiude
  sempre con `process.exit(0)`, e nei comandi lunghi metti un `timeout`.
- **Un agente "fermo" può aver già finito**: il watchdog del 17/10/2026 ha dichiarato «nessun progresso da 43
  minuti» su un agente che **stava lavorando e aveva già committato** — guardava un file di attività che non si
  aggiornava, non l'agente. Prima di cancellarlo, **chiedi lo stato**: una domanda da tre righe ha salvato quattro
  suite allineate.
- **Nei `printf`/`echo` di bash i backtick eseguono**: una riga di documentazione scritta con i backtick ha
  *lanciato* i comandi che nominava (per fortuna innocui). Per il testo con backtick, usa un heredoc col
  delimitatore **quotato** (`<<'EOF'`).
- **Un test che dipende dall'ambiente è verde in CI e rosso sulla macchina di chi lavora**: `tests/ricercaDoor`
  passa solo perché `.cache/tmdb/` è vuoto, e dove i dati ci sono l'indice vero risponde e le sue asserzioni
  cadono. È il contrario di quello che serve (ticket 29).
- **Le sonde sbagliano più del codice**: il 17/10/2026 le mie tre sonde hanno stampato `slugAdditivi: undefined`,
  un `Object.keys` che non elencava i metodi dell'istanza, e un `exit=1` che era il caso *documentato* di
  configurazione mancante. Prima di dichiarare un guasto, **verifica la sonda** — e se la sonda è sbagliata,
  scrivilo: una sonda imprecisa che *sembra* un guasto è il modo in cui ci si mette a cercare un bug che non c'è.
- **Trappole già pagate**: gli hero sono definiti in **dieci** posti (nove derivati da `src/catalog/registry.js`,
  il decimo — `HERO_PRIORITY` — no, ed è quello che decide *quale percorso* prende un catalogo); `tv` e
  `series` sono la stessa cosa con due nomi; gli id dei cataloghi del prodotto sono `tmdb:<id>` nella forma
  **breve** (`src/catalog/providers/DuckDbProvider.js:292`).
- **Skill da consultare**: `codebase-design` (dove passa una giuntura, cosa è un modulo profondo);
  `ponytail` (la soluzione più pigra che funziona — questa mappa è a rischio di sopra-ingegneria);
  `matebook` (deploy, stato, diagnosi sul mate); `diagnosing-bugs` (se il ticket 38 — le righe serie che si
  perdono a valle — torna sul tavolo); `orchestration`/`subagent-orchestration` se il lavoro si delega.

**Consegna ad altre mappe**: il ticket 39 della mappa `suggerimenti` (gli slider nell'interfaccia) resta di
quella mappa, ma questa gli passa il contratto: gli slider viaggiano nella **richiesta di costruzione** del
pool, non sono un dettaglio del prodotto.

## Decisions so far

### 1. La destinazione: confini e contratti — non microservizi pieni

**Scelto il 17/10/2026, in charting.** Lo split a processo separato si fa **solo dove il runtime o il profilo
di risorse lo impone**. YACA è già mezzo spacchettata: `docker-compose` ha `app` (Node: addon Stremio + API +
export statico di Next *nello stesso processo*), `anime-source` (servizio separato, immagine propria) e
`redis`. L'unico confine che il runtime impone oggi è Python ≠ Node: `graph/` è Python e nessun punto di
`src/` lo invoca.

**Scartato**: microservizi pieni (auth, metadati, poster, DNA, admin come servizi) — orchestrazione,
osservabilità e contratti di rete per un guadagno che i confini danno comunque; e il dump TMDB in RAM
dovrebbe comunque stare da qualche parte.

### 2. Il grafo è un servizio, e l'artefatto diventa interno al modulo

**Scelto il 17/10/2026.** Il motore espone un contratto (`semi + medium + opzioni → liste di titoli spiegate`)
e `src/data/bolle.json` — oggi un file del prodotto, 3,2 MB, **tracciato in git** e letto da `Bolle.js` a
runtime — diventa un dettaglio interno del modulo.

**Il modulo si chiama quando si costruisce il pool** (cache-miss), non a ogni richiesta di Stremio: il
prodotto memorizza la risposta, come già fa con `HERO_CACHE_KEY_VERSION`. Così la separazione non entra nel
percorso caldo.

Motivo dichiarato: *«se in futuro cambia qualcosa nel codice che genera le raccomandazioni, al backend e al
frontend non cambia niente»*.
→ ticket **01**, **07**, **08**, **09**.

### 3. Il contratto: liste spiegate; la composizione resta al prodotto

**Scelto il 17/10/2026.** Il motore risponde con **liste spiegate** — per ogni lista il ruolo, il mondo, la
descrizione, l'attivazione, la mediana dei voti, i semi; per ogni titolo l'id e il perché. La **composizione**
(anno, popolarità, poster, filtro ita, dedup con la libreria, formattazione Stremio) resta al prodotto, che è
l'unico che ha TMDB e DuckDB. Il motore decide **dove guardare e in che ordine**, il prodotto **cosa mostrare**.

**Scartato**: soli id nudi (la semantica «perché questo titolo è qui» non avrebbe più una fonte e il prodotto
la reinventerebbe); card pronte (il modulo si prenderebbe TMDB, poster, lingua e ita — cioè diventerebbe lui
il prodotto).
→ ticket **01**.

### 4. Il frontend nomina il dominio, mai l'infrastruttura

**Scelto il 17/10/2026.** Regola secca: il client non chiama **mai** `/api/tmdb/*`, `/api/sync/*`,
`/api/validate-*`, `/api/clear-cache`, `/api/preview-catalog`, `/api/stremio-addon-update`. Parla una lingua
di dominio (`GET /api/dashboard`, `POST /api/dashboard/preview|save`, `POST /api/sync`) e il server compone.
Il client conserva solo stato di UI.

**Misurato oggi** (`frontend/src`): 13 chiamate a `/api/profiles/*`, più `tmdb/batch-details`,
`tmdb/batch-keywords`, `tmdb/search/*`, `sync/global-queue`, `sync/enrich`, `validate-tmdb-key`,
`validate-mistral-key`, `clear-cache`, `stremio-auth`, `stremio-addon-update`, `preview-catalog`. Il client
conosce TMDB, la coda di sincronizzazione, la cache e le chiavi: è un orchestratore, non un disegnatore.
→ ticket **03**, **10**, **11**.

### 5. Il vecchio stack: confine ora, sostituzione misurata in una mappa sua

> **Superata il 17/10/2026** dal ticket [02 — Il modulo pool](issues/02-modulo-pool.md) della mappa `confini`:
> si costruiva un confine attorno a ciò che si ritira — impalcatura attorno a una demolizione. Si estraggono
> invece **le regole che sopravvivono** (il modulo pool) e i **fatti della libreria** (che hanno un modulo
> loro). La sostituzione misurata resta di un'altra mappa, come diceva questa decisione.

**Scelto il 17/10/2026.** Il feed ha **12 righe hero** (6 coppie) in `src/catalog/registry.js`: il grafo nuovo
ne serve **2** (*Il tuo mondo*, *Un passo fuori*), il vecchio stack ne serve **8** — `yaca_true_blend`
(*Scelti per te*, `trueBlend`), `yaca_seed_network` (stacking), `yaca_hidden_gems` (`hiddenGems`),
`yaca_trakt_filtered` (*Suggeriti dalla Community*, «filtrati col tuo **DNA**»).

**Quindi non è codice morto: è l'80% del feed.** Il DNA attraversa `dnaEngine` → `ProfileBuilder` →
`ProfileScorer` → `engines/hybrid/catalogStrategies.js` (1700 righe) → `duckDbStore`, `AiDiscoveryProvider`,
`catalogSorting`. In questa mappa riceve un **confine** (contratto dichiarato come quello del motore nuovo);
la **misura** «il grafo batte il vecchio dove c'è storia?» e il **ritiro progressivo** delle righe sono di
un'altra mappa (vedi *Out of scope*).
→ ticket **02**, **12**.

### 6. Questa mappa esegue: ticket = decisione + applicazione

**Scelto il 17/10/2026.** Wayfinder di norma produce decisioni, non deliverable; questa mappa lo override
qui: la destinazione è un codice diverso, e una mappa che decide soltanto lascerebbe i confini scritti in un
ticket e mai nel codice. Ogni ticket quindi: decide il confine, lo taglia, sistema i test, e si chiude con il
prodotto funzionante.

### 7. L'ambito: tutto — confini, pulizia, assetto, docs

**Scelto il 17/10/2026.** Un confine che nessuno documenta e un file che nessuno importa sono lo stesso
disordine. Entrano quindi anche: pulizia della root e dei file tracciati in git che non dovrebbero esserlo,
codice irraggiungibile, `scripts/`, l'assetto delle cartelle (`graph/` → `services/`, la rinomina del codice
del grafo delle keyword), e `docs/` da riallineare (il grafo nuovo non c'è: `docs/` fermo dal 07/10).

### 8. Il contratto del motore è scritto — liste dal motore, righe dal prodotto

**Risolto il 17/10/2026 (ticket [`01 — Il contratto del motore`](issues/01-contratto-del-motore.md)).**
Il contratto vive in [`contratto-motore.md`](contratto-motore.md). Tre cose decise, e una scoperta che le ha
rese necessarie:

- **liste e righe non sono la stessa cosa**: il motore restituisce **una lista per mondo** (col suo ruolo,
  la sua spiegazione e i suoi titoli), il prodotto decide quali diventano righe. Il motore non impara i nomi
  dei cataloghi (`yaca_mondi_*`), che vivono in `registry.js` e in altri nove posti. Conseguenza: ogni titolo
  porta il **punteggio** di attivazione, se no il prodotto non può fondere due liste senza rompere l'ordine;
- **vocabolario strutturato**: `{tmdbId, medium}` con `movie`/`series`, mai stringhe con prefisso — la forma
  dell'id ha già fatto sparire le serie una volta. **L'anime resta un'annotazione del prodotto**: il modulo
  Python non ha la tabella anime;
- **risposta parziale con motivo**: `200` con `liste` e `motivi[]`, non-200 solo per guasti veri, tetto 10 s
  al cache-build, e **nessun ripiego popolare**. Le liste `uscite_nuove` e `nicchia_di_qualita` le riempie il
  motore coi suoi dati e le marca `parziale`: il `da_comporre` del ponte JS sparisce con il ponte.

Scoperta di contorno che vale per il ticket 07: il costo del motore è il **caricamento** (~20 s, una volta),
non la risposta — è ciò che rende il servizio persistente la scelta giusta al posto dell'avvio di un processo
per costruzione.

### 9. I moduli che restano: il pool e la libreria

**Risolto il 17/10/2026** (ticket [02 — Il modulo pool](issues/02-modulo-pool.md)). Una correzione del
proprietario ha smontato il ticket com'era scritto — *«non ho capito a che ci serve creare il modulo per il
vecchio stack se poi dobbiamo rimuoverlo»* — e i fatti le danno ragione: le quattro strategie non sono
motori «semi → titoli» ma candidate-fetcher che pescano da TMDB/Trakt e restituiscono item già arricchiti,
quindi un contratto comune col motore nuovo non è raggiungibile senza riscriverle.

Si estraggono quindi **le regole che sopravvivono**:

- **il modulo pool** — `HERO_PRIORITY` (il decimo posto in cui gli hero sono definiti, e l'unico non derivato
  da `registry.js`), l'assegnazione esclusiva coi `claimedIds`, le righe additive, i limiti e il degrado di
  Trakt. Una porta sola dal feed; le strategie diventano **voci di una lista** (ritirarne una = cancellare una
  voce); il servizio del grafo si innesta lì (ticket 08). → ticket **12**
- **la libreria è un dominio** — watchlist, storico, like e love hanno un modulo che **possiede i fatti** e li
  fornisce ai profili; la storia pesata (ex `collectRealSeeds`, che abita dentro `catalogStrategies.js`, cioè
  dentro il pezzo che si ritira) è sua. Il profilo **deduce**, la libreria **fornisce**. → ticket **14**, **15**

Conseguenza di ordine: il **12** è bloccato da **02 e 15**, perché il pool deve nascere già consumando la
porta della libreria invece di un `require` provvisorio da sostituire dopo.

### 10. La superficie di dominio: risorse, non schermi

**Risolto il 17/10/2026** (ticket [03 — La superficie di dominio](issues/03-superficie-di-dominio.md)). Le
rotte si chiamano **come le cose del prodotto** — profilo, libreria, sincronizzazione, configurazione,
anteprima, ricerca — e il client compone la schermata leggendo le risorse. Motivo: la schermata cambia più
spesso del dominio, e una rotta fatta a forma di schermo sposa il server alla UI.

Due scoperte del grilling che valgono più della tabella:

- **il client ha già una porta sola**: `frontend/src/lib/api.ts` (160 righe) contiene tutte le chiamate
  infrastrutturali — il ticket 11 è un lavoro su **un file**, non su cinquanta componenti;
- **`POST /api/bolle` porta nell'API pubblica la parola interna del motore**: la rotta di dominio è
  `POST /api/mondi`. È il caso generale in una riga: il vocabolario dell'engine non entra in quello del
  prodotto.

Deciso anche: l'**anteprima** torna card **più diagnosi dei filtri** (cap ~20 card) perché è il pannello dove
si tara, e l'errore ha **una forma sola** (`{error:{code,message}}`) al posto delle tre che convivono oggi.
La tabella rotta-per-rotta è nel ticket.

### 11. La libreria possiede tutto; il profilo deduce

**Risolto il 17/10/2026** (ticket [14 — Il modulo libreria](issues/14-modulo-libreria.md)).

- **Il modulo possiede tutto**: modelli (`WatchHistory`, `UserLibraryItem`), porta di lettura, regole
d'identità (`libraryIdentity`) **e l'ingestione** (sync, conversione, admission/outcome/retry, watched). Il
costo è accettato e dichiarato: sono due mestieri con ritmi diversi, quindi il lavoro si fa in **due passi** —
**15** (modelli + porta, che sblocca il pool) e **16** (l'ingestione dentro). Il confine non cambia.
- **Il profilo deduce, la libreria fornisce**: i vettori del DNA, le fasce e `TasteProfile` restano del
profilo e si ritirano col DNA; la libreria resta pulita. La regola da scrivere, perché è quella che verrà
violata per prima: *se serve a decidere cosa mostrare, non è della libreria*.

Il territorio censito: **11 lettori diretti** dei modelli, **19 file di test**, ~8 file di ingestione, e lo
stato della conversione (`conversionAttempts`, `parkedAt`, `parkedReason`) che vive **dentro il modello**.

### 12. L'inventario: il codice morto non è in `src/`

**Risolto il 17/10/2026** (ticket [04 — L'inventario](issues/04-inventario-del-non-raggiungibile.md),
ricerca AFK; report in [`ricerche/01-inventario.md`](ricerche/01-inventario.md), 434 righe, ogni riga col
comando che la prova).

**Zero** moduli irraggiungibili sotto `src/`; i tre non raggiungibili dal prodotto sono usati da script e
test. Il peso è altrove: **19 file di `scripts/`** senza chiamante funzionale (12 nominati da nessuno,
nessuno in CI/`Dockerfile`/compose), **13 artefatti tracciati in git** che non dovrebbero esserlo — il più
grosso è `.scratch/mappa-pesata/bolle-nuovi.json` (**34,3 MiB**), non `bolle.json` — **5 test orfani**, e
**una sola** citazione di docs davvero morta. L'unico codice *comportamentalmente* morto è **`streamHandler`**,
un guscio di 31 righe.

Il vincolo che ribalta un'ipotesi del charting: **`scripts/erdb-builder/build.js` è importato da 4 file di
prodotto** — «cancellare `scripts/` tutta» avrebbe rotto il prodotto. È il motivo per cui l'inventario è
venuto prima delle forbici.

### 13. L'assetto: una cartella = un possessore, e i 19 script si cancellano

**Risolto il 17/10/2026** (ticket [06 — L'assetto delle cartelle](issues/06-assetto-delle-cartelle.md)).

- **La regola**: una cartella = un possessore, e il nome dice *cosa possiede*, non *come è fatto*. Corollario
operativo: **se non è prodotto né memoria, non esiste**.
- **L'albero**: `graph/` → `services/graph/` **senza rinominare il pacchetto** (zero modifiche ai 83 import
interni, nessun rischio sul modulo col fixture di parità: una rinomina si paga in 83 import + comandi + README
+ docs + il clone sul mate, per un nome); `src/engines/graph/` → **`src/engines/keywords/`** (quello non è un
grafo di raccomandazioni, è una gerarchia di keyword — è il conflitto vero fra i due `graph`);
`offline_graph_builder/` → `services/keyword-graph/`; `todo/` → `docs/TODO.md`.
- **I 19 script senza chiamante si cancellano** (14 migrazioni/riparazioni/misure del 05/10 + 5 tool della
campagna QC), ognuno con **una riga di storia e lo sha** da cui recuperarlo in `git show <sha>:…`. Il rischio
è dichiarato: per 13 su 14 l'esecuzione non è provata. **`erdb-builder` non si cancella**: è importato da 4
file di prodotto, quindi il suo codice **diventa un modulo** del prodotto.
- **`.dockerignore`**: fuori `graph/` e `offline_graph_builder/` (l'immagine dell'app non li usa, il modulo
avrà la sua dal 07), **dentro `scripts/`** — verificato: i timer fanno `docker exec … node scripts/…` e
`src/api/admin.js:74` esegue `analyze_presets.js` nel contenitore.

### 14. La revisione esterna: sei emendamenti, due rilievi respinti, e un ordine nuovo

**17/10/2026.** Una revisione di un modello di frontiera (digest di 2,06 MB, 228 file, `handoff-frontiera-yaca.md`)
ha prodotto una trentina di rilievi. **Tutti quelli verificabili sono stati verificati sul codice prima di
essere applicati** — metà del digest non era visibile al revisore (si è fermato alla sezione 3), quindi i
rilievi sulle sezioni 4-13 erano dedotti dalle citazioni: alcuni reggevano, due no.

- **Sei emendamenti al contratto** (E1–E6 in [`contratto-motore.md`](contratto-motore.md)): il **peso del seme è
  un numero** (l'etichetta butta via il decadimento misurato di `collectRealSeeds`); `"catalogo"` è un tipo di
  seme (il freddo sotto i 3 titoli, decisione 3c di `suggerimenti`); **`GET /health` porta le versioni** — ed è
  ciò che chiude il criterio di accettazione del ticket 09; `medium` **opzionale** (una sola camminata invece di
  due); **un guasto transitorio non si memorizza** (il TTL è **7 giorni**, `src/config.js:39`: senza questa
  regola un `503` durante il boot lascia le righe vuote per una settimana); e l'invariante **«nel pool non
  entrano stringhe»**, che lega il ticket 38 al 08 e al 12 — è la stessa riga di codice.
- **Un difetto di sicurezza, confermato**: `src/api/profiles.js` **non ha nessuna verifica di sessione** (zero
  occorrenze di `jwt`/`cookie`; l'utente arriva da `req.query.userId`/`req.body.userId`) e lo stesso fa
  `GET /sync-status/:userId`. **Chiunque può leggere e scrivere la libreria di chiunque.** Diventa il **primo**
  criterio di accettazione del ticket 10, dove le rotte nuove non hanno `:userId` nel percorso.
- **Tre ticket corretti** (tutti verificati): il **05** non cancella `mongoConnect`/`retry` (usati da script
  vivi) né i test di caratterizzazione del DNA (lo shim `tasteClusters` è di 7 righe e i test collaudano il DNA
  vivo), e `streamHandler` lascia la rotta con tre righe inline; il **06** deve impostare `PYTHONPATH=services`
  (i percorsi del modulo sono relativi alla CWD) e spostare sul mate anche i 138 MB di dati — e va applicato
  **prima** del 07; il **16** chiude la domanda aperta sui poster (restano fuori dalla libreria) e aggiunge uno
  scrittore che l'elenco non aveva (`syncAllStremioData`, chiamato anche dal motore).
- **Due rilievi respinti coi fatti**: il client **non** calcola i vettori DNA (`syncVectors` è definito e
  **non ha chiamanti**: sono rotte da spegnere, non da riportare) e il TTL non è di 12 ore ma di **7 giorni** —
  il problema è più grave di come lo descriveva.
- **L'ordine dei lavori cambia**, per due ragioni verificate: il **38 va diagnosticato prima di 08 e 12** (i
  loro criteri di collaudo confrontano conteggi: senza il 38 non si distingue una guarigione da una
  regressione), e il **06 va applicato prima del 07** (il 07 scriverebbe percorsi che il 06 sposta).

### 15. L'esecuzione: cosa è entrato, e cosa la misura ha cambiato

**17/10/2026**, quattro ticket in parallelo su worktree isolati (slave `agy`), integrati uno alla volta dal
committente, con l'ordine della decisione 14 rispettato.

- **05** — root pulita (4 file cancellati, 34,3 MiB fuori dal tracking), `streamHandler` ridotto a tre righe
  inline. *I «test orfani» erano tre, non otto*: `mongoConnect`/`retry` e i test di caratterizzazione del DNA
  sono vivi (decisione della revisione, verificata prima di applicarla).
- **06** — l'assetto: il modulo in `services/graph/` (rinomine, pacchetto intatto), `keywords/`, 19 script via
  con la loro storia e lo **sha di recupero**, `erdb` promosso a modulo. *Il `git mv` non porta i 666 MB non
  tracciati*: spostati a mano, con le regole di `.gitignore` — e la pipeline risponde dalla root
  (`PYTHONPATH=services`) vedendo il canone.
- **38** — **la causa vera non era quella dedotta dalla revisione**: non la forma degli id, ma **il cap
  applicato prima dei filtri** (con `anime: 'exclude'`, 18 dei primi 20 id erano anime → ne restavano 2-3;
  con `anime: 'neutral'` la stessa richiesta ne restituisce 20). Misurato sul deploy, non dedotto. Il medium
  perso dalle stringhe era un **secondo** difetto, reale e corretto. Il ticket resta aperto: la parte che
  resta è del **12**, e ora è scritta lì.
- **15** — il modulo libreria e la porta di lettura: zero asserzioni cambiate, zero lettori dei modelli fuori
  dal modulo.
- **l'IDOR chiuso** (era il primo criterio del ticket 10, e non poteva aspettare la superficie nuova):
  `src/middleware/sessione.js` con `richiedeSessione`, e i **13** accessori `req.body.userId` /
  `req.query.userId` diventati `req.utenteId`. Nello stesso giro è caduto un secondo guasto che nessuno aveva
  nominato: `bolle.js` leggeva `req.cookies` che **nessuno parsava** su quel percorso, quindi
  `POST /api/bolle` rispondeva 401 sempre.

**La lezione operativa**, che vale più dei commit: le quattro smentite del modello di frontiera sono arrivate
tutte dalla stessa parte — **la misura**. Il revisore aveva visto solo le prime tre sezioni del digest; gli
slave, che avevano il codice e il container sotto mano, hanno corretto due sue deduzioni e hanno trovato la
causa vera.

## Not yet specified

- **Dove vive `hierarchical_graph.json`** (1 MB tracciato, letto da `HierarchicalGraph.js:18-20` con un
  `require` dinamico): con la fabbrica in `services/keyword-graph/` o nel prodotto? Stessa domanda del ticket
  09 per gli artefatti, e deve avere la stessa risposta.
- **Gli slider nel profilo** (ticket 39 di `suggerimenti`): dove si salva il valore, se per profilo o per
  dispositivo, e chi decide il default. Dipende dal contratto (01). Ricorda: `DELTA_FASCIA` è marcato
  **INVENTATO** in `graph/parametri.py` e va calibrato su `graph/measure/ricetta.py` prima di esporre la
  manopola — e gli assi **modulano l'attivazione, non filtrano** (mappa `suggerimenti`, §13).
- **Dove vive `hierarchical_graph.json`** (1 MB tracciato, letto da `HierarchicalGraph.js:18-20` con un
  `require` dinamico): con la fabbrica in `services/keyword-graph/` o nel prodotto? Stessa domanda del ticket
  09 per gli artefatti, e deve avere la stessa risposta.
- **[RISOLTO il 17/10/2026]** ~~`.scratch/` dentro o fuori git~~: non era una decisione, era un doc sbagliato —
  `.scratch/` **è versionata** (766 file tracciati, `git check-ignore` dice no) e `docs/INDEX.md` scriveva il
  contrario. Corretto in `docs/INDEX.md`, sezione «Come si mantengono questi documenti».
- **Come l'artefatto arriva in produzione** se esce da git: build in CI? volume sul mate? download in `ops/`?
  Dipende da 09.
- **Quale artefatto resta tracciato**: `src/data/bolle.json` (3,2 MB) è del motore nuovo,
  `src/data/hierarchical_graph.json` (1 MB) è del vecchio stack. Dipende da 09 e da 02.
- **Il vecchio stack: uno o due moduli?** DNA · grafo delle keyword da una parte, composizione del feed
  dall'altra. Dipende da 02.
- **I docs di cui nessun codice parla più**: `docs/INDEX.md` dichiara fermi da un mese `PRESETS`,
  `ALGORITHMS` e `KITSU_MAPPING`. Si cancellano o si riscrivono? Dipende da 04 e 13.
- **`.scratch/` dentro o fuori git**: `docs/INDEX.md` dice che è nel `.gitignore` e non viaggia;
  `.scratch/README.md` dice che è tracciata dal 06/10 dopo la cancellazione accidentale. Disallineamento da
  sanare (una riga, ma è la memoria del lavoro).

- **Quattro confini, ora ticket** (chiesti dal proprietario il 17/10/2026 a mappa quasi chiusa, e grillati lo
  stesso giorno): **21** il modulo profilo, **22** il modulo ricerca (e l'AI come modulo a parte, che fornisce il
  meccanismo e non i prompt), **23** il modulo catalogo (il *tipo* e la validazione: «il catalogo è un tipo, il
  feed è chi lo serve»), **24** il modulo cache (chi possiede le chiavi e i TTL). Ognuno ha il suo collaudo
  naturale già identificato: la porta della libreria per il profilo, `searchTier2Merge` per la ricerca,
  l'anteprima per i cataloghi, la trappola della chiave per la cache.
- **Il modulo configurazione utente**: le chiavi API, l'account, l'`addonUuid` e la ui state — deciso in grilling
  il 17/10/2026 che *non* stanno nel profilo (oggi non ci sono chiavi per-utente; domani, con un BYOK Mistral, è
  lì che stanno). Non ha ancora un ticket: nasce quando il 21 decide il confine col documento condiviso.

### 16. I quattro confini nuovi, e l'architettura che ne esce

**Grillati il 17/10/2026** (ticket 21–24), 20 domande in quattro giri. In una riga: **YACA diventa otto moduli,
e ognuno con un contratto** — e i confini fra loro hanno un nome.

| modulo | possiede | non possiede |
|---|---|---|
| **profilo** (21) | anagrafica, **lista e singolo profilo**, impostazioni (selettori, `kidsMode`, policy anime, **slider**), i suoi cataloghi, le deduzioni; e **il contesto** che scende a tutti | le chiavi API, l'account, la ui state |
| **configurazione utente** (ticket 26) | l'identità (`userId`, `addonUuid`), le **chiavi** (TMDB, Mistral, Stremio — oggi globali, domani BYOK), i **token di Trakt** e le preferenze (ui state). L'autenticazione tiene la **sessione** e i **flussi** che ottengono una credenziale | i `profiles[]` (regola: solo il profilo li tocca) e il `passwordHash` (il segreto che *prova* l'identità sta con chi la verifica) |
| **libreria** (15/16) | i **fatti** (visto, watchlist, segnali, identità), l'ingestione e la sua macchina a stati | le deduzioni — *il profilo deduce* |
| **indice** (22) | DuckDB + FTS5 + Tier 2 + il **compilatore** (filtri → query parametrizzata) | le risposte memorizzate |
| **ricerca** (22) | da una richiesta a una lista **ordinata** (registro delle fonti, fusione, ordinamento); porta unica `cerca({q, tipo, contesto, cap})`, vuoto con `motivi[]` | l'AI, l'indice, i provider |
| **catalogo** (23) | il **tipo** (una natura sola: anche la riga hero è un preset di sistema), la validazione (lingua × capacità dichiarate), le **derivazioni** (manifest, impronte, `getHeroPoolSpec`) | produrre titoli: *il catalogo è un tipo, il feed è chi lo serve* |
| **cache** (24) | le risposte memorizzate, con la chiave **derivata** da una descrizione | i dataset (l'indice) e la coda dei poster |
| **poster** (24) | ERDB, i file composti, la coda e il drenatore (pilotato da un timer di sistema) | — |
| **AI** (22) | il **meccanismo** (client, budget, tempi) | i **prompt**: ogni modulo tiene i suoi |
| **motore** (07/08) | il grafo e il suo portafoglio; è già un **processo a sé** | la composizione, la lingua, i poster, l'ita |

**I confini, in una riga ciascuno** — perché sono la cosa che si dimentica:

- **dato vs risposta**: l'indice possiede i file e la freschezza, la cache le risposte. Buttare la cache costa
tempo, buttare l'indice costa il prodotto.
- **fatti vs deduzioni**: la libreria fornisce i fatti, il profilo deduce.
- **meccanismo vs prompt**: l'AI fornisce il come, i moduli il cosa chiedere.
- **tipo vs servire**: il catalogo dice cosa è, il feed lo produce.
- **offerta vs richiesta**: le righe di sistema e i preset dell'utente sono la **stessa specie**, e la differenza è
  una proprietà della definizione, non un registro in più.

## Out of scope

- **La misura «il grafo batte il vecchio stack?» e il ritiro progressivo delle righe** (`trakt_filtered`,
  `true_blend`, `hidden_gems`): mappa successiva. Il suo ingresso è il confine del ticket **02** applicato
  (**12**) più una misura comparativa su un profilo con storia. Fuori ambito perché è una decisione di
  **prodotto** (quale raccomandazione è migliore), non di confine — e questa mappa non ha il modo di
  rispondere senza la misura.
- **Microservizi pieni** — scartati in charting (decisione 1).
- **Il dump TMDB / DuckDB in un processo suo**: nessun ticket qui, il confine non lo impone.
- **Riscrivere il frontend o cambiare framework**: si cambia ciò che il client **nomina**, non il client.
- **I ticket 38 e 39 della mappa `suggerimenti`**: restano di quella mappa. Il 38 (le righe serie che si
  perdono fra pool e risposta) è un bug, non un confine; il 39 riceve da qui il contratto.

## Il primo passo, quando si parte

> **Aggiornato il 17/10/2026, dopo l'implementazione.** Tutto il lavoro della notte è **in `main`** (commit
> locali, non pushati): i ticket 01–25 (il 18 aspetta lo scope `workflow`), l'IDOR chiuso, e **l'architettura a
> dieci moduli coi suoi confini** (decisione 16). **Il fronte adesso è**:
>
> 1. **27** — i tre bug della revisione (il cap prima dei filtri *nella ricerca*, la validazione che ignora le
>    query dopo la prima, la migrazione di `libraryOrder` che esce 0 su errore critico) e i **5 confini
>    dichiarati e non rispettati** (le due chiavi a mano, il pool che risolve ancora i selettori, il *servire*
>    dentro `src/catalog/`, i prompt in `src/ai/`, la cache di lookup in `duckDbStore`);
> 2. **28** — l'ultimo miglio: 5 `require` da ripuntare, 10 shim da cancellare, **il motore dentro `src/indice/`**,
>    e `src/db/queryBuilder.js` (che duplica l'SQL vecchio per non aggiornare 8 test) da cancellare;
> 3. **29** — l'ambiente della suite: i **7 lock del DuckDB** nella corsa parallela su Windows e i test **non
>    ermetici** (verdi solo perché `.cache/tmdb/` è vuoto);
> 4. **30** — il deploy del giro, con le **unità systemd** del timer dei poster sul mate;
> 5. **38** — la scelta del mondo (`il_tuo_mondo` deve scegliere il mondo *compatibile coi selettori*, non il più
>    acceso) e il **grilling del 26** (il modulo configurazione utente, sei domande scritte).
>
> *(Il testo che segue è lo stato precedente, tenuto per il racconto.)*

**Eseguito il 17/10/2026** (decisioni 14–15): in `main` sono entrati **05, 06, 07, 08, 12, 15, 16**, la parte
CI/compose del **18**, il **fix dell'IDOR** e la **diagnosi del 38**. Il servizio Python è **acceso e healthy
sul mate** (108,9 MiB) e il prodotto lo usa davvero: `yaca_mondi_series` è passata da **3 a 20 titoli**.
In corso, in parallelo: **09**, **10**, **13** e la coda del **38**.

Il resto è a valle loro:

```
10  → 11 → 17      (il client nomina il dominio; l'export statico del client)
09  → il mate      (la pubblicazione dell'artefatto, e il clone del modulo sul mate)
```

**Le cose aperte che non sono ticket** (perché non lo sono):

- **lo scope `workflow` del token di push**: senza, il workflow che pubblica l'immagine del servizio
  (`.github/workflows/deploy-graph.yml`, pronto sul ramo `activity/t18-produzione-*`) non entra in `main`.
  Fino ad allora il servizio si aggiorna con `docker compose build graph` sul mate — che funziona;
- **la verifica di E5** (guasto transitorio → cache a 60 s, non 7 giorni): il primo tentativo è stato
  **inconcludente** (la riga dei film ha risposto 20 col motore spento: probabile corsa nella prova). È in coda
  al ticket 38;
- **il clone del modulo sul mate** (`/srv/yaca/modulo/`, fermo a `ed402f5a`, con la struttura vecchia): è
  l'**officina manuale** dove vivono il venv e i 138 MB di dati. **Non c'è nessun timer né cron che esegue la
  pipeline** — verificato il 17/10/2026: `systemctl list-timers` mostra solo `yaca-poster-eventi` e
  `yaca-doppiaggi`, il crontab è vuoto, e `ops/` non la invoca. Quindi non c'è niente di rotto: c'è che
  **rigenerare l'artefatto è oggi un gesto a mano**, e chi lo fa deve allineare quel clone (pull, dati in
  `services/graph/data`, `PYTHONPATH=services`). Dove l'artefatto finisca è la decisione del ticket 09.

I motivi, che sono misure: il **38** prima di 08/12 perché quei ticket si collaudano confrontando i conteggi;
il **06** prima del **07** perché il 07 scrive percorsi che il 06 sposta; il **15/16** prima del **10** perché
se no le rotte nuove copiano la logica che il 16 sta spostando.

**Dopo il push**, sul mate: la checklist del ticket 06 — `mv /srv/yaca/modulo/graph/data
/srv/yaca/modulo/services/graph/data` (138 MB non tracciati) e `PYTHONPATH=services` per i cron che
invocano la pipeline.

**Chiusi**: 01, 02, 03, 04, 14 (grilling e ricerca). **In `main`**: 05, 06, 07, 08, 12, 15, 16, 18 (parte CI,
compose e primo avvio sul mate). Il **38** ha la sua diagnosi in `main` e la coda in corso. **In corso**: 09,
10, 13, 38-coda. **Bloccati da loro**: 11, 17.

### 17. I rilievi della revisione indipendente

**17/10/2026.** La revisione dell'implementazione (diff `338d7d4..HEAD`) è nel **ticket 27**, classificata: 5 bug
(2 corretti: la chiave di `recommendations` senza versione né media — la trappola del modulo cache, con un test
che *difendeva* il bug — e il drenatore che ingoiava i fallimenti di scrittura), **5 confini dichiarati e non
rispettati** (due chiavi costruite a mano, il pool che risolve ancora i selettori, il *servire* dentro
`src/catalog/`, i prompt della ricerca dentro `src/ai/`, una cache di lookup dentro il database store), **12
residui del trasloco** (fra cui `queryBuilder.js` che duplica l'SQL vecchio per non aggiornare 8 test, e
`profiles.js` **e** `profilo.js` entrambi montati) e **4 buchi di copertura**.

**Il metodo, che vale più dei rilievi**: due letture indipendenti dello stesso codice — i miei `grep` e la
revisione — e **le divergenze sono l'informazione**. La revisione ha trovato più di me (le due chiavi a mano, il
servire dentro il tipo, la duplicazione) e ha sbagliato una cosa (l'IDOR: il middleware c'è, 0 accessori vecchi,
12 `req.utenteId`). Ogni prova è stata **rieseguita** dal committente prima di essere accettata: nessuno dei due
creduto sulla parola.

### 18. La ricognizione col metro in mano (ticket 31)

**18/10/2026.** Misurato invece che ragionato: **152 dei 157 file di `src/` sono raggiungibili da `index.js`** —
zero codice morto per import, quindi il backend non si snellisce cancellando file irraggiungibili. Il criterio
della decisione 16 (processo separato solo dove il runtime lo impone) è stato passato a ognuna delle candidate:

- **l'indice (DuckDB + SQLite)** → **no**: +31 MiB di RSS misurati, 162 MB dei 654 dell'immagine (25%), stessa
  lingua e stesso runtime, i file già su un volume. La decisione 22 regge. Riapribile solo se una scansione
  bloccasse l'event loop per centinaia di ms (non misurato).
- **il vecchio stack (engines+handlers+pool, 6.278 righe = 17%)** → **no all'estrazione, sì alla sostituzione**:
  `src/api/stremio.js` (montato su `/`, cioè il prodotto) chiama `handlers/catalogHandler`, che chiama
  `CatalogRouter` *e* `duckDbStore`. **Non è ritirato: serve il prodotto adesso.** Estrarlo sarebbe costruire un
  confine attorno a ciò che si sta ritirando (la lezione del ticket 02). Il lavoro è finire la sostituzione e
  **poi cancellare 6.278 righe**.
- **il drenatore dei poster (1.975 righe)** → **sì, come container**: ciclo di vita diverso (lotto periodico) e
  oggi gira sul mate come unità systemd con `node` e il repo sull'host. È l'unica forza di runtime rimasta.
- **`src/data/` (1,2 MB)** → niente.

**Due cose trovate per strada**: `src/catalog/index.js` e `validation.js` sono un'**isola chiusa** (solo i test li
raggiungono: la porta del modulo non è la porta che si usa — e il bug 4 del ticket 27 vive in un file che il
prodotto non chiama); e **l'app tiene il DuckDB aperto in scrittura**, quindi un secondo processo non riesce ad
aprirlo (stessa classe dei 7 lock del ticket 29).

**Le sonde sbagliate di questa ricognizione**, che sono la parte da ricordare: ho chiamato «ritirato» il vecchio
stack basandomi sulla *raggiungibilità* invece che sull'**uso** (la raggiungibilità dice cosa è caricato, non cosa
serve); i log **non registrano le richieste**, quindi «0 richieste» non è una misura; e il primo probe nel
container è caduto perché **la produzione ha ancora il codice pre-refactor** — ogni misura nel container misura il
vecchio, finché non si fa il ticket 30.

### 19. Il modulo anime: due metà e tre cartelle (ticket 32)

**18/10/2026.** La materia anime è **~5.000 righe (13% del codice) per una dimensione del catalogo**, e oggi sta
in due metà: il **servizio** (`services/anime-source/`, 3.133 righe, con `animeunity.js` = lo scraper del
simulcast, e `store.js` che scrive lo snapshot su Mongo `anime_airing_state`) e **l'app**, dove leggere e decidere
sta in **tre cartelle** — `data/animeMappingStore.js` (688), `data/animeAiringState.js` (746),
`utils/animeIdentity.js` (280), `engines/hybrid/animePolicy.js` (151) — consumate da **12 file in ogni modulo**.

Tre difetti trovati, che valgono più della proposta:

1. **La decisione anime (`animePolicy`) vive dentro `src/engines/hybrid/`**, cioè fra le 6.278 righe del vecchio
   stack da cancellare, mentre la chiamano i moduli **nuovi** (`profile`, `catalog`, `pool`). Chi cancella senza
   spostarla prima cancella la decisione, e non fa un errore: cambia comportamento in silenzio.
2. **L'app entra nel servizio con un `require`**, non con un contratto: `animeMappingStore.js:10-18` carica
   `services/anime-source/src/overrides` con un secondo tentativo e un **ripiego muto** (override vuoti).
   Funziona solo perché il Dockerfile fa `COPY . .` e il `.dockerignore` esclude `services/graph/` ma non
   `services/anime-source/`: aggiungere `services/` al `.dockerignore` spegnerebbe gli override senza un errore.
3. **Il mapping è fatto due volte**: l'app scarica Anibridge+Fribb da sé, e il servizio ha `identity.js` (756),
   `tvdbBridge.js`, `tmdbFallback.js`. Due verità su «che cos'è questo anime», e nessuna che vinca.

**La forma**: un modulo `src/anime/` con una porta sola (identità + decisione + i due store), il servizio resta chi
produce, e la cucitura è già un contratto vero (Mongo `anime_airing_state`). **Il vincolo che decide la cucitura**:
gli id anime finiscono **dentro l'SQL** (`duckDbStore.js:276-279`), quindi il mapping deve restare **locale al
processo** — chi progettasse «l'app chiede il mapping al servizio» romperebbe la query.

### 20. Il modulo anime, deciso (grilling del 18/10/2026)

Sette decisioni nel ticket 32: **(1)** `src/anime/` nell'app, una porta sola, servizio intoccato; **(2)** il
mapping lo produce il **servizio** (indice su Mongo), l'app legge e deriva — un solo download, un solo parser;
**(3)** gli override restano in git nella cartella del servizio e il servizio **pubblica `certify` su Mongo**
(l'app non entra più nel servizio con un `require` dal ripiego muto); **(4)** il confine è **l'anime-ness**, le
annotazioni italiane restano una cosa loro; **(5)** il **meccanismo** dello snapshot (TTL, dedup, politica
d'errore) si estrae in un aiutante, perché oggi è scritto a mano **due volte con politiche opposte** e ne stava
nascendo una terza; **(6)** lo store risponde **tre stati** (`sì`/`non-lo-so`/`no`) e si aggiunge `exclude`, il
gemello di `certify`, perché `false` significa «assente dalla lista», non «non è anime»; **(7)** il verdetto
dell'euristica sui «non lo so» **si vede** (una riga coi candidati da certificare).

**La lezione del grilling**: la domanda dell'utente («l'euristica può vincere solo quando il certificato è
falso?») ha smontato un'assunzione che nessuno aveva scritto — che l'indice sapesse dire **no**. Non lo sa: è una
lista positiva, e il codice lo sapeva già in un commento (`animeMappingStore.js:570`, gli 8.263 poster). Una
domanda sul *comportamento* ha trovato un buco **nell'API**.
