# Contratto degli Scaffali YACA (Ticket 08)

Documento di specifica per l'integrazione tra il motore di raccomandazione V45 (ricetta congelata a 12 passi con budget $N = 6$, $\tau=0.03$, vicinato allargato top-100 coseno) e le superfici di fruizione di YACA (Stremio Addon, Pool di raccomandazione e API Web), aggiornato con l'adozione definitiva di **$N = 6$ scaffali per profilo**.

Il file dati dry-run generato con dati reali per `warnok`, `castoffcrown` e `pepsipex` è collocato accanto a questo documento:
[contratto-scaffali.json](file:///C:/Users/gabri/APP/YACA/.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json).

---

## 1. Il Vincolo Architetturale e il Meccanismo di Reconcile

### 1.1. Come Stremio dichiara e consuma i cataloghi
In [src/stremio/manifest.js](file:///C:/Users/gabri/APP/YACA/src/stremio/manifest.js#L77-L125), `buildManifest()` compone l'array `catalogs`. Il client Stremio interroga esclusivamente gli ID presenti nel proprio manifest locale tramite:
`GET /:userHandle/catalog/:type/:id.json`
Se un catalogo non è dichiarato nel manifest, Stremio non lo richiede mai. In [src/pool/index.js](file:///C:/Users/gabri/APP/YACA/src/pool/index.js#L37-L421), la tabella dei ruoli serviti `RUOLI_SERVITI` scarta a `nonServiti` qualsiasi ID non mappato.

### 1.2. Decisione del Produttore: Adozione del Budget N = 6 e Spesa per Copertura
L'alternativa non vincolata produceva 51 scaffali su `pepsipex` e 32 su `castoffcrown`, insostenibili per l'utente.
Un budget fisso è giustificato e non arbitrario se speso per massimizzare la diversità degli interessi serviti:
1. **Budget N = 6**: ogni profilo riceve fino a un massimo di 6 scaffali qualificati (i profili corti ne ricevono meno se non hanno abbastanza gruppi qualificati, es. 2 per `sangam456` e `carverclan`);
2. **Spesa ingorda per copertura (greedy)**: a ogni passo si seleziona lo scaffale che copre il maggior numero di semi non ancora rappresentati;
3. **Manifest per profilo con Reconciler automatico**: in [src/stremio/reconciler.js](file:///C:/Users/gabri/APP/YACA/src/stremio/reconciler.js#L36-L100), il sistema sincronizza istantaneamente la collezione Stremio tramite `updateStremioAddonCollection(stremioAuthKey, manifestUrl)` solo quando cambiano i cluster qualificati (stabilità degli ID garantita).

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

## 4. La Catena a 12 Passi con Budget N = 6 e Spesa per Copertura

### 4.1. Definizione della Regola Adottata
La selezione degli scaffali non si arresta su percentuali teoriche di copertura (la regola dell'80% falliva producendo fino a 67 scaffali), bensì applica un **budget fisso $N = 6$ speso ingordamente (greedy) per massimizzare i semi non ancora coperti**.

I vincoli rigidi applicati sono:
1. **Staple Diet Split**: bisezione ricorsiva di qualsiasi macro $> 40$ semi (nessun monolite da 65 semi);
2. **Unnameable Rule**: bisezione dei gruppi non nominabili $> 12$ semi; gruppi $\le 12$ qualificati come fallback «Perché hai visto»;
3. **Adaptive Floor**: soglia minima $\min(4, \max(2, \lceil \text{semi} / 4 \rceil))$;
4. **Al massimo 1 scaffale per etichetta di tassonomia** all'interno dello stesso profilo;
5. **Family dedupe**: esclusione di macro con la stessa collezione dominante TMDB già presente;
6. **Overlap dedupe**: esclusione di macro che condividono $\ge 50\%$ di overlap Jaccard sui top-10 candidati raccomandati con uno scaffale già scelto;
7. **Ordinamento display**: slot 1 riservato rigidamente allo scaffale con $\min(\text{min\_eta})$ (il titolo più recente visto dall'utente), slot 2..N ordinati per $r_{\text{comb}}$.

### 4.2. Misure Sperimentali su Tutte le 10 Timeline con N = 6

| Profilo | Semi Tot | Semi Clust | Floor Usato | Scaffali Serviti | Semi Coperti (%) | Etichette Servite |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `sangam456` | 10 | 6 | **3** | **2** | 6 (100.0%) | «Fantascienza d'invasione», «Perché hai visto The White Lotus...» |
| `carverclan` | 7 | 4 | **2** | **2** | 4 (100.0%) | «Horror soprannaturale», «Teatro filmato & Musical» |
| `hammers-lists` | 11 | 8 | **3** | **1** | 6 (75.0%) | «Medical drama» (con floor 2: + «Sitcom animate», 100%) |
| `sappss` | 25 | 20 | **4** | **2** | 10 (50.0%) | «Perché hai visto Euphoria...», «Animazione per famiglie» |
| `flixinatoor99` | 32 | 27 | **4** | **2** | 14 (51.9%) | «Perché hai visto Il Boss del condominio...», «Perché hai visto Apex...» |
| `moppierhead` | 38 | 31 | **4** | **5** | 29 (93.5%) | «Magia & Stregoneria», «Animazione d'azione per adulti», «Anime shōnen», «Giallo investigativo», «Perché hai visto Hannah Montana...» |
| `1jacobjohn` | 167 | 154 | **4** | **6** | 80 (51.9%) | «Sitcom animate», «Animazione d'azione per adulti», «Docufiction true crime», «Cinecomic & Supereroi», 2x «Perché hai visto...» |
| `castoffcrown` | 412 | 379 | **4** | **6** | 104 (27.4%) | «Anime shōnen», «Anime romantici & slice of life», «Dramma coreano», 3x «Perché hai visto...» |
| `warnok` | 476 | 458 | **4** | **6** | 153 (33.4%) | «Animazione d'azione per adulti», «Anime shōnen», «Space opera», «Fantascienza d'invasione», «Cinecomic & Supereroi», «Animazione per famiglie» |
| `pepsipex` | 568 | 552 | **4** | **6** | 143 (25.9%) | «Spy thriller», «Dramma d'epoca», «Horror soprannaturale», «Giallo investigativo», «Gangster & Criminalità», «Perché hai visto Succession...» |

---

## 5. Dati Reali Dry-Run N = 6 (`warnok`, `castoffcrown`, `pepsipex`)

Estratti dal file generato [contratto-scaffali.json](file:///C:/Users/gabri/APP/YACA/.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json):

### 5.1. `warnok` (476 semi totali, 458 clust $\to$ 6 scaffali serviti, 153 semi coperti, 33.4%)
- **Slot 1** (Freshest, `catalog_id: yaca_86831_series`):
  - *Nome*: «Animazione d'azione per adulti» [tassonomia, 22 semi, min_eta: 44.0 gg, r_comb: 5.5]
  - *Semi campione*: Love, Death & Robots (2019), Castlevania (2017), Arcane (2021)
  - *Top Candidati*: The Mighty Nein, The Boys Presenta: Diabolico!
- **Slot 2** (`catalog_id: yaca_46260_series`):
  - *Nome*: «Anime shōnen» [tassonomia, 40 semi, min_eta: 83.0 gg, r_comb: 3.5]
  - *Semi campione*: Hunter x Hunter, Bleach, Naruto Shippuden
  - *Top Candidati*: Hunter x Hunter, The Promised Neverland
- **Slot 3** (`catalog_id: yaca_82856_movie`):
  - *Nome*: «Space opera» [tassonomia, 26 semi, min_eta: 89.0 gg, r_comb: 5.5]
  - *Semi campione*: Dune (2021), Star Wars (1977), Rogue One
  - *Top Candidati*: Terminator, Matrix Reloaded
- **Slot 4** (`catalog_id: yaca_447332_movie`):
  - *Nome*: «Fantascienza d'invasione» [tassonomia, 13 semi, min_eta: 103.0 gg, r_comb: 9.0]
  - *Semi campione*: A Quiet Place, Independence Day
  - *Top Candidati*: Dune - Parte due, Nessuno ti salverà
- **Slot 5** (`catalog_id: yaca_100402_movie`):
  - *Nome*: «Cinecomic & Supereroi» [tassonomia, 29 semi, min_eta: 734.0 gg, r_comb: 6.5]
  - *Semi campione*: Captain America, The Avengers, Iron Man
  - *Top Candidati*: Ant-Man and the Wasp: Quantumania, Doctor Strange nel Multiverso della Follia
- **Slot 6** (`catalog_id: yaca_324857_movie`):
  - *Nome*: «Animazione per famiglie» [tassonomia, 23 semi, min_eta: 544.0 gg, r_comb: 9.5]
  - *Semi campione*: Spider-Man: Un nuovo universo, Zootropolis
  - *Top Candidati*: Spider-Man: Across the Spider-Verse, Il gatto con gli stivali 2

### 5.2. `castoffcrown` (412 semi totali, 379 clust $\to$ 6 scaffali serviti, 104 semi coperti, 27.4%)
- **Slot 1** (Freshest, `catalog_id: yaca_37854_series`):
  - *Nome*: «Anime shōnen» [tassonomia, 26 semi, min_eta: 12.0 gg, r_comb: 3.0]
  - *Semi campione*: Haikyu!! L'asso del volley (2014), My Hero Academia (2016), Aoashi (2022)
  - *Top Candidati*: Hunter x Hunter, One-Punch Man
- **Slot 2** (`catalog_id: yaca_285788_series`):
  - *Nome*: «Anime romantici & slice of life» [tassonomia, 31 semi, min_eta: 18.0 gg, r_comb: 2.0]
  - *Semi campione*: Kaguya-sama: Love Is War, Horimiya, Fruits Basket
  - *Top Candidati*: Hana-Kimi, A Star Brighter than the Sun
- **Slot 3** (`catalog_id: yaca_119769_series`):
  - *Nome*: «Dramma coreano» [tassonomia, 11 semi, min_eta: 12.0 gg, r_comb: 5.5]
  - *Semi campione*: Strangers From Hell, A Shop for Killers, Four Hands Two Sonatas
  - *Top Candidati*: Venticinque e ventuno, Rugal
- **Slot 4** (`catalog_id: yaca_9323_movie`):
  - *Nome*: «Perché hai visto Ghost in the Shell, Toy Story - Il mondo dei giocattoli e Paprika - Sognando un sogno» [fallback, 12 semi, min_eta: 24.0 gg, r_comb: 6.0]
  - *Semi campione*: Toy Story 4 (2019), Ghost in the Shell (1995), Paprika (2006)
  - *Top Candidati*: Si alza il vento, Kiki - Consegne a domicilio
- **Slot 5** (`catalog_id: yaca_400617_movie`):
  - *Nome*: «Perché hai visto Il filo nascosto, Ubriaco d'amore e Synecdoche, New York» [fallback, 12 semi, min_eta: 26.0 gg, r_comb: 7.0]
  - *Semi campione*: Il filo nascosto (2017), Chiamami col tuo nome (2017)
  - *Top Candidati*: Vizio di forma, The Master
- **Slot 6** (`catalog_id: yaca_78797_series`):
  - *Nome*: «Perché hai visto Wok of Love, Las crónicas del taco e Bourdain: cucine segrete» [fallback, 12 semi, min_eta: 43.0 gg, r_comb: 9.0]
  - *Semi campione*: Las crónicas del taco (2019), Bourdain: cucine segrete (2013)
  - *Top Candidati*: Tucci in Italy, Street Food: Asia

### 5.3. `pepsipex` (568 semi totali, 552 clust $\to$ 6 scaffali serviti, 143 semi coperti, 25.9%)
- **Slot 1** (Freshest, `catalog_id: yaca_95480_series`):
  - *Nome*: «Spy thriller» [tassonomia, 27 semi, min_eta: 15.0 gg, r_comb: 3.5]
  - *Semi campione*: Slow Horses, Lioness, The Agency
  - *Top Candidati*: Secret Service, 1923
- **Slot 2** (`catalog_id: yaca_93812_series`):
  - *Nome*: «Dramma d'epoca» [tassonomia, 26 semi, min_eta: 35.0 gg, r_comb: 4.5]
  - *Semi campione*: La valle dell'Eden, The Forsytes, Downton Abbey
  - *Top Candidati*: Becoming Elizabeth, Bridgerton
- **Slot 3** (`catalog_id: yaca_713704_movie`):
  - *Nome*: «Horror soprannaturale» [tassonomia, 34 semi, min_eta: 90.0 gg, r_comb: 4.5]
  - *Semi campione*: Hereditary, The Conjuring, Insidious
  - *Top Candidati*: Five Nights at Freddy's 2, Train Dreams
- **Slot 4** (`catalog_id: yaca_76331_series`):
  - *Nome*: «Perché hai visto Succession, House of the Dragon e La ruota del tempo» [fallback, 12 semi, min_eta: 88.0 gg, r_comb: 7.0]
  - *Semi campione*: Succession (2018), House of the Dragon (2022), La ruota del tempo (2021)
  - *Top Candidati*: The Shannara Chronicles, Il Trono di Spade
- **Slot 5** (`catalog_id: yaca_106454_movie`):
  - *Nome*: «Giallo investigativo» [tassonomia, 31 semi, min_eta: 118.0 gg, r_comb: 7.0]
  - *Semi campione*: Assassinio sull'Orient Express, Knives Out
  - *Top Candidati*: Enola Holmes, Cena con delitto - Knives Out
- **Slot 6** (`catalog_id: yaca_69740_series`):
  - *Nome*: «Gangster & Criminalità» [tassonomia, 13 semi, min_eta: 99.0 gg, r_comb: 10.0]
  - *Semi campione*: Gomorra, Peaky Blinders, Narcos
  - *Top Candidati*: Regina del Sud, Top Boy
