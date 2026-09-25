# Riproduzione e Verifica Baseline: Bug Selettori di Tipo ("Solo Anime" / "No Anime")

**Data**: 2026-09-24  
**Worktree**: `C:\Users\gabri\.yaca-wt\repro-tsel`  
**Branch**: `repro/type-selectors-baseline` (commit baseline `a5a0e45`)  
**Stato Bug**: **CONFERMATO AL 100% (RIPRODOTTO)**  

---

## 1. Causa Radice Confermata

L'ipotesi iniziale è stata **pienamente confermata** dall'analisi statica e dinamica:

1. **Frontend Serialization Drop** ([`profilesToApiPayload`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/frontend/src/lib/utils.ts#L53-L72)):
   In `frontend/src/lib/utils.ts`, la funzione `profilesToApiPayload(profiles)` estrae esplicitamente solo un sottoinsieme di campi da `p.settings`:
   ```ts
   settings: {
     fastPresetRefresh: p.settings?.fastRefresh ?? false,
     tmdbKey: p.settings?.tmdbKey,
     kidsMode: p.settings?.kidsMode ?? false,
     animeIdMode: p.settings?.animeIdMode ?? 'kitsu',
     manualDNA: p.settings?.manualDNA ?? [],
     suggestedDNA: p.settings?.suggestedDNA ?? [],
   }
   ```
   Il campo `typeSelectors` viene **completamente escluso** dal payload inviato a `POST /api/configure`. Di conseguenza, qualsiasi selezione utente effettuata nell'UI ("Solo Anime", "No Anime", "Solo Film", "Solo Serie") viene persa durante il salvataggio.

2. **Frontend Deserialization Drop** ([`mapBackendProfile`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/frontend/src/lib/utils.ts#L74-L139)):
   In `frontend/src/lib/utils.ts`, la funzione `mapBackendProfile(backendProfile)` mappa i campi da `bSettings` al profilo dell'UI senza leggere `bSettings.typeSelectors`. Anche se il backend possedesse i valori corretti, la UI non li rilegge mai.

3. **Backend Perfettamente Funzionante**:
   - [`src/api/configure/profileProcessor.js:139`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/src/api/configure/profileProcessor.js#L139): accetta `...(input.settings || {})`, salvando `typeSelectors` se presente.
   - [`src/api/stremio.js:292,300,325`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/src/api/stremio.js#L292-L335): legge `profile?.settings?.typeSelectors` e filtra sia gli hero cataloghi che i preset utente tramite [`isCatalogConformant()`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/src/catalog/catalogKind.js#L187).
   - [`src/handlers/catalogHandler.js:387,437-450`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/src/handlers/catalogHandler.js#L384-L450): applica sia la guardia sui cataloghi non conformi (`return { metas: [] }`), sia il filtraggio post-fetch sugli item per `animeSelector === 'exclude'` o `'only'`.

---

## 2. Comandi Eseguiti

1. **Compilazione ed Esecuzione Frontend (Task 1)**:
   Transpilazione CommonJS di `frontend/src/lib/utils.ts` con compilatore TypeScript `5.9.3`:
   - Verifica di `profilesToApiPayload` con profilo UI avente `settings.typeSelectors = { film:false, serie:false, anime:'only' }`.
   - Verifica di `mapBackendProfile` con profilo backend avente `settings.typeSelectors = { film:false, serie:false, anime:'only' }`.

2. **Avvio Server YACA (Task 2)**:
   ```powershell
   $env:DISABLE_TMDB_DUMP="1"; $env:PORT="7032"; node index.js
   ```

3. **Esecuzione QA Harness Riutilizzabile (Task 3)**:
   ```powershell
   node scripts/qa/verifyTypeSelectors.js --base-url http://127.0.0.1:7032 --frontend-utils frontend/src/lib/utils.ts
   ```

---

## 3. Output Grezzi

```text
=== VERIFICA COMPLETA TYPE SELECTORS (QA TEST HARNESS) ===
Base URL: http://127.0.0.1:7032
Frontend utils.ts: C:\Users\gabri\.yaca-wt\repro-tsel\frontend\src\lib\utils.ts

[FASE 1] Verifica Modulo Frontend: frontend/src/lib/utils.ts
Controllo 1.1: profilesToApiPayload() include typeSelectors nel payload?
  Payload settings generato: {"fastPresetRefresh":false,"tmdbKey":"test-key","kidsMode":false,"animeIdMode":"kitsu","manualDNA":[],"suggestedDNA":[]}
  'typeSelectors' presente nel payload: false
  Verdetto Controllo 1.1: [FAIL] (BUG CONFERMATO: typeSelectors omesso nel payload inviato al backend)

Controllo 1.2: mapBackendProfile() rilegge typeSelectors dal backend?
  Profile settings mappato: {"fastRefresh":false,"tmdbKey":"test-key","kidsMode":false,"animeIdMode":"kitsu","manualDNA":[],"suggestedDNA":[]}
  'typeSelectors' presente nel profilo UI: false
  Verdetto Controllo 1.2: [FAIL] (BUG CONFERMATO: typeSelectors non riletto dal backend)

[FASE 2] Verifica End-to-End su Server: http://127.0.0.1:7032
Esecuzione Scenario (a): baseline senza typeSelectors (payload frontend attuale)...
  Cataloghi nel manifest: 13
    - [movie] yaca_preset_preset_pop_movies: 18 items (0 anime, 18 non-anime)
    - [movie] yaca_preset_preset_ghibli: 20 items (20 anime, 0 non-anime)
    - [series] yaca_preset_preset_pop_series: 20 items (0 anime, 20 non-anime)
    - [series] yaca_preset_preset_pop_anime: 20 items (20 anime, 0 non-anime)

Esecuzione Scenario (b): typeSelectors = { anime: 'only' }...
  Cataloghi nel manifest: 9
    - [movie] yaca_preset_preset_pop_movies: 0 items (0 anime, 0 non-anime)
    - [movie] yaca_preset_preset_ghibli: 20 items (20 anime, 0 non-anime)
    - [series] yaca_preset_preset_pop_series: 0 items (0 anime, 0 non-anime)
    - [series] yaca_preset_preset_pop_anime: 20 items (20 anime, 0 non-anime)

Esecuzione Scenario (c): typeSelectors = { anime: 'exclude' }...
  Cataloghi nel manifest: 11
    - [movie] yaca_preset_preset_pop_movies: 18 items (0 anime, 18 non-anime)
    - [movie] yaca_preset_preset_ghibli: 0 items (0 anime, 0 non-anime)
    - [series] yaca_preset_preset_pop_series: 20 items (0 anime, 20 non-anime)
    - [series] yaca_preset_preset_pop_anime: 0 items (0 anime, 0 non-anime)

Controllo 2.1: Filtraggio Manifest Backend -> [PASS]
Controllo 2.2: Filtraggio Items e Guardia Cataloghi Backend -> [PASS]

RIEPILOGO VERDETTI:
[FAIL] 1. Frontend profilesToApiPayload() (salvataggio typeSelectors)
[FAIL] 2. Frontend mapBackendProfile() (caricamento typeSelectors)
[PASS] 3. Backend Manifest filtering (isolamento cataloghi anime/non-anime)
[PASS] 4. Backend Catalog Handler filtering (guardie e filtraggio item)
ESITO COMPLESSIVO: BUG RIPRODOTTO (FRONTEND GUASTO, BACKEND FUNZIONANTE)
```

---

## 4. Dettaglio Numeri dei Tre Casi End-to-End

Utente di test: `sim_user_repro` (profilo di test isolato con 6 preset selezionati: `yaca_true_blend_movies`, `yaca_true_blend_series`, `preset_pop_movies`, `preset_pop_series`, `preset_ghibli`, `preset_pop_anime`).

### Caso (a): Baseline (Payload attuale Frontend senza `typeSelectors`)
- **Cataloghi Manifest (13 totali)**:
  - 7 fissi/utility: 2 TMDB Search (`yaca_search_standard`), 2 AI Search (`yaca_search_ai`), 3 Watchlist (`yaca_watchlist_movies`, `yaca_watchlist_series`, `yaca_watchlist_anime`)
  - 2 Hero: `yaca_true_blend_movies` [movie], `yaca_true_blend_series` [series]
  - 4 Preset: `yaca_preset_preset_pop_movies` [movie], `yaca_preset_preset_pop_series` [series], `yaca_preset_preset_ghibli` [movie], `yaca_preset_preset_pop_anime` [series]
- **Cataloghi Campionati (Item e composizione Anime)**:
  - Film non-anime (`yaca_preset_preset_pop_movies`): **18 items (0 anime, 18 non-anime)**
  - Film anime (`yaca_preset_preset_ghibli`): **20 items (20 anime, 0 non-anime)**
  - Serie non-anime (`yaca_preset_preset_pop_series`): **20 items (0 anime, 20 non-anime)**
  - Serie anime (`yaca_preset_preset_pop_anime`): **20 items (20 anime, 0 non-anime)**

### Caso (b): Backend con `typeSelectors = { anime: 'only' }`
- **Cataloghi Manifest (9 totali)**:
  - 7 fissi/utility (sempre presenti)
  - 2 Preset Anime: `yaca_preset_preset_ghibli` [movie], `yaca_preset_preset_pop_anime` [series]
  - *Esclusi dal manifest*: i 2 hero e i 2 preset non-anime (`pop_movies`, `pop_series`)
- **Cataloghi Campionati (Item e composizione Anime)**:
  - Film non-anime (`yaca_preset_preset_pop_movies`): **0 items** (bloccato da guardia catalogHandler in quanto non conforme)
  - Film anime (`yaca_preset_preset_ghibli`): **20 items (20 anime, 0 non-anime)**
  - Serie non-anime (`yaca_preset_preset_pop_series`): **0 items** (bloccato da guardia catalogHandler)
  - Serie anime (`yaca_preset_preset_pop_anime`): **20 items (20 anime, 0 non-anime)**

### Caso (c): Backend con `typeSelectors = { anime: 'exclude' }`
- **Cataloghi Manifest (11 totali)**:
  - 7 fissi/utility (sempre presenti)
  - 2 Hero: `yaca_true_blend_movies`, `yaca_true_blend_series`
  - 2 Preset non-anime: `yaca_preset_preset_pop_movies` [movie], `yaca_preset_preset_pop_series` [series]
  - *Esclusi dal manifest*: i 2 preset anime (`ghibli`, `pop_anime`)
- **Cataloghi Campionati (Item e composizione Anime)**:
  - Film non-anime (`yaca_preset_preset_pop_movies`): **18 items (0 anime, 18 non-anime)**
  - Film anime (`yaca_preset_preset_ghibli`): **0 items** (bloccato da guardia catalogHandler)
  - Serie non-anime (`yaca_preset_preset_pop_series`): **20 items (0 anime, 20 non-anime)**
  - Serie anime (`yaca_preset_preset_pop_anime`): **0 items** (bloccato da guardia catalogHandler)

---

## 5. Tabella di Riepilogo Controlli e Verdetti

| ID | Controllo | Esito Baseline | Significato |
|---|---|---|---|
| **1.1** | `profilesToApiPayload()` serializza `typeSelectors` | **FAIL** | Bug dimostrato: il frontend scarta l'oggetto `typeSelectors` al salvataggio |
| **1.2** | `mapBackendProfile()` deserializza `typeSelectors` | **FAIL** | Bug dimostrato: il frontend non rilegge `typeSelectors` dal backend |
| **2.1** | Backend manifest filtering con `typeSelectors` | **PASS** | Backend sano: 13 -> 9 (only) -> 11 (exclude) cataloghi nel manifest |
| **2.2** | Backend catalog guard & item filtering | **PASS** | Backend sano: restituisce 0 items per cataloghi non conformi e filtra item |

---

## 6. Script Riutilizzabile

Path: `scripts/qa/verifyTypeSelectors.js`  
Comando per riesecuzione:
```powershell
node scripts/qa/verifyTypeSelectors.js --base-url http://127.0.0.1:7032 --frontend-utils frontend/src/lib/utils.ts
```
Oppure per verificare un worktree/branch con il fix:
```powershell
node scripts/qa/verifyTypeSelectors.js --base-url http://127.0.0.1:7032 --frontend-utils ../fix-type-selectors/frontend/src/lib/utils.ts --strict-pass
```
