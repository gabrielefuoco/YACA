# Contratto degli Scaffali YACA (Ticket 08)

Documento di specifica per l'integrazione tra il motore di raccomandazione V45 (ricetta congelata $M=12$, $\tau=0.03$, vicinato allargato top-100 coseno) e le superfici di fruizione di YACA (Stremio Addon, Pool di raccomandazione e API Web).

Il file dati dry-run generato con dati reali è collocato accanto a questo documento:
[contratto-scaffali.json](file:///C:/Users/gabri/APP/YACA/.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json).

---

## 1. Il Vincolo Architetturale (The Constraining Fact)

Stremio e YACA operano secondo due modelli strutturalmente asimmetrici:
- **I cluster del motore sono dinamici e personali**: ogni profilo possiede cluster propri che evolvono con la cronologia, identificati da semi e nomi mutevoli (*«Anime shōnen»*, *«Dramma coreano»*, *«Perché hai visto X, Y e Z»*);
- **Il catalogo Stremio è statico e pre-dichiarato nel Manifest**: il client Stremio richiede esclusivamente cataloghi con ID univoci dichiarati nell'array `catalogs` al momento dell'installazione del manifest.

### Dove viene generato il manifest
In [src/stremio/manifest.js](file:///C:/Users/gabri/APP/YACA/src/stremio/manifest.js#L77-L125), `buildManifest()` compone la lista dei cataloghi:
```javascript
// src/stremio/manifest.js (linee 87-124)
const heroCatalogs = getManifestHeroCatalogs();
// ...
const catalogs = [
    { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
    // ...
    ...activeHeroCatalogs
];
```
L'endpoint in [src/api/stremio.js](file:///C:/Users/gabri/APP/YACA/src/api/stremio.js#L181-L195):
```javascript
// src/api/stremio.js (linee 181-190)
router.get(['/:userHandle/manifest.json', '/:userHandle/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = await getUserConfig().resolveUserConfig(req.params.userHandle);
    // ...
    const manifest = buildManifest(userConfig, hostUrl, req.params.userHandle);
    return res.json(manifest);
});
```

### Gli ID possono variare per richiesta?
**No, dal lato del client Stremio.** Quando Stremio sfoglia l'interfaccia, esegue chiamate HTTP GET verso:
`GET /:userHandle/catalog/:type/:id.json`
Stremio interroga **esclusivamente gli ID che ha memorizzato nel proprio manifest locale**. Se il server tentasse di variare dinamicamente gli ID a ogni richiesta (es. `yaca_cluster_kurosawa_movies`), il client Stremio non richiederebbe mai quel catalogo perché assente dal manifest installato.

### Cosa fa il Pool con un ID non dichiarato?
In [src/pool/index.js](file:///C:/Users/gabri/APP/YACA/src/pool/index.js#L37-L421), la tabella dei ruoli serviti `RUOLI_SERVITI` è rigida:
```javascript
// src/pool/index.js (linee 37-41, 413-422)
const RUOLI_SERVITI = new Set([
    ...RUOLI_HERO.map((r) => r.ruolo),
    ...RUOLI_MICRO,
    ...RUOLI_PONTE
]);
// ...
const nonServiti = {};
for (const li of liste) {
    if (RUOLI_SERVITI.has(li.ruolo)) continue;
    const ruolo = String(li.ruolo ?? 'senza-ruolo');
    const famiglia = ruolo.replace(/_\d+$/, '');
    const voce = nonServiti[famiglia] || { righe: 0, titoli: 0 };
    voce.righe += 1;
    voce.titoli += (li.titoli || []).length;
    nonServiti[famiglia] = voce;
}
```
Se il grafo restituisce liste con ruoli o ID non mappati in `RUOLI_SERVITI`, il Pool le declassa a `nonServiti` e non le assegna a nessun catalogo (`assigned[...]`). In [src/stremio/CatalogRouter.js](file:///C:/Users/gabri/APP/YACA/src/stremio/CatalogRouter.js#L52-L63), una richiesta con ID sconosciuto restituisce `[]`, producendo `{ metas: [] }` in [src/stremio/catalogHandler.js](file:///C:/Users/gabri/APP/YACA/src/stremio/catalogHandler.js#L88).

---

## 2. I Tre Mapping Possibili e Trade-Off

| Dimensione di Confronto | (a) Slot Fissi (`shelf_1..5`) | (b) ID Stabili per Contenuto (Hash/Slug) | (c) Ibrido (Slot Fissi + 1 "Altri Interessi") |
|:---|:---|:---|:---|
| **Definizione ID** | `yaca_shelf_1_movies` .. `shelf_5` | `yaca_topic_shonen_series`, `yaca_topic_korea_series` | `yaca_shelf_1..4_movies` + `yaca_altri_interessi_movies` |
| **Dichiarazione Manifest** | 5 ID stabili prefissati per medium | N cataloghi generati dinamicamente | 4 slot fissi + 1 catalogo rotante |
| **Comportamento Caching** | Cache standard su `buildSharedHeroCacheKey` | Cache atomica per topic / hash | Cache mista (slot 1..4 stabili, slot 5 dinamico) |
| **Cosa vede l'utente quando un cluster sparisce** | Nessun buco: lo slot viene preso dal cluster successivo | Riga vuota `{ metas: [] }` in Stremio finché non risincronizza | Lo slot 1..4 scala sul successivo; i cluster minori vanno in slot 5 |
| **Cosa succede sotto i 3 cluster (< 3)** | Slot 1..2 servono i cluster; slot 3..5 tornano `{ metas: [] }` | Nel manifest compaiono solo 2 cataloghi | Slot 1..2 servono i cluster; slot 3..4 vuoti; slot 5 vuoto o fallback |
| **Complessità implementativa** | **Bassa**: aderisce al pattern già esistente dei `micro_cluster_1..3` | **Molto Alta**: richiede `updateStremioAddonCollection` a ogni visione | **Media**: gestisce l'overflow dei cluster non serviti |

> [!TIP]
> **OPINIONE E RACCOMANDAZIONE (Marcata come tale)**:
> **La scelta raccomandata per la produzione è la (a) — Slot Fissi `shelf_1..5` (o `interessi_1..5`) per medium**.
> 
> *Motivazione*: Stremio è un'applicazione client che non gradisce la mutazione dell'elenco dei cataloghi a runtime; forzare risincronizzazioni del manifest tramite webhook o chiamate ad account Stremio (opzione b) introduce latenze, disallineamenti di versione e fallimenti su client offline o TV. Gli slot fissi rispettano la natura a slot di Stremio (la stessa già usata con successo per `micro_cluster_1..3`), garantiscono che quando un interesse scende in classifica un altro subentri senza buchi grafici, e lasciano al payload JSON il compito di veicolare il titolo vivo dello scaffale e le relative ragioni.

---

## 3. Contratto del Servizio Engine (HTTP Contract)

### 3.1. Richiesta (`POST /raccomanda` o `POST /scaffali`)
```json
{
  "semi": [
    {
      "tmdbId": 83095,
      "medium": "series",
      "tipo": "watched",
      "plays": 12.0,
      "recente": true
    }
  ],
  "medium": "series",
  "esclusioni": ["tv:83095", "tv:94605"],
  "n_scaffali": 5,
  "opzioni": {
    "M": 12,
    "tau": 0.03
  }
}
```

### 3.2. Risposta per Singolo Scaffale
Ogni elemento di `scaffali` (o `liste`) presenta il seguente schema vincolante:
```json
{
  "slot_id": "yaca_shelf_1_series",
  "shelf_index": 1,
  "nome": "Animazione d'azione per adulti",
  "nome_fonte": "tassonomia",
  "confidenza": 0.917,
  "matched_entry": "Animazione d'azione per adulti",
  "medium": "series",
  "consistenza": 0.0924,
  "is_piccolo": false,
  "n_semi": 12,
  "semi_rappresentativi": [
    {
      "tmdbId": 83095,
      "medium": "series",
      "titolo": "Love, Death & Robots",
      "anno": 2019,
      "plays": 12.0,
      "eta_giorni": 43.0
    }
  ],
  "semi_membri": [
    {
      "tmdbId": 83095,
      "medium": "series",
      "titolo": "Love, Death & Robots",
      "anno": 2019
    }
  ],
  "titoli": [
    {
      "tmdbId": 219080,
      "type": "series",
      "titolo": "The Mighty Nein",
      "anno": 2025,
      "punteggio": 0.012649,
      "motivo": "Affinità con i 12 semi del cluster «Animazione d'azione per adulti»"
    }
  ]
}
```

### 3.3. Dove e Come Cambia `versioni` per l'Invalidazione Cache
In Node.js, [src/pool/index.js](file:///C:/Users/gabri/APP/YACA/src/pool/index.js#L82-L109) costruisce la chiave di cache di gruppo:
```javascript
// src/pool/index.js (linee 101-105)
invalida: {
    artefatto: versions?.artefatto,
    ricetta: versions?.ricetta
}
```
Il servizio Python restituisce `versioni` sia in `GET /health` che in `POST /raccomanda`:
```json
{
  "versioni": {
    "artefatto": "bolle-eterogeneo-V45-p1.0-triangolo.npz",
    "ricetta": "v45-m12-tau0.03-top100cos-tax36-combmineta"
  }
}
```
**Regola di invalidazione**: L'impronta della ricetta (`P.impronta()`) nel motore Python include la configurazione $M=12$, $\tau=0.03$, il vicinato non potato top-100 e il vocabolario di tassonomia. All'aggiornamento della stringa `ricetta`, tutte le voci di cache `heroes` generate in precedenza vengono invalidate istantaneamente alla prima lettura senza dover svuotare manualmente Redis o disco.

### 3.4. Mappatura di `skip` e Paginazione Stremio
- **Input**: Lo scaffale è ancorato a $\le 12$ semi (cap $M=12$ congelato).
- **Generazione Candidati**: L'Engine esegue la camminata (PPR) distribuita sui 12 semi e genera $N = 60$ o $100$ candidati raccomandati (`cap=60`).
- **Cache dei Candidati**: Il Pool riceve tutti i 60-100 candidati e li ripone nell'array `recommendationIds`.
- **Impaginazione Stremio**: Stremio richiede blocchi di 20 item alla volta (`skip=0`, `skip=20`, `skip=40`).
  In [src/stremio/hybridServing.js](file:///C:/Users/gabri/APP/YACA/src/stremio/hybridServing.js#L144-L153), `idrataEImpaginaCandidati` esegue lo slice:
  `page = recommendationIds.slice(skip, skip + 20)`
  e idrata i relativi metadati TMDB.

---

## 4. Esempi Dry Run su Dati Reali (Estratti da `contratto-scaffali.json`)

### 4.1. Profilo Lungo: `warnok` (476 semi totali $\to$ 5 scaffali serviti)
- **Scaffale 1** (`slot_id: yaca_shelf_1_series`):
  - **Nome**: *«Animazione d'azione per adulti»* [Tassonomia, conf: 0.917, size: 12 semi]
  - **Semi rappresentativi**: *Love, Death & Robots (2019)*, *Castlevania (2017)*, *La leggenda di Vox Machina (2022)*
  - **Top candidati raccomandati**: *The Mighty Nein (2025)*, *The Boys Presenta: Diabolico! (2022)*, *Devil May Cry (2025)*
- **Scaffale 2** (`slot_id: yaca_shelf_2_series`):
  - **Nome**: *«Perché hai visto Lost, Il Trono di Spade e Stranger Things»* [Trasparente, size: 12 semi]
  - **Semi rappresentativi**: *Lost (2004)*, *Il Trono di Spade (2011)*, *Stranger Things (2016)*
  - **Top candidati raccomandati**: *Chernobyl (2019)*, *Pluribus (2025)*, *The Umbrella Academy (2019)*
- **Scaffale 3** (`slot_id: yaca_shelf_3_movies`):
  - **Nome**: *«Fantascienza d'invasione»* [Tassonomia, conf: 0.875, size: 8 semi]
  - **Semi rappresentativi**: *Disclosure Day (2026)*, *L'ultima missione: Project Hail Mary (2026)*, *Send Help (2026)*
  - **Top candidati raccomandati**: *Jurassic World (2015)*, *Dune - Parte due (2024)*, *Nessuno ti salverà (2023)*
- **Scaffale 4** (`slot_id: yaca_shelf_4_series`):
  - **Nome**: *«Anime shōnen»* [Tassonomia, conf: 1.000, size: 9 semi]
  - **Semi rappresentativi**: *Demon Slayer: Kimetsu no Yaiba (2019)*, *Dr. Stone (2019)*, *Jujutsu Kaisen (2020)*
  - **Top candidati raccomandati**: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*
- **Scaffale 5** (`slot_id: yaca_shelf_5_series`):
  - **Nome**: *«Perché hai visto Squadra Speciale Cobra 11, Il commissario Rex e Il comandante Florent»* [Trasparente, size: 12 semi]
  - **Semi rappresentativi**: *Squadra Speciale Cobra 11 (1996)*, *Il commissario Rex (1994)*, *Il comandante Florent (1996)*
  - **Top candidati raccomandati**: *Chiamatemi Giò (2008)*, *La piovra (1984)*, *Bones (2005)*

### 4.2. Profilo Ultra-Corto: `carverclan` (7 semi totali $\to$ 2 scaffali serviti)
- **Scaffale 1** (`slot_id: yaca_shelf_1_movies`, `is_piccolo: true`):
  - **Nome**: *«Horror soprannaturale»* [Tassonomia, conf: 0.500, size: 2 semi]
  - **Semi rappresentativi**: *I peccatori (2025)*, *Stranger Things (2016)*
  - **Top candidati raccomandati**: *Una battaglia dopo l’altra (2025)*, *Marty Supreme (2025)*, *Train Dreams (2025)*
- **Scaffale 2** (`slot_id: yaca_shelf_2_movies`, `is_piccolo: true`):
  - **Nome**: *«Teatro filmato & Musical»* [Tassonomia, conf: 0.500, size: 2 semi]
  - **Semi rappresentativi**: *Peter Pan Goes Wrong (2016)*, *Great Performances (1972)*
  - **Top candidati raccomandati**: *Pippin (1981)*, *The Phantom of the Opera at the Royal Albert Hall (2011)*, *Top Gear: The Perfect Road Trip 2 (2014)*

*(I payload completi e validati con tutti i campi sono salvati nel file compagno [contratto-scaffali.json](file:///C:/Users/gabri/APP/YACA/.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json)).*

---

## 5. Decisioni Aperte per il Produttore Umano (Open Decisions)

1. **Numero di Scaffali Visibili in Stremio**:
   - *Opzione A*: 5 slot fissi per medium (`shelf_1..5`). Se un utente ne genera solo 2 (come `carverclan`), gli slot 3..5 restituiscono `{ metas: [] }` (Stremio non renderizza le righe vuote).
   - *Opzione B*: Ridurre il numero di slot a 3 fissi (come i vecchi `micro_cluster_1..3`).
2. **Ordinamento degli Scaffali**:
   - *Opzione A*: Punteggio combinato decrescente `rank_comb = (rank_min_eta + rank_supporto)/2.0` (il primo scaffale è sempre quello più bilanciato tra freschezza e massa).
   - *Opzione B*: Slot 1 riservato al cluster col seme più fresco in assoluto (`min_eta`), slot 2-5 ordinati per massa.
3. **Rigenerazione del Manifest**:
   - *Opzione A (Consigliata)*: Manifest rigorosamente statico con slot generici (`shelf_1..5`), titoli mostrati dinamicamente tramite metadata/badge di riga.
   - *Opzione B*: Invocare `updateStremioAddonCollection` quando cambia il profilo per iniettare i nomi effettivi della tassonomia dentro il `name` del catalogo nel manifest Stremio.
4. **Fallback Sotto i 3 Cluster**:
   - *Opzione A (Trasparente/Conservativa)*: Se un profilo genera meno di 3 cluster ammissibili (es. 2 scaffali per `carverclan`), servire solo quegli scaffali e lasciare vuoti i rimanenti.
   - *Opzione B (Backfill)*: Riempire gli slot mancanti pescando dalle collezioni popolari TMDB o dalla watchlist dell'utente.
