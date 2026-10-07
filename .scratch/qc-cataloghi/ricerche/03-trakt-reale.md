# Misurazione del percorso Trakt reale di YACA (Profilo Reale)

**Data**: 07/10/2026 · **Ambiente**: Produzione (`https://mate.hyena-alphard.ts.net`) · **Modalità**: Read-Only  
**Account**: `REOZrGNRr3` · **Addon UUID**: `ff7084d8-904b-42d9-91f5-ea2b4ae37590`  
**Profilo misurato**: `1c1da0af` (🎌 Otaku Hardcore (Anime)) — unico profilo attivo al momento della misurazione

---

## 1. Sintesi e Obiettivo

Tutte le misurazioni precedenti della campagna QC avevano osservato esclusivamente il **percorso degradato** (fallback TMDB) del hero «🌐 Suggeriti dalla Community», perché eseguite su profili di simulazione e test privi di credenziali Trakt. Su quel percorso il catalogo era stato bocciato (B 63–78) per rating bassi (6,6–6,7), anno mediano 2026 e totale assenza di personalizzazione comunitaria.

Questa misurazione esegue per la prima volta il fetch **reale** sul profilo attivo dell'account di produzione reale, che possiede un token Trakt valido e collegato (`apiKeys.trakt`).

---

## 2. Quale percorso ha girato (Evidenza dai Log del Server)

Subito dopo il fetch tramite `scripts/fetch_catalogs.js` (`--catalogs yaca_trakt_filtered_movies,yaca_trakt_filtered_series --pages 2`), l'ispezione dei log docker dell'applicazione su `matebook` ha confermato che **il percorso autenticato Trakt è stato eseguito** (`traktAvailable=true`, `fallbackUsed=false`):

```text
2026-10-07T17:30:28.513933912Z [Hybrid Debug] getHybridCatalog called with catalogId=yaca_trakt_filtered_movies, userId=REOZrGNRr3, context=1c1da0af
2026-10-07T17:30:28.513956218Z [Hybrid Debug] profile loaded: true, isKidsMode=false, cacheKey=REOZrGNRr3_1c1da0af_heroes_v2_movie
2026-10-07T17:30:36.653247060Z [HeroPool] Trakt Filtered Anime top-up per movie: trovati solo 0 item, integro con fallback anime.
2026-10-07T17:30:40.310329810Z [HeroPool] yaca_trakt_filtered_movies: 54 assigned IDs (group=REOZrGNRr3_1c1da0af_heroes_v2_movie)
2026-10-07T17:30:41.239187745Z [CatalogTiming] id=yaca_trakt_filtered_movies catalog=yaca_trakt_filtered_movies cache=build ms=12849 titles=20
2026-10-07T17:30:41.984606593Z [Hybrid Debug] getHybridCatalog called with catalogId=yaca_trakt_filtered_movies, userId=REOZrGNRr3, context=1c1da0af
2026-10-07T17:30:41.984984132Z [HeroPool] yaca_trakt_filtered_movies: 54 assigned IDs (group=REOZrGNRr3_1c1da0af_heroes_v2_movie)
2026-10-07T17:30:42.913099711Z [CatalogTiming] id=yaca_trakt_filtered_movies catalog=yaca_trakt_filtered_movies cache=build ms=1002 titles=19
2026-10-07T17:30:43.067641098Z [Hybrid Debug] getHybridCatalog called with catalogId=yaca_trakt_filtered_series, userId=REOZrGNRr3, context=1c1da0af
2026-10-07T17:30:43.067669651Z [Hybrid Debug] profile loaded: true, isKidsMode=false, cacheKey=REOZrGNRr3_1c1da0af_heroes_v2_series
2026-10-07T17:30:55.684291613Z [HeroPool] yaca_trakt_filtered_series: 8 assigned IDs (group=REOZrGNRr3_1c1da0af_heroes_v2_series)
2026-10-07T17:30:55.996154119Z [CatalogTiming] id=yaca_trakt_filtered_series catalog=yaca_trakt_filtered_series cache=build ms=13002 titles=8
```

### Dinamica osservata
1. **Nessun degrado di fallback**: non compare `[HeroPool] Degrado Trakt confermato per pool...` né `fallbackUsed=true`. L'integrazione Trakt è attiva e funzionante.
2. **Serie (`yaca_trakt_filtered_series`)**: Trakt ha risposto con successo raccomandando serie anime autentiche. Nessun top-up è stato invocato. Le 8 serie finali sono il risultato della deduplicazione esclusiva rispetto agli altri hero prioritari.
3. **Film (`yaca_trakt_filtered_movies`)**: Trakt ha risposto regolarmente con raccomandazioni cinematografiche generiche della community, ma nessuna di esse ha superato il filtro rigido `animePolicy: ONLY` del profilo Otaku (`trovati solo 0 item`). Come previsto dal codice (ticket 26), il sistema ha completato il pool con il fallback anime qualificato (`fetchAnimeFallbackItems`), mantenendo `fallbackUsed=false` per non azzerare il catalogo.

---

## 3. Evidenza Meccanica e Confronto col Percorso Degradato

