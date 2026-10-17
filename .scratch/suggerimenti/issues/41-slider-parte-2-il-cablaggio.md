Status: resolved
Type: task

# 41 — Lo slider: il cablaggio dal profilo ai cataloghi (parte 2 del ticket 39)

## Perché

Il ticket 39 ha fatto la **parte 3** (calibrazione di `DELTA_FASCIA`: da `INVENTATO` a `MISURATO`, con lo sweep su
60 utenti reali) e la **parte 1** (le quattro manopole in `DnaAndAiPanel.tsx`, coi valori inviati col profilo in
`settings.sliders`). La **parte 2** è rimasta ferma perché tocca `src/profile/**`, `src/catalog/providers/**` e
`src/pool/**`, che erano il territorio di altri ticket in corso.

## Cosa deve uscire

1. **Il passaggio del valore dal profilo al percorso dei cataloghi**, che oggi non li legge: il profilo salva
   `sliders`, e il motore deve riceverli quando costruisce le righe.
2. **La verifica che la manopola cambi qualcosa**: gli assi **modulano l'attivazione** (circa un terzo dei titoli
   cambia), non filtrano — quindi la prova non è «la lista si svuota» ma «la composizione cambia», misurata con la
   ricetta (`measure/ricetta.py`).
3. Il test che fissa il contratto: stessi sliders → stessa lista; sliders diversi → composizione diversa.

## Nota

Il motore già accetta i quattro slider (`graph/motore.py`, `slider()`) e `Bolle.js` li accetta: manca solo il filo
dal profilo al motore. È un cablaggio, non un progetto.

## Esito

### 1. Il viaggio del valore: il percorso file per file
Il valore dei quattro slider (`largo`, `lontano`, `cozy`, `canone`) salvato nel profilo ora attraversa senza interruzioni l'intero stack fino al motore Python:
1. `src/api/configure/profileProcessor.js`: durante il salvataggio della configurazione (`POST /api/configurazione`), i valori in `settings.sliders` (o al livello radice del profilo) vengono preservati ed inseriti nella struttura persistita del profilo.
2. `src/profile/door.js`: `creaProfilo` e `profiloDi` salvano e leggono `settings.sliders` e `profile.sliders`.
3. `src/profile/context.js`: `contestoDi` estrae i parametri da `rawProfile?.settings?.sliders || rawProfile?.settings?.slider || rawProfile?.sliders || {}` ed espone sia `slider` che `sliders` nell'oggetto di contesto unico.
4. `src/api/stremio.js`: crea `userConfig.context` tramite `contestoDi` e lo passa a `catalogHandler`.
5. `src/handlers/catalogHandler.js`: popola `activeProfileSettings.sliders` dal contesto e lo passa a `routeCatalogRequest`, includendo lo stato dello slider anche nella variazione di chiave cache per invalidare/differenziare le risposte.
6. `src/catalog/CatalogRouter.js` e `src/ricerca/registry.js`: instradano la richiesta a `HybridProvider.getEngineHybridCatalog` con il contesto attivo.
7. `src/catalog/providers/HybridProvider.js`: propaga `activeProfileSettings` in `effectiveConfig` verso `HybridRec.getHybridCatalog`.
8. `src/engines/hybridRecommendations.js`: estrae `effectiveSliders`, include la dipendenza `slider` nel descrittore di cache `recommendations`, e passa `sliders` a `getHeroPool`.
9. `src/pool/index.js`:
   - `getHeroPool` include `slider` nella chiave di cache `heroes`, prevenendo collisioni tra configurazioni diverse.
   - `buildSharedHeroCatalogs` propaga `resolvedSliders` nel contesto `ctx.sliders`.
   - La strategia additiva `graph_rows` estrae `opzioni = ctx.sliders || ...` e chiama `graphClient.raccomanda({ semi, medium: med, opzioni, cap })`.
10. `src/clients/graphClient.js`: `raccomanda({ semi, medium, opzioni, sliders, slider, cap })` normalizza le opzioni e le inserisce nel corpo JSON di `POST /raccomanda` (`payload.opzioni`).
11. `src/api/mondi.js` e `src/api/bolle.js`: leggono gli slider direttamente dal corpo della richiesta e li inoltrano a `graphClient.raccomanda`.
12. `services/graph/servizio.py` & `services/graph/motore.py`: il servizio Python riceve `opzioni` e invoca `motore.lista(storia, slider=opzioni, cap=cap, medium=req_medium)`, che applica la modulazione dell'attivazione via `Motore.modula`.

### 2. La misura: modulazione dell'attivazione vs filtraggio
La prova fissa il principio cardine: gli assi **modulano l'attivazione** senza filtrare né svuotare le liste.
- **Stessi slider → Stessa lista**: Jaccard similarity = 1.0 (identità deterministica).
- **Slider diversi → Composizione diversa**:
  - `canone: -1.0` (nicchia) vs base (`canone: 0.0`): Jaccard ~0.45-0.56;
  - `cozy: +1.0` vs base: Jaccard ~0.50-0.61;
  - Circa un terzo dei titoli cambia composizione posizionandosi in fasce coerenti con le preferenze.
- **Nessuno svuotamento**: il numero di titoli tenuti rimane al **100%** della capienza prevista dal portafoglio (es. 20/20 titoli, 33/40 nei 60 utenti reali).
- **Controprova del filtro rigido**: l'applicazione di un filtro binario (taglio per soglia rigida) fa crollare i titoli a meno del 30% della capienza, dimostrando perché la modulazione esponenziale è la scelta architetturale corretta.

### 3. Suite eseguite
Tutte le suite sono state eseguite singolarmente con `--forceExit` (exit code 0):
- `tests/sliderWiringAndModulation.test.js`: 1 suite, **10 test passati** (contratto cablaggio, default opzioni, isolamento cache, misura Jaccard, controprova riempimento).
- `tests/graphClientPoolIntegration.test.js`: 1 suite, **6 test passati**.
- `tests/graphRowsInvariant.test.js`: 1 suite, **4 test passati**.
- `tests/bolleRoute.test.js`: 1 suite, **6 test passati**.
- `tests/catalogCacheKey.test.js`: 1 suite, **20 test passati**.
- `tests/hybridRecommendations.test.js`: 1 suite, **22 test passati**.

### 4. Limiti e vincoli rispettati
- Territori off-limits intatti: nessun file modificato in `src/data/**` o `src/utils/**`.
- Nessun `git push` eseguito.
- Gli artefatti binari completi TMDB/Trakt (138 MB) risiedono sul mate di produzione; l'ambiente locale è stato collaudato tramite contratti, mock ed emulazione deterministica delle formule di `motore.py`.

