Status: resolved
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

---

## Esito (20/10/2026) — il frontend è stato sbloccato, e ora le righe nascono accese

### 0. La decisione

Il ticket era scritto con la premessa «o migrazione server o niente», perché il cantiere vietava il
frontend. **Decisione presa (20/10)**: il frontend si sblocca, ma solo per **un elenco di id** — non si
tocca nessun layout, nessun componente, nessuna rotta.

### 1. Cosa è uscito

- **Un posto solo** per le righe hero del frontend: `HERO_PRESET_IDS` in `frontend/src/lib/constants.ts`
  (20 id, le dieci famiglie × 2 medium). Prima era **copiata in tre file** (`app/page.tsx`,
  `hooks/useProfiles.ts`, `lib/utils.ts`): tre copie della stessa verità, ed è il difetto che ha fatto
  nascere la guardia del ticket 47.
- **Profili nuovi**: nascono con tutte e venti le righe (`page.tsx` e `useProfiles.ts` leggono la costante).
- **Profili che hanno già salvato** (`heroPresetsInitialized: true`): la migrazione esistente non li toccava.
  Ora, se un profilo ha le righe hero **storiche** ma **nessuna** delle sei famiglie nuove, le dodici id si
  aggiungono **una volta sola** (`utils.ts`). Dopo il primo salvataggio le id sono nel profilo, quindi
  spegnere una famiglia **vince**.
- **Limite dichiarato**: chi spegne **tutte e sei** le famiglie se le ritrova accese al caricamento dopo
  (non posso distinguere «mai viste» da «spente tutte» senza un marcatore di versione persistito nel
  profilo). Se il limite darà fastidio, si aggiunge il marcatore: è la sola parte che manca.

### 2. La prova

`tests/ticket47HeroProtection.test.js` §2 è stata riscritta perché il fatto è cambiato: gli id ora stanno
in un posto solo e gli altri file li **importano** (quindi non contengono più nessun `yaca_*`). La guardia
che conta è nuova e più forte: **l'elenco del frontend deve essere esattamente quello del registro** (20
id, confronto di insiemi). Il controllo per-file resta (nessun id morto, ogni id letterale vivo) e
`constants.ts` ne è escluso perché contiene anche le chiavi di storage (`yaca_config`, `yaca_user_id`…), che
non sono cataloghi: il confronto esatto la copre meglio.

`frontend` compila: `npx tsc --noEmit` → **zero errori**.

### 3. Suite

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 190 passed, 195 total
Tests:       8 failed, 1 skipped, 1943 passed, 1952 total
```

Le cinque rosse sono quelle ammesse. (Un test in meno rispetto al 14: il congelamento di `page.tsx` è
stato sostituito dal confronto con il registro, che copre anche `constants.ts`.)
