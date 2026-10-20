Status: ready-for-agent
Type: task
Blocked by: 13

# 20 — Accendere le sei famiglie nuove di default (la migrazione una volta sola)

## Il fatto

Il `13` ha fatto diventare le sei famiglie nuove dei cataloghi veri (registro, pool, manifesto), ma
`selectedPresets` è una **lista bianca**: un profilo che non porta dentro `yaca_classici_movies` ecc. non
riceve quelle righe. Oggi **tutti** i profili hanno solo le otto id storiche — i profili nuovi perché
`frontend/src/app/page.tsx:21-26` scrive `HERO_PRESET_IDS` con quelle otto, quelli vecchi perché è ciò che
salvarono a suo tempo — quindi le righe nuove arrivano **spente**.

La prima stesura del `13` aggirava il problema con una regola nel manifesto («chi aveva tutte le righe di
ieri riceve anche quelle di oggi»): sbagliata, perché rendeva i dodici toggle nuovi **inerti** — il profilo
le aveva tutte per definizione, e spegnere non cambiava nulla. Ritirata (vedi Esito del `13`).

## Cosa deve uscire

1. **Migrazione one-shot, non una regola di lettura**: un marcatore di versione delle famiglie hero nello
   stato UI (accanto a `heroPresetsInitialized`, che è il precedente: `src/profile/door.js`,
   `src/profile/models/ProfileUiState.js`, `frontend/src/lib/utils.ts:162-197`). Profilo con marcatore
   vecchio **e** almeno una riga hero → si aggiungono le dodici id nuove; profilo senza righe hero → resta
   senza (non si accende niente a chi non ha mai acceso niente).
2. **La migrazione si persiste**: dopo il primo salvataggio il marcatore è nuovo, quindi la deselezione
   dell'utente **vince** (è il difetto della regola ritirata). Va scritta in `salvaUiState` / nel processor
   del profilo, non solo in lettura.
3. **I profili nuovi**: le dodici id entrano nei default (`page.tsx` / `useProfiles.ts` / `utils.ts`), che è
   l'unico punto in cui il frontend va toccato — se il cantiere lo vieta ancora, la migrazione copre anche
   loro (al primo giro di lettura il profilo nuovo ha le otto storiche e il marcatore vecchio).
4. **La prova**: un profilo con le otto storiche e marcatore vecchio legge le venti id; uno che ha spento
   `yaca_classici_series` **dopo** la migrazione resta spento; un profilo senza righe hero non si sveglia
   pieno. E il manifesto, per ognuno dei tre, mostra le righe giuste.
5. **Nessun doppione**: `selectedPresets` è un insieme, la migrazione non aggiunge id già presenti (il
   `salvaUiState` già deduplica, ma il test lo fissa).

## Note

- Il marcatore non è un dettaglio: senza, la migrazione riparte a ogni lettura e il toggle torna inerte
  (identico al difetto del `13`).
- Se il frontend è ancora off-limits, la migrazione deve funzionare **solo lato server** (lettura del profilo
  → stato UI aumentato → salvataggio al primo giro utile).