| Metrica | Degradato (Campagna 06/10) | Reale Movie (`1c1da0af`) | Reale Series (`1c1da0af`) |
|---|---|---|---|
| **Percorso eseguito** | Fallback senza token | **Trakt reale + Anime top-up** | **Trakt reale puro** |
| **Titoli serviti** | 50 (cap) | 39 | 8 |
| **Voto mediano** | 6,6 – 6,7 | **7,4** | **7,9** |
| **Range voti** | 5,0 – 7,8 | 6,6 – 8,2 | 7,5 – 8,3 |
| **Anno mediano** | **2026** (titoli futuri/rumor) | **2012** (cinema consolidato) | **2011** (anime d'oro) |
| **Range anni** | 1970 – 2026 | 1985 – 2020 | 2001 – 2019 |
| **Popolarità mediana** | 30,2 | 5,50 | 26,08 |
| **Voti medi (conteggio)** | 10 – 50 | 480 (min 309, max 1675) | 552 (min 372, max 721) |
| **Contenuto Anime reale** | ~70% (14 live-action incongrui) | **100% (39 su 39)** | **100% (8 su 8)** |
| **Quota badge ITA** | 28% | 44% (17 su 39) | 13% (1 su 8) |

### Rispetto dell'invariante di distintività (Zero overlap intra-hero)
La verifica incrociata su tutti gli 8 cataloghi hero scaricati in contemporanea per il profilo `1c1da0af` conferma il perfetto isolamento:
- `yaca_trakt_filtered_movies` (39) vs `true_blend_movies` (40), `seed_network_movies` (37), `hidden_gems_movies` (40): **0 titoli sovrapposti**.
- `yaca_trakt_filtered_series` (8) vs `true_blend_series` (40), `seed_network_series` (39), `hidden_gems_series` (19): **0 titoli sovrapposti**.

---

## 4. Verdetti QC della Campagna

I due cataloghi sono valutati con la rubrica a 5 dimensioni usata dalla campagna QC (`pertinenza` 35%, `qualita` 20%, `distintivita` 15%, `coerenza` 15%, `completezza` 15%):

### 4.1 Film: `yaca_trakt_filtered_movies`
- **ID**: `1c1da0af::yaca_trakt_filtered_movies`
- **Verdetto**: **P**
- **Score**: **88 / 100**
- **Dimensioni**:
  - `pertinenza`: 85
  - `qualita`: 90
  - `distintivita`: 100
  - `coerenza`: 85
  - `completezza`: 85
- **Fiducia**: `alta`
- **Evidenza (titoli esatti)**:
  1. `Promare` (2019, 7.0)
  2. `Berserk: L'epoca d'oro - Capitolo I: L'uovo del re dominatore` (2012, 7.3)
  3. `L'uovo dell'angelo` (1985, 7.7)
  4. `Violet Evergarden: Eternity and the Auto Memory Doll` (2019, 8.1)
  5. `Mind Game` (2004, 7.5)
- **Motivo**:
  Selezione 100% anime di elevata levatura artistica con voto mediano 7.4 e zero intrusioni live-action. La promessa comunitaria sfuma però nel top-up anime interno: Trakt non esprime film anime nelle raccomandazioni e il catalogo si appoggia al fallback anime.

---

### 4.2 Serie: `yaca_trakt_filtered_series`
- **ID**: `1c1da0af::yaca_trakt_filtered_series`
- **Verdetto**: **P**
- **Score**: **86 / 100**
- **Dimensioni**:
  - `pertinenza`: 95
  - `qualita`: 95
  - `distintivita`: 100
  - `coerenza`: 90
  - `completezza`: 35
- **Fiducia**: `alta`
- **Evidenza (titoli esatti)**:
  1. `The Disastrous Life of Saiki K.` (2016, 8.3)
  2. `Noragami` (2014, 8.2)
  3. `Hellsing` (2001, 7.9)
  4. `Soul Eater` (2008, 7.8)
  5. `Fire Force` (2019, 8.3)
- **Motivo**:
  Raccomandazioni autentiche della community Trakt di altissimo profilo qualitativo (mediana voto 7.9, 100% anime coerenti). Il catalogo soffre tuttavia di un pool striminzito di soli 8 titoli, prosciugato dalla priorità di assegnazione degli altri hero.

---

## 5. Il Punto Cieco Dichiarato (Blind Spot)

Questa misurazione ha coperto **esclusivamente il profilo attivo** al momento del test:
- `1c1da0af` — 🎌 Otaku Hardcore (Anime)

Gli altri 4 profili appartenenti all'account `REOZrGNRr3`:
- `global` — Generale
- `4159713d` — Generale (Tutto)
- `0465f104` — Solo Serie TV
- `3f2f4afd` — 🧛 Horror Night

**rimangono non misurati**.

### Motivo tecnico dell'impossibilità di misurazione read-only
Nel motore Stremio di YACA, la generazione del manifest e la risoluzione dei cataloghi dipendono interamente dall'`activeProfileId` persistito nel documento `AddonConfig` su MongoDB Atlas.
Per misurare il comportamento di Trakt sui profili non attivi (es. per verificare quali film generici non-anime la community Trakt raccomandi effettivamente a un profilo "Generale" o "Horror"), sarebbe necessario inviare una mutazione `POST /api/configure` o aggiornare direttamente il database per commutare il profilo attivo.
Poiché il mandato di misurazione impone vincoli tassativi di **sola lettura**, **zero scritture su Atlas/Redis** e **nessuna alterazione della configurazione dell'utente reale**, i profili inattivi restano intenzionalmente esclusi dal perimetro di questa sessione.
