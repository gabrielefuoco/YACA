Status: resolved
Type: bug

# 47 — Il ticket 46 ha spento le righe hero: i profili veri selezionano id che non esistono più

## Il sintomo, misurato

`buildManifest` sui **profili veri di produzione** (Atlas, `configurazioni: 2`):

| profilo | `selectedPresets` | righe hero nel manifest |
|---|---|---|
| `global` | 8 id, **tutti morti** | **0** |
| `4159713d` | 33 id, 4 vivi + 8 morti | 4 (`mondi` + `passo_fuori`) |
| `1c1da0af` | 24 id, **tutti morti** | **0** |
| `0465f104` | 22 id, 0 vivi 0 morti | 0 |
| `3f2f4afd` | 18 id, 0 vivi 4 morti | 0 |
| i 5 profili `sim_*` | 8 id, **tutti morti** | **0** |

Comando (rieseguibile): `buildManifest(userConfig, {hostUrl})` coi profili letti da `addonconfigs`, contando
`catalogs.filter(c => /yaca_(mondi|passo_fuori|uscite|nicchia)/.test(c.id))`.

**Prima del ticket 46 quelle 8 righe c'erano**: gli otto id erano i cataloghi hero. La rimozione
(`37a5b55`) ha svuotato la selezione dei profili esistenti — e il manifest filtra gli hero proprio con
`selectedPresets`:

```js
// src/stremio/manifest.js:93-97
const activeHeroCatalogs = (
    Array.isArray(selectedPresets)
        ? heroCatalogs.filter(c => selectedPresets.includes(c.id))   // ← intersezione vuota = zero righe
        : heroCatalogs
).filter(c => isCatalogConformant(c, typeSelectors));
```

## Perché nessun test l'ha visto

`tests/feedProtocolAndCatalogs.test.js` (nuovo del 46) costruisce un profilo **sintetico con gli id nuovi** →
passa. I profili veri hanno gli id **vecchi** → non li prova nessuno. È la classe di guasto già pagata due volte
in questa mappa: *il test giusto con i dati sbagliati*.

## Le tre cause (tutte da chiudere)

1. **Il manifest non degrada**: se l'intersezione è vuota, non mostra *nessun* hero invece di mostrare i
   cataloghi di sistema. Un profilo legacy non dovrebbe perdere il feed.
2. **I dati**: i `selectedPresets` dei profili salvati contengono gli 8 id morti (e `catalogOrder` pure).
   Serve una migrazione (o una riscrittura al salvataggio).
3. **Il client li riscrive**: `HERO_PRESET_IDS` con gli 8 id morti in **quattro** posti —
   `frontend/src/app/page.tsx:21`, `frontend/src/hooks/useProfiles.ts:9`, `frontend/src/lib/utils.ts:164`,
   `frontend/src/lib/catalogKind.ts:17-24` (registro di fallback). Ogni profilo nuovo nasce già spento.
   Il 46 non li ha toccati: `git show --stat 28c1621 | grep frontend/` → vuoto.

## Cosa deve uscire

1. **Il manifest** che non spegne il feed: intersezione vuota → i cataloghi hero di sistema si mostrano lo
   stesso (con un log). E una riga di commento che dice *perché*.
2. **La migrazione dei profili** (una tantum, come quella di `libraryOrder`): gli id morti mappati ai vivi —
   `true_blend`/`hidden_gems` → `nicchia_di_qualita`, `seed_network` → `mondi`/`passo_fuori`,
   `trakt_filtered` → niente (era una strategia, non una riga). Da decidere in grilling: **la mappa dei
   rimpiazzi è una decisione di prodotto**.
3. **Il client**: gli id vivi al posto dei morti nei quattro posti — meglio ancora, **derivati dal registro**
   (`/api/dashboard` porta già `heroCatalogs`) invece che scritti a mano in quattro file: è la decisione 27
   («le superfici sono dati, non rami di codice»).
4. **Un test che sarebbe fallito**: `buildManifest` con un profilo **legacy** (solo id morti) deve restituire
   gli 8 hero; e i `HERO_PRESET_IDS` del client devono essere un sottoinsieme del registro.

## Blocca il deploy

Il ticket 30 (push) porta in produzione il 46: senza questo, **chi ha un profilo legacy perde tutte le righe
hero** — cioè il feed. Va chiuso **prima** del push.

## Le decisioni (18/10/2026)

1. **Un profilo legacy vede tutti e 8 i cataloghi hero di sistema.** Il manifest: se l'intersezione fra
   `selectedPresets` e gli id hero è **vuota**, mostra tutti gli hero (con un log). Gli hero sono **righe di
   sistema**: un profilo non deve perdere il feed perché il sistema ha rinominato le righe.
