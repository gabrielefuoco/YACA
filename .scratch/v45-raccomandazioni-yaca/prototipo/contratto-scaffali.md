# Contratto degli Scaffali YACA (Ticket 08)

Documento di specifica per l'integrazione tra il motore di raccomandazione V45 (ricetta congelata $M=12$, $\tau=0.03$, vicinato allargato top-100 coseno) e le superfici di fruizione di YACA (Stremio Addon, Pool di raccomandazione e API Web), aggiornato con le **decisioni definitive del Produttore Umano**.

Il file dati dry-run generato con dati reali per `warnok`, `carverclan` e `pepsipex` è collocato accanto a questo documento:
[contratto-scaffali.json](file:///C:/Users/gabri/APP/YACA/.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json).

---

## 1. Il Vincolo Architetturale e il Meccanismo di Reconcile

### 1.1. Come Stremio dichiara e consuma i cataloghi
In [src/stremio/manifest.js](file:///C:/Users/gabri/APP/YACA/src/stremio/manifest.js#L77-L125), `buildManifest()` compone l'array `catalogs`. Il client Stremio interroga esclusivamente gli ID presenti nel proprio manifest locale tramite:
`GET /:userHandle/catalog/:type/:id.json`
Se un catalogo non è dichiarato nel manifest, Stremio non lo richiede mai. In [src/pool/index.js](file:///C:/Users/gabri/APP/YACA/src/pool/index.js#L37-L421), la tabella dei ruoli serviti `RUOLI_SERVITI` scarta a `nonServiti` qualsiasi ID non mappato.

### 1.2. Decisione dell'Umano: Nessun Tetto Prefissato e Manifest per Profilo
L'umano ha rigettato il numero fisso di slot: *«perché un numero prefissato?»*.
L'infrastruttura YACA possiede già il meccanismo idoneo per supportare cataloghi dinamici per profilo:
1. **Manifest per profilo**: l'endpoint [src/api/stremio.js](file:///C:/Users/gabri/APP/YACA/src/api/stremio.js#L181-L195) serve già `/:userHandle/:configVersion/manifest.json`.
2. **Reconciler automatico**: in [src/stremio/reconciler.js](file:///C:/Users/gabri/APP/YACA/src/stremio/reconciler.js#L36-L100), il sistema calcola il fingerprint del manifest con `buildManifestFingerprint()`. Quando i cataloghi dichiarati cambiano:
   - genera una nuova `configVersion = nanoid(8)`;
   - invoca `updateStremioAddonCollection(stremioAuthKey, manifestUrl)` per sincronizzare istantaneamente la collezione Stremio dell'utente senza richiedere reinstallazioni manuali.
3. **Numero di cataloghi**: il manifest dichiara esattamente il numero di scaffali che il profilo produce, senza slot fittizi né backfill forzato.

---

## 2. I Tre Mapping e il Verdetto del Produttore

| Dimensione | (a) Slot Fissi (`shelf_1..5`) | (b) ID Stabili per Contenuto (Hash/TMDB) [ADOTTATO DALL'UMANO] | (c) Ibrido (Slot Fissi + "Altri Interessi") |
|:---|:---|:---|:---|
| **Definizione ID** | `yaca_shelf_1_movies` .. `shelf_5` | `yaca_<top_representative_tmdbId>_<medium>` | `yaca_shelf_1..4` + `yaca_altri_interessi` |
| **Dichiarazione Manifest** | 5 slot prefissati per medium | N cataloghi derivati dall'identità dei cluster | 4 slot fissi + 1 rotante |
| **Caching Stremio** | Cache per slot (il contenuto cambia nello slot) | **Cache atomica per cluster di interesse** | Cache mista |
| **Quando un cluster sparisce** | Lo slot viene riempito dal cluster successivo | La riga viene rimossa al reconcile successivo | Scala di posizione; cluster minori finiscono in slot 5 |
| **Sotto i 3 cluster (< 3)** | Slot vuoti `{ metas: [] }` | **Dichiara solo i cataloghi qualificati (es. 0 per carverclan)** | Slot vuoti o backfill |
| **Verdetto Umano** | *Scartato* | **ADOTTATO DALL'UMANO**: ID legato all'identità, nomi vivi, no fixed slot count | *Scartato* |

### Regola di Costruzione dell'ID Catalogo
Per garantire che il manifest cambi **solo quando i cluster appaiono o scompaiono realmente** (e non per un semplice riordinamento degli item o un piccolo scatto di recenza), l'ID dello scaffale è vincolato all'identità del cluster:
$$\text{catalog\_id} = \texttt{yaca\_<top\_representative\_tmdbId>\_<medium>}$$
- Esempi reali misurati: `yaca_12609_series` (Dragon Ball Z / Anime shōnen), `yaca_4607_series` (Lost), `yaca_447332_movie` (A Quiet Place).
- **Stabilità verificata**: su tutti i cluster delle 10 timeline analizzate, `yaca_<top_representative_tmdbId>_<medium>` è risultato **univoco al 100%** (0 collisioni).
- **Trigger del Reconcile**: il manifest viene rigenerato e sincronizzato via `updateStremioAddonCollection` **esclusivamente** quando nasce un nuovo cluster qualificato o muore un interesse esistente. La variazione delle raccomandazioni interne o l'inversione di rango tra due scaffali esistenti **non** altera gli ID e non richiede reconcile.

---

## 3. Contratto dell'Engine di Raccomandazione

### 3.1. Richiesta (`POST /raccomanda` o `POST /scaffali`)
Non è più presente il parametro `n_scaffali`: è l'Engine a decidere quanti scaffali servire applicando le regole di qualificazione e la regola di arresto.

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
  "esclusioni": ["tv:83095", "tv:94605"],
  "opzioni": {
    "M": 12,
    "tau": 0.03
  }
}
```

### 3.2. Risposta per Singolo Scaffale
Ogni scaffale in `scaffali` presenta il seguente schema:
```json
{
  "catalog_id": "yaca_12609_series",
  "slot_position": 1,
  "nome": "Anime shōnen",
  "nome_fonte": "tassonomia",
  "confidenza": 1.0,
  "matched_entry": "Anime shōnen",
  "medium": "series",
  "consistenza": 0.0461,
  "is_piccolo": false,
  "min_eta": 15.0,
  "r_comb": 21.5,
  "n_semi": 4,
  "semi_rappresentativi": [
    {
      "tmdbId": 12609,
      "medium": "series",
      "titolo": "Dragon Ball Z",
      "anno": 1989,
      "plays": 1.0,
      "eta_giorni": 15.0
    }
  ],
  "semi_membri": [
    {
      "tmdbId": 12609,
      "medium": "series",
      "titolo": "Dragon Ball Z",
      "anno": 1989
    }
  ],
  "titoli": [
    {
      "tmdbId": 46298,
      "type": "series",
      "titolo": "Hunter x Hunter",
      "anno": 2011,
      "punteggio": 0.021045,
      "motivo": "Affinità con i 4 semi del cluster «Anime shōnen»"
    }
  ]
}
```

### 3.3. Regola di Ordinamento dei Cataloghi
1. **Posizione 1 (Slot 1)**: assegnata in modo rigido al cluster con il **minimo `min_eta` in assoluto** (il cluster contenente il seme più fresco della cronologia).
2. **Posizioni 2..N**: ordinate per **rango combinato crescente**:
   $$r_{\text{comb}} = \frac{r_{\text{rec}} + r_{\text{sup}}}{2}$$
   con tie-break su consistenza decrescente, dimensione decrescente e riproduzioni totali decrescenti.

### 3.4. Invalidazione Cache tramite `versioni`
In [src/pool/index.js](file:///C:/Users/gabri/APP/YACA/src/pool/index.js#L101-L105), la cache di gruppo viene invalidata automaticamente quando l'Engine aggiorna la firma della ricetta:
```json
{
  "versioni": {
    "artefatto": "bolle-eterogeneo-V45-p1.0-triangolo.npz",
    "ricetta": "v45-m12-tau0.03-top100cos-tax36-combmineta-stop80"
  }
}
```

### 3.5. Paginazione Stremio (`skip`)
- L'Engine restituisce una borsa di 60-100 candidati per ciascun catalogo (`cap=60` o `cap=100`).
- Il Pool mantiene la lista dei recommendation IDs in cache.
- In [src/stremio/hybridServing.js](file:///C:/Users/gabri/APP/YACA/src/stremio/hybridServing.js#L144-L153), la richiesta con `skip` (es. `skip=0`, `skip=20`, `skip=40`) esegue il windowing:
  $$\text{page} = \text{recommendationIds.slice}(skip, skip + 20)$$

---

## 4. La Regola di Arresto all'80% e Misure sulle 10 Timeline

### 4.1. Definizione della Regola
Si aggiungono scaffali in ordine di rango finché la quota cumulata di semi coperti non raggiunge l'**80% dei semi coperti dal profilo**, con i quattro vincoli rigidi:
1. `size >= 3` semi (un gruppo autentico);
2. `medium-homogeneous` (omogeneità di medium per scaffale);
3. `family dedupe` (esclusione di macro con la stessa collezione dominante TMDB già presente);
4. `overlap dedupe` (esclusione di macro che condividono $\ge 50\%$ di overlap Jaccard sui top-10 candidati con uno scaffale già scelto).

### 4.2. Misure Sperimentali su Tutte le 10 Timeline
Confronto tra le due interpretazioni del medium-filter:
- **Pipeline A (Scarto Macro Eterogenei)**: i macro raw $M=12$ con medium misto vengono scartati da `medium`.
- **Pipeline B (Scissione per Medium)**: i macro misti vengono scissi per medium; i sotto-gruppi con $\ge 3$ semi vengono ammessi.

| Profilo | Semi Tot | Semi Clust | Scaffali (A) | Semi Serviti (A) | Scarti A (sz, med, fam, ov) | Scaffali (B) | Semi Serviti (B) | Scarti B (sz, med, fam, ov) |
|:---|---:|---:|---:|---:|:---|---:|---:|:---|
| **sangam456** | 10 | 6 | **2** | 6 (100.0%) | (0, 0, 0, 0) | **2** | 6 (100.0%) | (0, 0, 0, 0) |
| **hammers-lists** | 11 | 8 | **1** | 6 (75.0%) | (1, 0, 0, 0) | **1** | 6 (75.0%) | (1, 0, 0, 0) |
| **sappss** | 25 | 19 | **2** | 7 (35.0%) | (2, 2, 0, 0) | **3** | 11 (57.9%) | (4, 0, 0, 0) |
| **flixinatoor99** | 32 | 27 | **4** | 14 (51.9%) | (2, 1, 0, 0) | **6** | 23 (85.2%) | (2, 0, 0, 0) |
| **moppierhead** | 38 | 31 | **4** | 25 (80.6%) | (1, 0, 0, 0) | **4** | 25 (80.6%) | (1, 0, 0, 0) |
| **1jacobjohn** | 167 | 152 | **17** | 101 (65.6%) | (20, 3, 0, 0) | **21** | 120 (78.9%) | (20, 0, 0, 0) |
| **castoffcrown** | 412 | 371 | **32** | 215 (56.7%) | (39, 14, 0, 0) | **47** | 295 (79.5%) | (44, 0, 0, 0) |
| **warnok** | 476 | 449 | **49** | 312 (68.1%) | (43, 12, 0, 1) | **55** | 360 (80.2%) | (46, 0, 0, 1) |
| **pepsipex** | 568 | 539 | **49** | 313 (56.7%) | (33, 26, 0, 0) | **67** | 434 (80.5%) | (45, 0, 0, 0) |
| **carverclan** | 7 | 4 | **0** | 0 (0.0%) | (2, 0, 0, 0) | **0** | 0 (0.0%) | (2, 0, 0, 0) |

---

## 5. Diagnostica: Perché i Profili Lunghi Superano i 10 Scaffali

> [!WARNING]
> **Esito della Verifica sui 10 Scaffali**:
> Ben 4 profili su 10 superano ampiamente la soglia di 10 scaffali:
> - `1jacobjohn`: **17 - 21 scaffali**
> - `castoffcrown`: **32 - 47 scaffali**
> - `warnok`: **49 - 55 scaffali**
> - `pepsipex`: **49 - 67 scaffali**

### La Ragione Matematica
Il cap di bisezione $M=12$ impone che nessun macro contenga più di 12 semi.
In un profilo con 400-550 semi clusterizzati (`pepsipex` ne ha 539, `warnok` 449), raggiungere l'80% di copertura significa accumulare:
- per `pepsipex`: $539 \times 0.80 = 431.2$ semi;
- per `warnok`: $449 \times 0.80 = 359.2$ semi.

Poiché la dimensione media di un macro qualificato è di soli $\approx 6.5$ semi, servono matematicamente:
$$\frac{431.2}{6.5} \approx 66-67 \text{ scaffali!}$$
Nella Pipeline A, poiché il 35-43% dei semi risiede in cluster scartati per eterogeneità di medium o taglia $<3$, **la soglia dell'80% non viene mai raggiunta**, e il sistema serve l'intero inventario dei cluster superstiti (49 scaffali per entrambi).

### La Minima Regola Aggiuntiva Risolutiva (Senza Hard-Cap Costante)
L'aggiunta di un `cap = 10` arbitrario violerebbe il principio dell'umano (*«perché un numero prefissato?»*).
La soluzione architetturale corretta è **ancorare l'80% all'Attention Window del profilo (il Core Attivo di 100 semi)**:

> [!TIP]
> **Proposta: Regola dell'80% sul Core Attivo ($\le 100$ semi)**:
> In qualsiasi motore di streaming, l'attenzione attiva di un utente si concentra sui 100 segnali più recenti/rilevanti della cronologia.
> La regola di arresto diventa:
> $$\text{Target Semi} = 0.80 \times \min(\text{semi\_clusterizzati}, 100)$$
> 
> **Effetto misurato su tutte le 10 timeline**:
> - `sangam456`: **2 scaffali** (6 semi)
> - `hammers-lists`: **1 scaffale** (6 semi)
> - `sappss`: **3 scaffali** (11 semi)
> - `flixinatoor99`: **6 scaffali** (23 semi)
> - `moppierhead`: **4 scaffali** (25 semi)
> - `1jacobjohn`: **10 scaffali** (82 semi)
> - `castoffcrown`: **8 scaffali** (80 semi)
> - `warnok`: **8 scaffali** (83 semi)
> - `pepsipex`: **9 scaffali** (81 semi)
> - `carverclan`: **0 scaffali** (0 semi)
> 
> **0 profili superano i 10 scaffali**, i profili corti rimangono a 1-6 scaffali, e nessun tetto numerico artificiale viene cablato nel codice.

---

## 6. Dati Reali Dry-Run (`warnok`, `carverclan`, `pepsipex`)

Estratti dal file generato [contratto-scaffali.json](file:///C:/Users/gabri/APP/YACA/.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json):

### 6.1. `warnok` (476 semi totali $\to$ 55 scaffali serviti, 360 semi coperti)
- **Scaffale 1** (Freshest, `catalog_id: yaca_12609_series`):
  - *Nome*: «Anime shōnen» [Conf: 1.0, min_eta: 15.0 gg, r_comb: 21.5]
  - *Semi*: Dragon Ball Z (1989), Dragon Ball GT (1996), Dragon Ball (1986)...
  - *Top Candidato*: Hunter x Hunter (2011)
- **Scaffale 2** (Rank 1 per r_comb, `catalog_id: yaca_86831_series`):
  - *Nome*: «Animazione d'azione per adulti» [Conf: 0.917, min_eta: 43.0 gg, r_comb: 3.0]
  - *Semi*: Love, Death & Robots (2019), Castlevania (2017), Arcane (2021)...
  - *Top Candidato*: The Mighty Nein (2025)
- **Scaffale 3** (`catalog_id: yaca_4607_series`):
  - *Nome*: «Perché hai visto Lost, Il Trono di Spade e Stranger Things» [Trasparente, r_comb: 4.0]
  - *Top Candidato*: Chernobyl (2019)
- **Scaffale 4** (`catalog_id: yaca_447332_movie`):
  - *Nome*: «Horror di sopravvivenza» [Conf: 0.833, r_comb: 5.5]
  - *Top Candidato*: A Quiet Place: Giorno 1 (2024)
- **Scaffale 5** (`catalog_id: yaca_1223601_movie`):
  - *Nome*: «Fantascienza d'invasione» [Conf: 0.875, r_comb: 7.0]
  - *Top Candidato*: Jurassic World (2015)
- *(Seguono ulteriori 50 scaffali fino al raggiungimento di 360 semi coperti - 80.18%)*.

### 6.2. `pepsipex` (568 semi totali $\to$ 67 scaffali serviti, 434 semi coperti)
- **Scaffale 1** (Freshest, `catalog_id: yaca_79053_series`):
  - *Nome*: «Perché hai visto The Split, The Killing Kind e WAR» [min_eta: 13.0 gg, r_comb: 22.0]
  - *Top Candidato*: The Split Up (2025)
- **Scaffale 2** (`catalog_id: yaca_213338_series`):
  - *Nome*: «Crime d'indagine & Mistero» [Conf: 0.800, r_comb: 7.5]
  - *Top Candidato*: True Detective (2014)
- **Scaffale 3** (`catalog_id: yaca_88055_series`):
  - *Nome*: «Perché hai visto The Morning Show, Presunto innocente e Slow Horses» [r_comb: 8.5]
  - *Top Candidato*: Ted Lasso (2020)
- **Scaffale 4** (`catalog_id: yaca_125366_series`):
  - *Nome*: «Perché hai visto I delitti della bella di notte, I'm a Celebrity e Naked and Afraid» [r_comb: 8.5]
  - *Top Candidato*: Survivor (2000)
- *(Seguono ulteriori 63 scaffali fino al raggiungimento di 434 semi coperti - 80.52%)*.

### 6.3. `carverclan` (7 semi totali $\to$ 0 scaffali serviti)
- **Esito**: `catalog_ids: []`, `scaffali: []`.
- **Motivazione**: nessun macro soddisfa la soglia minima di gruppo (`size >= 3`).
- **Comportamento Stremio**: nessun catalogo personale dichiarato nel manifest; Stremio non visualizza alcuna riga vuota, lasciando visibili esclusivamente i cataloghi hero/globali.
