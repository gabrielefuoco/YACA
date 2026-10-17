Status: ready-for-agent
Type: task

# 37 — Le pulizie piccole: `profiles.js` fuori, `data/` distribuito, `utils/` nominato

## Perché

Tre cose misurate nel ticket 33, ognuna troppo piccola per un ticket suo e tutte dello stesso tipo: **roba che è
rimasta dov'era quando il suo padrone se n'è andato.**

1. **`src/api/profiles.js` (514 righe) e `src/api/profilo.js` (471)** sono **entrambi montati** (`/api/profiles`
   **e** `/api/profilo`): 985 righe per un lavoro solo. Dopo il ticket 11 il client usa la superficie nuova.
   ⚠️ **Prima di cancellare**: verificare che nessun client esterno chiami `/api/profiles` (i log non registrano
   le richieste, quindi la verifica va fatta **nel codice del client** o disattivando la rotta e guardando).
2. **`src/data/`**: dopo il ticket 32 restano `presets.js` (544), `filters.js` (269), `keywordIds.js` (140) e
   `itaAnnotations.js` (226) oltre agli asset JSON. I **preset sono del catalogo** (ticket 23: le righe hero sono
   preset di sistema), i **filtri** del catalogo/profilo. In `data/` devono restare **solo gli asset**.
3. **`src/utils/`** (25 file, 4.012 righe): i pezzi poster (340) vanno nel **modulo poster**, e l'impianto
   condiviso — `retry.js` (174), `resultMerger.js` (107), `LRUCache.js` (70), `axiosClient.js` (64),
   `mongoConnect.js` (62), `rateLimiter.js` (61), `logger.js` (44), ~580 righe — va **nominato** (`src/infra/`).
   Il resto (`helpers.js` 104, `kidsModeFilters.js` 161, `requestHash.js` 39, `contentId.js` 20, `dnaRarity.js` 9,
   `dnaExtractor.js` 7) va **assegnato a chi lo usa o cancellato**: nessuno di questi può restare «in utils».

## Come si verifica

- Dopo: `src/utils/` non esiste (o contiene solo ciò che si è deciso di lasciarci, **scritto nel ticket**).
- `grep` a zero per i percorsi vecchi (`api/profiles`, `data/presets`, `data/filters`, `utils/<nomi spostati>`).
- Le suite verdi **una alla volta** — e in particolare quelle dei cataloghi e delle rotte di dominio, perché
  questo ticket tocca il bordo HTTP e i preset.
- Il conteggio: `src/data/` e `src/utils/` prima e dopo, **in righe**, scritto nell'Esito.

## Attenzione

Questo è il ticket che **cancella una superficie HTTP viva** (punto 1). Va fatto **per ultimo**, e con la verifica
del client fatta prima: cancellare una rotta che qualcuno chiama è un guasto silenzioso in produzione, non un
errore nei test.

## Audit del codice morto (18/10/2026, dopo tutti i merge)

Fatto con due analizzatori statici (raggiungibilità da `index.js`+`scripts/`, e export mai usati altrove), non a
occhio. **Il risultato che conta è che non c'è quasi niente da pulire** — il refactor è stato completo:

| misura | valore |
|---|---|
| `src/` | 154 file, 36.752 righe |
| vivo (caricato da `index.js` o `scripts/`) | **151 file, 36.370 righe** |
| **morto per import** | **1 file, 10 righe** → `src/ai/prompts.js` (lo stub che il ticket 27 ha svuotato) |
| solo-test | 2 file, 372 righe → `src/catalog/index.js` + `validation.js` (l'**isola chiusa**: la porta del modulo catalogo non è la porta che si usa) |
| **0 importatori** | `src/utils/tmdbIngestPolicy.js` (95 righe) |
| il vecchio stack | **5.854 righe, ma VIVE**: serve il prodotto adesso (`stremio.js` → `catalogHandler` → `pool`/`engines`) — è sostituzione, non pulizia |

**Fatto in questo giro** (territori liberi):
- **`src/clients/trakt.js`: cancellata `exchangeTraktCode`** — codice morto (2 occorrenze = definizione + export).
  Il flusso vero usa il *device code* chiamando Trakt direttamente (`src/api/auth/index.js`), e nessuno la
  chiamava: né codice né test. Verificato che non facesse cascata (`syncTraktTokensToDb` è usato dal refresh ✓).
  33 test Trakt verdi dopo la cancellazione.
- **`src/models/AddonConfig.js`**: corretto un commento che citava `src/utils/stremioAddon.js` (cancellato).

**Da fare nei rispettivi ticket** (territori occupati adesso):
- `src/ai/prompts.js` (morto) → **`t38-router-ai`**, che sta lavorando proprio lì.
- `src/utils/tmdbIngestPolicy.js` (0 importatori) → **`t34-daemon`**, che possiede il cluster `tmdb*`.
- `src/catalog/index.js` + `validation.js` (isola chiusa, 372 righe) → **decisione**, non pulizia: o la porta del
  catalogo diventa quella che si usa, o si cancella. È il rilievo del ticket 27.

## Correzione dell'audit (18/10/2026): `tmdbIngestPolicy` NON era morto

L'audit diceva «`src/utils/tmdbIngestPolicy.js` (95 righe) — **0 importatori**». **Falso**: lo importano
`src/utils/tmdbDumpClient.js` e `src/utils/tmdbDumpDaemon.js` — con il percorso **relativo**
(`require('./tmdbIngestPolicy')`), mentre il mio `grep` cercava il prefisso `utils/` (`utils/tmdbIngestPolicy`).
Il file è vivo, ha 9 test suoi, e `t34-daemon` ha fatto bene a verificare prima di cancellarlo.

**Quarta sonda sbagliata della giornata, sempre della stessa famiglia**: un `grep` che assume la *forma* di un
percorso (`utils/x`) e non vede l'altra (`./x`). La regola che ne esce: per contare gli importatori, cerca il
**nome del file**, non un percorso.
