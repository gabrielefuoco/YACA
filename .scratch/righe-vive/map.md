# Mappa: le righe vive — come navighiamo il grafo e cosa diamo all'utente

**Aperta**: 19/10/2026 · **Natura**: progetto — si tocca il **motore che produce le liste** e il **prodotto che
le serve**; **non** si ricostruisce il grafo
**Origine**: la sessione di analisi del 19/10/2026 (piano in
`C:\Users\gabri\AppData\Local\Temp\yaca-grafo-handoff\Piano d'Azione per il Sistema di Raccomandazione.md`,
handoff e due digest nella stessa cartella). Il cantiere precedente (`.scratch/confini/`, 59/59 chiusi) ha
sistemato i **confini**; questo sistema la **sostanza**.

## Destination

Le righe hero smettono di essere quattro scatole fisse e diventano un **portafoglio di righe** fondato su:

1. un **bacino appiattito** — le bolle accese e i loro vicini, unite, con un **pavimento di qualità**;
2. una **nicchia relativa al profilo** — non più soglie uguali per tutti;
3. i **micro-cluster degli interessi** — ogni filone dell'utente ha la sua riga, e non si fa schiacciare dagli altri;
4. la **recenza come selezione**, non come peso;
5. il **ritorno**: le impressioni smettono di essere scritte e mai lette.

E un invariante che vale per tutte: **la qualità non scende mai sotto un pavimento** — né per pochi voti, né per la
pressione di un franchise, né per un filtro applicato a valle che svuota la riga.

