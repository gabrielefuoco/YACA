# Verifica Indipendente Fix: Selettori di Tipo ("Solo Anime" / "No Anime")

**Data**: 2026-09-24  
**Worktree Verificatore**: `C:\Users\gabri\.yaca-wt\repro-tsel` (branch `repro/type-selectors-baseline`)  
**Worktree con Fix**: `C:\Users\gabri\.yaca-wt\fix-type-selectors` (branch `fix/type-selectors`)  
**Verdetto Complessivo**: **TUTTI I TEST SUPERATI (FIX VERIFICATO CON SUCCESSO)**  

---

## 1. Verdetto Sintetico Controlli

| ID | Controllo | Esito | Dettaglio |
|---|---|---|---|
| **1.1** | `profilesToApiPayload()` include `typeSelectors` | **PASS** | Nel file fixed, l'oggetto `typeSelectors` viene serializzato fedelmente |
| **1.2** | `mapBackendProfile()` include `typeSelectors` | **PASS** | Nel file fixed, `typeSelectors` viene rimappato nel profilo UI |
| **1.3** | `sanitizeTypeSelectors()` normalizza valori sporchi | **PASS** | Valori sporchi (es. `{film:'true', serie:42, anime:'junk'}`) ricadono sul default `{film:false, serie:false, anime:null}` |
| **2.1** | Prova A/B Reale: Lato Baseline non cambia manifest | **PASS** | Baseline con `only` ed `exclude` produce sempre 13 cataloghi (bug confermato come nell'app) |
| **2.2** | Prova A/B Reale: Lato Fixed cambia manifest | **PASS** | Fixed con `only` produce 9 cataloghi, con `exclude` produce 11 cataloghi |
| **3.1** | Round-Trip: 4 stati canonici | **PASS** | `{film:true}`, `{serie:true}`, `{anime:'only'}`, `{anime:'exclude'}` persistono e rientrano identici |
| **3.2** | Round-Trip: sanitizzazione input sporchi | **PASS** | Valori malformati tornano correttamente al default |
| **4.1** | Risoluzione dubbio: assenti vs 0 item | **PASS** | I cataloghi non conformi sono **100% assenti dal manifest**; la guardia a 0 item scatta solo su chiamate HTTP dirette |

---

## 2. Prova A/B Guidata dalla Funzione Reale

I payload sono stati generati chiamando **realmente** la funzione [`profilesToApiPayload()`](file:///C:/Users/gabri/.yaca-wt/fix-type-selectors/frontend/src/lib/utils.ts#L71) esportata dai rispettivi file `utils.ts`, senza payload cablati a mano.

Utente di test: `sim_user_repro_v`.  
Preset selezionati nel profilo (6): `yaca_true_blend_movies`, `yaca_true_blend_series`, `preset_pop_movies`, `preset_pop_series`, `preset_ghibli`, `preset_pop_anime`.

### Lato Baseline (`repro-tsel/frontend/src/lib/utils.ts` - Codice pre-fix)
- **Profilo UI con `{anime:'only'}`**:
  - `profilesToApiPayload` genera `settings`: `{"fastPresetRefresh":false,"kidsMode":false,"animeIdMode":"kitsu"}` (`typeSelectors` assente!)
  - Manifest Stremio risultante: **13 cataloghi** (nessun filtro applicato)
  - Film Popolari (`preset_pop_movies`): 18 item (0 anime)
  - Studio Ghibli (`preset_ghibli`): 20 item (20 anime)
- **Profilo UI con `{anime:'exclude'}`**:
  - `profilesToApiPayload` genera `settings`: `{"fastPresetRefresh":false,"kidsMode":false,"animeIdMode":"kitsu"}` (`typeSelectors` assente!)
  - Manifest Stremio risultante: **13 cataloghi** (identico a prima!)
  - Film Popolari (`preset_pop_movies`): 18 item (0 anime)
  - Studio Ghibli (`preset_ghibli`): 20 item (20 anime)
- **Esito Baseline**: Il manifest **non cambia affatto** (13 == 13). Dimostrazione lampante del bug avvertito dall'utente.

### Lato Fixed (`fix-type-selectors/frontend/src/lib/utils.ts` - Codice con fix)
- **Profilo UI con `{anime:'only'}`**:
  - `profilesToApiPayload` genera `settings`: `{"typeSelectors":{"film":false,"serie":false,"anime":"only"}, ...}`
  - Manifest Stremio risultante: **9 cataloghi** (rimossi i 2 hero non anime e i 2 preset non anime)
  - Film Popolari (`preset_pop_movies`): **0 item** (bloccato da guardia catalogHandler)
  - Studio Ghibli (`preset_ghibli`): **20 item (20 anime, 0 non-anime)**
- **Profilo UI con `{anime:'exclude'}`**:
  - `profilesToApiPayload` genera `settings`: `{"typeSelectors":{"film":false,"serie":false,"anime":"exclude"}, ...}`
  - Manifest Stremio risultante: **11 cataloghi** (rimossi i 2 preset anime: Ghibli e Anime Popolari)
  - Film Popolari (`preset_pop_movies`): **18 item (0 anime, 18 non-anime)**
  - Studio Ghibli (`preset_ghibli`): **0 item** (bloccato da guardia catalogHandler)
- **Esito Fixed**: Il manifest **cambia come atteso** (9 vs 11). Fix convalidato end-to-end.

---

## 3. Round-Trip Completo (`POST /api/configure` -> `GET /api/user` -> `mapBackendProfile`)

Verifica effettuata compilando il file reale [`mapBackendProfile()`](file:///C:/Users/gabri/.yaca-wt/fix-type-selectors/frontend/src/lib/utils.ts#L93):

1. **Stato "Solo Film"**:
   - Input UI: `{"film":true,"serie":false,"anime":null}`
   - Salvato DB: `{"film":true,"serie":false,"anime":null}`
   - Riletto UI: `{"film":true,"serie":false,"anime":null}` -> **PASS**
2. **Stato "Solo Serie"**:
   - Input UI: `{"film":false,"serie":true,"anime":null}`
   - Salvato DB: `{"film":false,"serie":true,"anime":null}`
   - Riletto UI: `{"film":false,"serie":true,"anime":null}` -> **PASS**
3. **Stato "Solo Anime"**:
   - Input UI: `{"film":false,"serie":false,"anime":"only"}`
   - Salvato DB: `{"film":false,"serie":false,"anime":"only"}`
   - Riletto UI: `{"film":false,"serie":false,"anime":"only"}` -> **PASS**
4. **Stato "No Anime"**:
   - Input UI: `{"film":false,"serie":false,"anime":"exclude"}`
   - Salvato DB: `{"film":false,"serie":false,"anime":"exclude"}`
   - Riletto UI: `{"film":false,"serie":false,"anime":"exclude"}` -> **PASS**
5. **Stato "Valori Sporchi"** (es. input non booleani o stringhe non permesse):
   - Input UI: `{"film":"true","serie":42,"anime":"invalid_selector"}`
   - Salvato DB (pre-sanitizzato): `{"film":false,"serie":false,"anime":null}`
   - Riletto UI: `{"film":false,"serie":false,"anime":null}` -> **PASS**

---

## 4. Risposta al Dubbio: Manifest Assenti vs Guardie a 0 Item

> **Domanda**: Con `Solo Anime` e `No Anime`, i cataloghi non conformi sono assenti dal manifest (come deve essere) oppure presenti ma con 0 item (righe vuote in Stremio)?

### Risposta Tecnica Definitiva:
I cataloghi non conformi sono **TOTALMENTE ASSENTI DAL MANIFEST**. Stremio **non riceve** questi cataloghi nell'array `manifest.catalogs` e di conseguenza **non renderizza alcuna riga vuota** nell'interfaccia utente.

### Dettaglio Cataloghi Esclusi dal Manifest:
- **In modalità "Solo Anime"** (`anime: 'only'`) — **4 cataloghi esclusi**:
  1. `yaca_true_blend_movies` (Hero film)
  2. `yaca_true_blend_series` (Hero serie)
  3. `yaca_preset_preset_pop_movies` (Preset film popolari)
  4. `yaca_preset_preset_pop_series` (Preset serie popolari)
  *(Restano nel manifest: 7 utility/search/watchlist + `preset_ghibli` + `preset_pop_anime` = 9 cataloghi)*
- **In modalità "No Anime"** (`anime: 'exclude'`) — **2 cataloghi esclusi**:
  1. `yaca_preset_preset_ghibli` (Preset film anime)
  2. `yaca_preset_preset_pop_anime` (Preset serie anime)
  *(Restano nel manifest: 7 utility/search/watchlist + 2 hero + 2 preset non-anime = 11 cataloghi)*

### Ruolo della Risposta a 0 Item (Seconda Linea di Difesa):
Nel backend, [`catalogHandler.js:387`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/src/handlers/catalogHandler.js#L387) implementa la guardia:
```javascript
if (!isCatalogConformant(targetCatalog, activeProfileSettings?.typeSelectors)) {
    return { metas: [] };
}
```
Questa guardia risponde `{ metas: [] }` **esclusivamente** se un client richiede via HTTP l'URL del catalogo escluso (ad esempio se Stremio ha in cache locale un vecchio manifest prima del cambio profilo o in caso di chiamate manuali). Non genera righe vuote perché il manifest aggiornato non include affatto l'entry.

---

## 5. Script di Test Riutilizzabile

Script: [`scripts/qa/verifyTypeSelectors.js`](file:///C:/Users/gabri/.yaca-wt/repro-tsel/scripts/qa/verifyTypeSelectors.js)  
Comando esatto eseguito:
```powershell
node scripts/qa/verifyTypeSelectors.js `
  --base-url http://127.0.0.1:7032 `
  --frontend-utils C:/Users/gabri/.yaca-wt/fix-type-selectors/frontend/src/lib/utils.ts `
  --baseline-utils C:/Users/gabri/.yaca-wt/repro-tsel/frontend/src/lib/utils.ts `
  --test-user sim_user_repro_v `
  --strict-pass
```
