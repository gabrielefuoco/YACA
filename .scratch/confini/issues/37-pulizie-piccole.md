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