Il grafo resta il **substrato**: `66.259 nodi, la matrice `Tr`, le bolle. Cambia ciò che ci facciamo sopra.

## Decisioni prese (19/10/2026)

1. **I nomi e gli ID dei cataloghi si possono cambiare.** Con più righe (micro-cluster) lo schema fisso non regge.
   **Conseguenza deliberata**: i due hash del manifest (`dc4af35c…` / `91bf96d3…`) **cambiano**, e il nuovo valore
   atteso si aggiorna **nello stesso ticket che cambia il registro** — non si scopre dopo.
2. **Lo spazio vettoriale denso si rimanda.** Prima si mette in produzione questo e si guarda come va; quando sarà
   troppo limitante, si converte. Gli embedding (NetMF/SVD o contrastivi) sono **fuori ambito** qui.
3. **Il grafo non si ricostruisce**: `Tr`, `canon`, le bolle di Leiden, l'artefatto — invariati. Si toccano
   `parametri.py`, `motore.py` (la produzione delle liste), `servizio.py` (il contratto) e il lato Node.
4. **Il frontend non si tocca** (regola dell'utente, 19/10/2026).
5. **Il server non compila**: immagini da ghcr, il mate tira (dottrina di `docs/DEPLOYMENT_HOME_SERVER.md`).

## Come si esegue questo cantiere (regole operative, 19/10/2026)

- **Un ticket alla volta, con la review fra uno e l'altro.** Niente parallelo: quasi tutti i ticket toccano
  ~motore.py~, e le regole si sommano — una giusta da sola puo' essere sbagliata insieme alle altre (il ~05~ ha
  scoperto che il tetto relativo poteva stare **sotto** il pavimento: intervallo vuoto, zero titoli).
- **Executor: solo `pi` con modello `cat-jam-free`.** ~agy~ e' fuori uso per quota (429) dal 19/10/2026.
  Il modello si sceglie dal **tipo** di ticket: un modello libero basta per i fix meccanici con la prova gia'
  scritta; per capire (progettare un bacino, scoprire che manca un dato) serve un modello che capisca.
- **Resume-first**: al primo errore di sostanza il ticket torna allo **stesso** slave con la lista dei fix. Uno
  nuovo riparte da zero, e rispiegare costa piu' del fix.
- **Nell'Esito ogni numero sta in un blocco di output incollato, col comando sopra.** Due Esiti hanno riportato
  numeri che il codice non produceva. Non e' un dettaglio di forma: e' l'unica difesa contro un referto che
  sembra vero.
- **Se una soglia va allentata per riempire una riga, si propone e non si applica**: la proposta si scrive nel
  ticket con i numeri, la decisione e' di chi legge.

## Not yet specified

- **Che cosa vuol dire "qualità alta"**: più pertinente? più vario? meno ripetitivo fra le righe? Le tre tirano in
  direzioni diverse. Fino a che non è scritto, ogni misura è arbitraria. Il ticket 45 usò "oro ammissibile".
- **A che livello agisce il ritorno**: riordino del pool (dopo il grafo) o filtro prima dell'idratazione? Il piano
  propone il **soft-decay sul punteggio** in `pool/index.js`, senza invalidare la cache del grafo.
- ~~Quanti micro-cluster esporre~~ — **deciso dal ticket 08**: massimo **3** (`MICRO_CLUSTER_MAX`), soglia **3 semi**
  o **10% del peso** (`MICRO_CLUSTER_MIN_SEMI` / `MICRO_CLUSTER_MIN_PESO`), componenti connesse sul mini-grafo.
  **Mapping slot↔catalogo: deciso dal ticket 13** — gli slot sono `micro_cluster_1..3`, posizionali (seguono
  il peso), stabili **come cataloghi**: un filone che oggi manca lascia lo slot vuoto, non lo fa sparire.
  L'identità stabile del filone resta `cluster_id` (ticket 08): un filone può cambiare slot, mai catalogo.
- **Se `uscite_nuove` si rinomina** o resta lo slug riparato.

## Out of scope

- **Embedding densi del grafo** (NetMF, SVD su PPR/PMI, dual-encoder contrastivo): direzione approvata come
  "futuro", esplicitamente **non ora**.
- **Ricostruire il grafo** (matrice, bolle, canon, pipeline).
- **Il frontend**: si cambia ciò che il client **nomina**, non il client.
- **La misura comparativa "grafo contro vecchio stack"** (era il fuori-ambito della mappa `confini`): resta di
  un'altra mappa; qui si misura **la perdita ai sei stadi**, che è un'altra domanda.

## Il primo passo

`01` — la sonda end-to-end. Senza sapere **dove** si perde l'oro, ogni intervento è una scommessa.

## Un prerequisito scoperto eseguendo (19/10/2026)

- **`18`** — *la collezione e il regista non esistono a runtime*: il ticket `04` chiede max 1 per `collection_id` e
  max 2 per regista, ma `metadati-canone.npz` **non li esporta** (`COLL`/`DIR` vivono solo come archi della matrice
  dei pesi, non come attributi per titolo). Il `04` è scritto e inerte: si sblocca quando il canone porta i due
  attributi. **Insegnamento**: un ticket può essere eseguito correttamente e comunque non produrre effetto, se
  sotto manca il dato — ed è la review a doverlo dire, non il silenzio.

## I debiti dichiarati dalle review

- **`17`** — *il tipo dedotto dal peso*: `convertiSemiPerGrafo` indovina `loved`/`liked`/`watched` da soglie
  numeriche (`w >= 4`, `w >= 3`, `w === 1`). È la **causa strutturale** di ciò che il `02` ha curato per sintomo
  (il peso esplicito che scavalca `PESO_TIPO`), più lo score gonfiato del titolo ripescato.
- **`18`** — *port collection_id e regista nel canone a runtime*: `metadati-canone.npz` esporta solo
  `VOT, VAVE, POP, ANNO, NEP, COZY, IMP, TIT`. Senza `COLL` e `DIR` nel canone, l'anti-monopolio del ticket 04
  è inerte in produzione (ticket 04 marcato `Blocked by: 18`).

## L'ultimo passo (deciso il 19/10/2026)

`16` — **la seconda passata dei documenti**. Il ticket `15` corregge ciò che oggi è falso e lascia le righe nuove
dichiarate ma non descritte, perché non esistono ancora. A fine cantiere si rilancia: le righe vere, i loro slug
presi dal registro, e la tabella dei sei stadi con i numeri misurati prima/dopo. Descrivere righe non ancora
costruite è il modo esatto in cui un documento diventa una bugia.

## Stato al 20/10/2026 (dopo il `07`)

- **Produzione**: `yaca-graph` serve la ricetta `fa5771594b2ad0c4` con l'artefatto **vecchio**
  `cf1d80dcba3eddce` → `02`, `03`, `05` e `06` sono già vive, il `04` resta inerte. Il `07` non è deployato:
  con la sua immagine la ricetta diventa `10547118a14ca72c` (artefatto invariato, manifest invariati fino al `13`).
- **`07` chiuso**: la recenza è una **selezione** (seconda camminata sui soli semi recenti), la riga
  `ultime_visioni` esiste nel motore e **non è ancora consumata** dal prodotto (ticket `13`). La prova è
  `scripts/qa/probe-ticket-07-ultime-visioni.py`; il passo data→flag ha i suoi test Node.
- **Debito nuovo, dichiarato dalla review**: le sonde `03` e `04` sono **ferme** — i loro `Motore` sintetici non
  hanno `VAVEMEAN` (introdotto dal `05`), e falliscono identiche anche prima del `07`. Non è una regressione, ma
  il bacino appiattito non ha più una sonda che gira: va rifatta in un ticket suo.
- **Lezione pagata dal `07`**: la review `spec` ha trovato che `semiDi` contava le **aggiunte in watchlist** come
  visioni (`ProfileBuilder` scrive segnali `library` dentro WatchHistory). Un ticket può essere verde e sbagliato
  nel **significato** — la prova deve mordere sulla fonte vera, non su un mock.
- **`08` chiuso**: ogni filone dei semi ha la sua camminata e la sua riga (`micro_cluster_1..3`), con `cluster_id`
  stabile (bolla-ancora), `titoli_seme` e `quota_peso` nel contratto. Le righe non arrivano ai cataloghi Stremio
  fino al `13`. Prova: `scripts/qa/probe-ticket-08-micro-cluster.py`. Nuova baseline suite: `1910 passati / 192`.
- **`09` chiuso**: i ponti fra filoni sono `punti_incontro_1..3` (`sqrt(r_a*r_b)` sulle `r_k` del `08`, **zero**
  camminate in più), con `coppia_id` e `fallback` nel contratto. Il fallback prende i due mondi più **lontani**
  che hanno semi — la premessa del ticket (`scegli_mondi` con `lontano=1.0`) non faceva questo: la distanza è in
  `Motore.distanza_fra_mondi`. Prova: `scripts/qa/probe-ticket-09-punti-incontro.py`.
- **Proposta aperta dal `09`, non applicata**: il ponte garantisce il bilanciamento solo sul **primo** titolo;
  dal secondo in poi entrano titoli forti da una parte e quasi assenti dall'altra (equilibrio mediano ~2e-5,
  17/20 sotto 1e-3). Se il prodotto vuole un ponte *davvero* bilanciato serve una soglia sull'equilibrio
  (`min(r_a,r_b)/max(...)`): decisione di prodotto, non di questo cantiere.
- **`10` chiuso**: la porta d'ingresso delle uscite è usata offline (`uscite.py` → `uscite-collocate.npz`), la
  riga `uscite_nuove` dichiara `fonte`/`candidati`/`nel_bacino`/`gia_visti`/`senza_attivazione`/`scartati_pavimento`,
  e l'imbuto include i vicini di **tutti** i mondi accesi. **La cache però non è generata**: sul mate serve
  `python3 -m graph.uscite` (procedura in `docs/DEPLOYMENT_HOME_SERVER.md` §1.2) — fino ad allora la riga resta
  `fonte: canone`, vuota ma dichiarata. La riga è **già servita da Stremio**.
- **`11` chiuso**: waterfall con la specificità in tabella (`SPECIFICITA`, `SPECIFICITA_DEFAULT`), pool per riga e
  ripescaggio; ogni titolo va alla riga più specifica, con **una** sovrapposizione ammessa (`il_tuo_mondo` ×
  micro-cluster). Sul fixture: **61 copie in eccesso → 1**, proprietario sbagliato 0/39. Prova:
  `scripts/qa/probe-ticket-11-waterfall.py`.
- **DECISIONE DI DEPLOY aperta dall'`11`**: il waterfall è fedele al §9.1 ma oggi le righe nuove non hanno
  catalogo Stremio, quindi `il_tuo_mondo` perde i suoi migliori (59/60 sul fixture, tutta la top-10) verso righe
  che nessuno serve. Quest'immagine va deployata **insieme al `13`**, o con una guardia che limiti il waterfall
  alle righe servite. Proposta non applicata.
- **`13` chiuso (prima del `12`, decisione dichiarata)**: le sei righe nuove sono cataloghi di sistema
  (8 → 20 cataloghi, 4 → 10 famiglie). Pool a tabella, ponti uniti in un catalogo, micro-cluster con tre slot
  stabili, `mondo_*` dichiarati senza catalogo. Manifest: `dc4af35c…` → `4169fd73f14389f24097e6508bd06c289b1898ad727250342ccf1fe47b093dc5`
  (`buildRootManifest` invariato); cache righe v15 → v16. Prova: `tests/heroRowsCoverage.test.js`.
- **Il `12` è bloccato da una premessa falsa**: «il flag anime del canone» non esiste. Prerequisito aperto:
  **`19`** (i flag per-titolo nel canone: `ANIME`, `ADULTO`), stessa forma del `18`. Il `12` riparte dopo.
- **Nota del `13`**: la dashboard è data-driven (`heroCatalogs` da `getHeroUiGroups`, id derivati da
  `idBase`) e mostra le sei famiglie con i loro toggle, ma `selectedPresets` è una lista bianca: **le righe
  nuove arrivano SPENTE** finché un profilo non le accende. La regola di compatibilità («chi aveva tutte le
  righe di ieri riceve quelle di oggi») rendeva inerti i toggle ed è stata **ritirata**. Accenderle di
  default è il ticket **`20`** (migrazione one-shot con marcatore, o dodici id nei default del frontend).
- **`14` chiuso**: le impressioni si **rileggono** (finestra 14 giorni, giorni distinti) e il pool applica
  `0.85^giorni` ai titoli con ≥3 giorni in home **mai visti**, dopo la cache: una query per chiamata del pool
  (memo 60 s, perché composer chiama il pool una volta per catalogo), nessun
  titolo tolto, la riga si riordina. **Misurato**: la formula è troppo forte per la banda dei punteggi (dal
  terzo giorno la prima pagina si rinnova tutta, 0/10 restano) — leva da decidere col prodotto (tetto
  all'esponente o fattore 0.95), non cambiata in silenzio.

## Decisioni del 20/10/2026 (chieste all'utente)

- **Righe nuove accese di default**: il frontend si **sblocca** per il solo elenco di id
  (`HERO_PRESET_IDS` in `frontend/src/lib/constants.ts`, un posto solo per tre copie). Fatto nel ticket `20`.
- **Decadimento impressioni**: resta **0.85**, ma con due aggiunte decise qui — un **alpha casuale
  giornaliero** che muove l'ordine delle prime pagine di giorno in giorno, e un **reset periodico**, perché
  altrimenti i titoli utili scivolati giù non tornano più. → ticket **`21`**.
- **Deploy**: dopo `19` + `12`, così le righe arrivano già filtrate a monte (anime/kids) invece di
  affidarsi ai tagli a valle.
- **Waterfall in produzione**: **guardia**, la deduplica considera solo i ruoli che hanno un catalogo
  Stremio. → ticket **`22`** (riapertura del `11`).
- **`21` chiuso**: l'alpha del giorno (`1 ± 5%`, deterministico da giorno+id) e il **reset** (decadimento
  azzerato dopo **4 giorni** fuori da pagina 1, soglia misurata: con 2 la pagina faceva il pendolo). Sonda:
  10 giornate, 51/60 titoli diversi in pagina 1, 33 che rientrano dopo un'uscita, 10,7/20 di continuità.
- **`22` chiuso**: il waterfall deduce solo fra le righe **accese** per il profilo (`righe_servite`, con la
  traduzione id→ruolo e un pezzo di chiave di cache `_rs_<hash>`). Misurato sul fixture del 11: senza guardia
  la riga visibile perde **9/10** dei suoi titoli migliori verso una riga che nessuno mostra; con la guardia
  10/10; con tutte le righe accese il comportamento è **identico** al §9.1.