2. **La migrazione dei profili** aggiunge i vivi mancanti a `selectedPresets` e `catalogOrder` (e toglie i morti).
   **Come le altre: dry-run di default, `--apply` per scrivere, exit code 1 su errore critico** — e va eseguita
   **dopo il deploy**, non prima: la produzione attuale conosce gli id vecchi, e scrivere i nuovi prima del push
   le spegnerebbe il feed.
   ⚠️ **Il fallback nel manifest non è opzionale proprio per questo**: protegge i profili *prima* che la
   migrazione giri, e protegge per sempre dal prossimo rinomino.
3. **Il client**: id vivi nei quattro posti — o, meglio, **derivati dal registro** (`/api/dashboard` porta già
   `heroCatalogs`): è la decisione 27, «le superfici sono dati, non rami di codice».
4. **Un test che sarebbe fallito**: (a) `buildManifest` con un profilo legacy → **8** hero; (b) ogni id hero
   scritto nel client deve esistere nel registro.

## Esito (18/10/2026)

Tutte le quattro parti del ticket sono state implementate, verificate con test mirati e committate in step atomici:

### 1. Passo A — Degrado di sistema nel manifest (`3fee035`)
In `src/stremio/manifest.js`: se `selectedPresets` di un profilo ha intersezione vuota con gli 8 cataloghi hero correnti (caso tipico di profili legacy rimasti fermi agli ID pre-ticket 46), il manifest non spegne il feed ma degrada automaticamente mostrando tutte le 8 righe hero di sistema, emettendo un log esplicativo (`[Manifest] profilo ...: nessun hero selezionato fra gli id correnti — mostro le 8 righe di sistema`).

### 2. Passo B — Client frontend ripulito dagli ID morti (`dacfb0e`)
Gli 8 ID morti (`yaca_true_blend_*`, `yaca_seed_network_*`, `yaca_hidden_gems_*`, `yaca_trakt_filtered_*`) sono stati rimossi e sostituiti con gli 8 ID vivi (`yaca_mondi_*`, `yaca_passo_fuori_*`, `yaca_uscite_nuove_*`, `yaca_nicchia_di_qualita_*`) nei quattro punti del frontend:
- `frontend/src/app/page.tsx:21` (`createDefaultProfiles`)
- `frontend/src/hooks/useProfiles.ts:9` (`createGlobalProfile` / `createDefaultProfile`)
- `frontend/src/lib/utils.ts:164` (`mapBackendProfile`)
- `frontend/src/lib/catalogKind.ts:11` (`FALLBACK_HERO_REGISTRY`)

**Motivazione architetturale sull'uso degli 8 ID vivi nei fallback client (Decisione 27):**
I quattro punti del client definiscono lo stato iniziale sincrono durante il boot/SSR dell'app, la creazione di profili di default in locale e la funzione pura di idratazione profili (`mapBackendProfile`), prima che qualsiasi chiamata di rete a `/api/dashboard` o `/api/analytics` possa restituire `heroCatalogs`. Inoltre, il frontend Next.js (TypeScript) è isolato e non può importare codice CommonJS/Node del backend (`src/catalog/registry.js`). A runtime, il meccanismo dinamico (`registerHeroCatalogs`) continua a registrare e aggiornare il registro attivo quando i dati arrivano dalle API. Inserire gli 8 ID vivi nei fallback garantisce che i nuovi profili nascano attivi e con gli ID corretti anche in assenza temporanea o ritardo della rete.

### 3. Passo C — Script di migrazione profili (`3dd55ae`)
Creato `scripts/migrate_hero_presets.js` secondo il pattern di sicurezza di `scripts/migrate_library_order.js`:
- Modalità DRY-RUN di default (nessuna scrittura sul database).
- Flag `--apply` (o `--execute`) per l'applicazione reale.
- Exit code non-zero (1) su errore critico.
- Aggiornamento atomico sia per `AddonConfig.profiles.$.raw_ui_state` / `uiState`, sia per la collezione `ProfileUiState`.
- Rimuove tutti gli 8 ID morti da `selectedPresets` e `catalogOrder`, e aggiunge gli 8 ID vivi mancanti.

