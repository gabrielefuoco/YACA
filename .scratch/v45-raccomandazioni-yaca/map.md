# Mappa: raccomandazioni YACA oltre le bolle

## Destination

Sostituire il percorso bubble con un recommender V45 sparse per **tutte** le superfici YACA. Cluster d'interesse **personali** generati dai segnali del profilo producono scaffali personalizzati; una vista separata usa la sola cronologia recente. Ogni risultato deve avere ragioni eterogenee e tracciabili.

## Notes

- Wayfinding prima: questa mappa risolve le decisioni; niente migrazioni/cancellazioni finché la strada non è chiara.
- V45 è congelato e riprodotto: [`services/graph/V45.md`](../../services/graph/V45.md), [`V45.lock.json`](../../services/graph/recipes/V45.lock.json). Non ritoccare pesi, tipi o studente in questa effort senza aprire una decisione esplicita.
- La build canonica V45 è `PYTHONPATH=services py -m graph.build`, con recipe lock in `services/graph/recipes/V45.lock.json`; è offline e il servizio non compila. Gli esperimenti storici sono archiviati in `.scratch/graph_dense-archive`.
- `services/graph` è il runtime bubble V10 distribuito: `/raccomanda`, `motore.py`, partizione e camminata; Docker monta i dati read-only e impone 512 MiB. Non va rimosso prima di avere un adapter V45 e un rollback validato.
- Il codice build V45 è stato portato in `services/graph/build/`; i vecchi moduli sperimentali sono in `.scratch/graph_dense-archive/`. `services/graph_dense` è ora un namespace di compatibilità con cache dati locali ancora necessarie; il builder non importa più quel package, ma legge ancora parte di `data/`.
- `src/pool/index.js` traduce ruoli fissi del motore in cataloghi Stremio; `src/api/mondi.js` e `src/api/bolle.js` inoltrano liste a client web. L'output finale non è tenuto a preservare i ruoli bubble: entrambe le superfici sono in ambito.
- Terminologia di lavoro: **bolla** = partizione globale di tutti i titoli del vecchio V10; **cluster d'interesse** = raggruppamento personale dei segnali di un profilo (non una partizione del catalogo); **scaffale** = unità di presentazione generata da un cluster. La costruzione esatta del cluster è ancora da decidere.
- Preferenze già espresse: keep i ponti film-serie nel grafo e filtrare il medium al retrieval; preferire like/love/watchlist-library; usare le liste aggiunte soprattutto in cold start (top 5 per lista, peso basso) e come epsilon quando c'è una cronologia reale.
- Le mappe precedenti `.scratch/grafo-servibile/` e `.scratch/uscire-dal-plateau/` avevano esplicitamente escluso la rimozione delle bolle e la migrazione di produzione. Questa è una **nuova effort** che ridisegna quel confine, senza riscrivere la storia delle mappe precedenti.

## Decisions so far

- [Base V45 congelata e replay esatto](../../services/graph_dense/V45.md) — V45 è il grafo di riferimento; studenti e pipeline sono pin-nati nel lock.
- [Cross-medium e diversità al retrieval](../uscire-dal-plateau/map.md) — i ponti cross-medium restano in costruzione; formato e ridondanza si trattano a retrieval.
- [Il graph service possiede il clustering personale](issues/10-graph-service-clusters.md) — YACA passa segnali tipizzati; graph service clusterizza e diffonde, YACA presenta risultati e metadata.
- [Ownership della pipeline V45 e dei moduli graph](issues/01-ownership-pipeline.md) — build e runtime vivono in `services/graph`; esperimenti in `.scratch`; V10 esce al cutover e il rollback ripristina la release precedente.
- [Prototipo dei cluster d'interesse personali](issues/05-cluster-interessi.md) — ricetta misurata: micro a soglia 0,02 → macro con bisezione finché ≤30 semi → 5 scaffali per rango combinato di recenza (`min_eta`) e supporto, medium per macro.
- [Prova del runtime sparse e criteri di cutover](issues/09-runtime-cutover.md) — motore implementato e misurato: `carica_transizione` sta in 190,7 MiB e 134 ms; il caricamento on-the-fly costa 1,4 GiB e non entra nel container; soglie proposte, non ancora confermate.

## Not yet specified

- Come collocare titoli nuovi che non sono ancora nel canone V45 e come far evolvere il canone senza perdere identità e provenienza.
- Se il servizio debba esporre le ragioni per arco leggendo un sidecar di provenienza: il MIX V45 conserva un motivo aggregato per riga, non i tipi che sostengono ogni singolo arco.
- Se/come spostare i 35 GB di cache dati da `services/graph_dense/data` a una directory dati canonica, senza duplicare o riscaricare gli artefatti.
- Come risolvere collisioni fra cluster di lungo periodo e recenti quando producono lo stesso titolo o raccomandazioni in conflitto.
- Se impressioni, click, skip e feedback espliciti aggiornano i cluster in modo incrementale o solo al ricalcolo del profilo.
- Quale protocollo online/ombra, oltre ai banchi offline già esistenti, autorizza il cutover definitivo dal motore bubble.

## Out of scope

- Cambiare la ricetta frozen V45, aggiungere segnali al grafo o riaddestrare il suo studente senza una decisione separata e una nuova versione.
- Download di corpora o build durante l'avvio del container di serving.
- Cancellare subito `services/graph`: il codice e l'artefatto bubble restano rollback finché il cutover non supera le verifiche.
- Rifare la UI generale di YACA; sono in scope solo le superfici e i contratti necessari a presentare le nuove raccomandazioni.
