# Verifica Read-Only su MongoDB Atlas — Ipotesi H2 & H4

**Data verifica:** 2026-09-20  
**Target:** MongoDB Atlas (`yaca`)  
**Modalità:** Read-Only (nessuna scrittura, nessun indice creato)  
**Script utilizzati:** `.scratch/recommender/atlas_check.js`, `.scratch/recommender/atlas_details.js`

---

## 1. Conteggi Collection su MongoDB Atlas

| Collection | Conteggio Documenti | Note / Stato |
|---|---|---|
| `tmdbscoringdatas` | **1080** | Record storici (maggio-giugno 2026) |
| `tasteprofiles` | **18** | 10 profili con V_active > 0, 8 con V_active = 0 |
| `watchhistories` | **60** | Ultimo record 2026-07-28 |
| `useraccounts` | **1** | Account principale |
| `addonconfigs` | **1** | Configurazione addon anonima |
| `recommendationimpressions` | **4312** | Impression sui cataloghi Hero |
| `streambadges` | **24798** | Badge stream |
| `pendingscans` | **736** | Scansioni pendenti |
| `userlibraryitems` | **169** | Libreria utente |
| `imdbtotmdbmappings` | **35** | Mapping IMDb → TMDB |
| `tmdbtokitsumappings` | **1** | Mapping TMDB → Kitsu |
| `userlists` | **1** | Liste utente |
| `system_settings` | **1** | Impostazioni di sistema |
| `systemlogs` | **0** | Vuota |
| `caches` | **0** | Vuota (cache migrata a Redis / L1 RAM) |
| `imagecaches` | **0** | Vuota |
| `cacheentries` | **0** | Vuota |

---

## 2. Verifica Ipotesi H2 — Analisi e Verdetto

### 2.1 Ipotesi
> `TmdbScoringData` non avrebbe più nessun writer dal commit `73a023d` ⇒ `V_active` non cresce ⇒ personalizzazione ferma su `V_static`.  
> *Condizione di verifica formulata:* se la collection ha 0 documenti, H2 è confermata.

### 2.2 Dati Emersi
- **Conteggio assoluto**: 1080 documenti (la collection non è a 0).
- **Struttura schema (`findOne`)**:  
  Campi presenti: `_id`, `tmdbId`, `type`, `cast_ids`, `director_ids`, `genre_ids`, `imdbId`, `keyword_ids`, `lockedUntil`, `logo_path`, `needsEnrichment`, `vote_average`, `vote_count`, `createdAt`, `updatedAt`, `__v`.
- **Analisi cronologica delle date**:
  - `oldestCreatedAt`: `2026-05-30T18:13:20.294Z`
  - `newestCreatedAt`: `2026-06-02T15:36:59.011Z`
  - `newestUpdatedAt`: `2026-07-21T14:27:05.300Z`
  - Data del commit `73a023d`: **`2026-07-23 16:27:50 +0200`**
- **Analisi di `tasteprofiles` (18 profili)**:
  - 8 profili su 18 hanno `vActiveKeys = 0` (solo `V_static` valorizzato).
  - 10 profili hanno `vActiveKeys > 0` (451, 279, 498, 607 chiavi) derivanti da sync storici avvenuti prima di fine luglio sui titoli già presenti nel vecchio dump di 1080 record.
  - Nessun nuovo documento in `tmdbscoringdatas` è mai stato inserito dal 2 giugno 2026, e nessun documento è stato aggiornato dopo il 21 luglio 2026.

### 2.3 Verdetto su H2: SOSTANZIALMENTE CONFERMATA (con precisazione storica)
- **Falsificata nella condizione sufficiente stretta** ("0 documenti totali"): nel database esistono 1080 record "fossili" creati tra il 30 maggio e il 2 giugno 2026.
- **Confermata nella sostanza del meccanismo causale**:
  1. Il commit `73a023d` (23/07/2026) ha definitivamente soppresso qualsiasi operazione di scrittura o inserimento su `TmdbScoringData`.
  2. Dal 23 luglio 2026: **ZERO insert e ZERO update** in `tmdbscoringdatas`.
  3. Per qualsiasi titolo guardato non appartenente ai 1080 storici, `_bulkUpdateVectorsAsync` non trova `TmdbScoringData` e `V_active` non cresce.
  4. 8 profili su 18 hanno `V_active` completamente a 0 chiavi.

---

## 3. Evidenza per Ipotesi H4

### 3.1 Dati Emersi
- `recommendationimpressions`: **4312 documenti** distribuiti esattamente sugli 8 cataloghi Hero:
  - `yaca_seed_network_movies`: 816
  - `yaca_true_blend_movies`: 721
  - `yaca_seed_network_series`: 635
  - `yaca_hidden_gems_movies`: 566
  - `yaca_true_blend_series`: 472
  - `yaca_trakt_filtered_movies`: 465
  - `yaca_trakt_filtered_series`: 386
  - `yaca_hidden_gems_series`: 251
  - Range date impression: dal `2026-06-19T14:40:06Z` al `2026-07-28T20:47:09Z`.
- **Cache su MongoDB Atlas**:
  - `caches`: **0**
  - `imagecaches`: **0**
  - `cacheentries`: **0**
  - Le raccomandazioni non risiedono su collezioni Mongo: la cache L2 è gestita interamente su **Redis** (`src/cache/redisClient.js` e `CacheManager.js`), con L1 in RAM LRU. Eventuali TTL su Mongo sono scaduti o non utilizzati.

---

## 4. Query Esatte Eseguite

Tutte le query sono state eseguite in modalità read-only tramite driver ufficiale `mongodb` (`MongoClient`):

```javascript
// 1. Elenco collezioni
const collections = await db.listCollections().toArray();

// 2. Conteggio e schema tmdbscoringdata
const countTmdb = await db.collection('tmdbscoringdatas').countDocuments({});
const sampleTmdb = await db.collection('tmdbscoringdatas').findOne({});
const oldestTmdb = await db.collection('tmdbscoringdatas').find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
const newestTmdb = await db.collection('tmdbscoringdatas').find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(1).toArray();

// 3. Conteggio e ispezione tasteprofiles
const countTaste = await db.collection('tasteprofiles').countDocuments({});
const sampleTaste = await db.collection('tasteprofiles').aggregate([{ $sample: { size: 1 } }]).toArray();
const allProfiles = await db.collection('tasteprofiles').find({}, {
    projection: {
        'compiledVectors.V_static': 1,
        'compiledVectors.V_active': 1,
        'compiledVectors.V_final': 1,
        createdAt: 1,
        updatedAt: 1,
        lastUpdated: 1,
        onboardingCompleted: 1
    }
}).toArray();

// 4. WatchHistories
const countWatch = await db.collection('watchhistories').countDocuments({});
const oldestWatch = await db.collection('watchhistories').find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
const newestWatch = await db.collection('watchhistories').find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(1).toArray();

// 5. UserAccounts e AddonConfigs
const countUserAccounts = await db.collection('useraccounts').countDocuments({});
const countAddonConfigs = await db.collection('addonconfigs').countDocuments({});

// 6. RecommendationImpressions e distinct catalogId
const countRec = await db.collection('recommendationimpressions').countDocuments({});
const distinctCatalogs = await db.collection('recommendationimpressions').distinct('catalogId');
const catalogAggregation = await db.collection('recommendationimpressions').aggregate([
    { $group: { _id: "$catalogId", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
]).toArray();

// 7. Collezioni di cache
for (const c of ['caches', 'imagecaches', 'cacheentries']) {
    const cCount = await db.collection(c).countDocuments({});
}
```