#### Output dell'esecuzione DRY-RUN (eseguita su Atlas, configurazioni: 2):
```
======================================================================
[MIGRAZIONE PRESET HERO (Ticket 47)]
MODALITÀ: 🔍 DRY-RUN (Nessuna modifica verrà scritta)
======================================================================
Trovati 2 documenti AddonConfig da scansionare.

  - [ff7084d8-904b-42d9-91f5-ea2b4ae37590] Profilo 'global' (Generale):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [ff7084d8-904b-42d9-91f5-ea2b4ae37590] Profilo '4159713d' (Generale (Tutto)):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_hidden_gems_movies, yaca_seed_network_movies, yaca_trakt_filtered_movies, yaca_seed_network_series, yaca_hidden_gems_series, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 4 ID vivi (yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_hidden_gems_movies, yaca_seed_network_movies, yaca_trakt_filtered_movies, yaca_seed_network_series, yaca_hidden_gems_series, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 4 ID vivi (yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [ff7084d8-904b-42d9-91f5-ea2b4ae37590] Profilo '1c1da0af' (🎌 Otaku Hardcore (Anime)):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_series, yaca_hidden_gems_movies, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_series, yaca_hidden_gems_movies, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [ff7084d8-904b-42d9-91f5-ea2b4ae37590] Profilo '0465f104' (Solo Serie TV):
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [ff7084d8-904b-42d9-91f5-ea2b4ae37590] Profilo '3f2f4afd' (🧛 Horror Night):
      * selectedPresets: rimossi 4 ID morti (yaca_true_blend_movies, yaca_seed_network_movies, yaca_hidden_gems_movies, yaca_trakt_filtered_movies)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 4 ID morti (yaca_true_blend_movies, yaca_seed_network_movies, yaca_hidden_gems_movies, yaca_trakt_filtered_movies)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [sim-uuid-yaca] Profilo 'sim_prof_ocean_global' (Generale [clone]):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [sim-uuid-yaca] Profilo 'sim_prof_ocean_4159713d' (Generale (Tutto) [clone]):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [sim-uuid-yaca] Profilo 'sim_prof_ocean_1c1da0af' (🎌 Otaku Hardcore (Anime) [clone]):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [sim-uuid-yaca] Profilo 'sim_prof_ocean_0465f104' (Solo Serie TV [clone]):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
  - [sim-uuid-yaca] Profilo 'sim_prof_ocean_3f2f4afd' (🧛 Horror Night [clone]):
      * selectedPresets: rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * selectedPresets: aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)
      * catalogOrder:    rimossi 8 ID morti (yaca_true_blend_movies, yaca_true_blend_series, yaca_seed_network_movies, yaca_seed_network_series, yaca_hidden_gems_movies, yaca_hidden_gems_series, yaca_trakt_filtered_movies, yaca_trakt_filtered_series)
      * catalogOrder:    aggiunti 8 ID vivi (yaca_mondi_movies, yaca_mondi_series, yaca_passo_fuori_movies, yaca_passo_fuori_series, yaca_uscite_nuove_movies, yaca_uscite_nuove_series, yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series)

======================================================================
RIASSUNTO MIGRAZIONE PRESET HERO:
- Documenti AddonConfig scansionati:    2
- Profili analizzati in AddonConfig:   10
- Profili che richiedono aggiornamento: 10
- Record scritti sul database:         0 (DRY-RUN)

Per applicare la migrazione, riesegui con: node scripts/migrate_hero_presets.js --apply
======================================================================
```

### 4. Passo D — Test di regressione e guardie (`332af3d`)
Creata la suite `tests/ticket47HeroProtection.test.js`:
- **Test 1 (Manifest fallback & filtering)**:
  - Profilo con solo ID morti (`raw_ui_state`) → 8 hero rows nel manifest.
  - Profilo con solo ID morti (`uiState`) → 8 hero rows nel manifest.
  - Profilo con selezione viva non vuota (`['yaca_mondi_movies']`) → esattamente 1 hero row.
  - Profilo con selezione mista (`['yaca_mondi_movies', 'yaca_true_blend_movies', ...]`) → filtrato a 1 hero row viva.
  - Profilo con 2 hero vivi → esattamente 2 hero rows.
- **Test 2 (Guardia statica sui 4 file del frontend)**:
  - Legge i quattro file (`page.tsx`, `useProfiles.ts`, `utils.ts`, `catalogKind.ts`).
  - Estrae ogni identificatore `yaca_*` (escluso prefisso `yaca_preset_`).
  - Asserisce che nessuno degli 8 ID morti sia presente.
  - Asserisce che ogni ID trovato appartenga a `FIXED_CATALOGS_REGISTRY`.
  - Asserisce che tutti gli 8 ID hero vivi siano presenti.
  - Dimostra che una presenza di ID morti viene rilevata e intercettata come fallimento.

#### Risultati dei test eseguiti (uno alla volta):
- `npx jest tests/ticket47HeroProtection.test.js --forceExit`:
  `Test Suites: 1 passed, 1 total; Tests: 11 passed, 11 total`
- `npx jest tests/feedProtocolAndCatalogs.test.js --forceExit`:
  `Test Suites: 1 passed, 1 total; Tests: 7 passed, 7 total`

### Note operative per il deploy (Ticket 30)
- Come stabilito nella Decisione 2, la migrazione **non deve essere lanciata prima del deploy**, poiché la produzione attuale conosce ancora i vecchi ID.
- Il fallback nel manifest protegge i profili in produzione sin dal momento del deploy.
- **Dopo il deploy**, eseguire la migrazione in produzione sul mate:
  `docker exec yaca-app node scripts/migrate_hero_presets.js --apply`

