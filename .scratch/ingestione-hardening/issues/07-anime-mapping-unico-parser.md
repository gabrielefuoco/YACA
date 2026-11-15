Status: ready-for-agent
Type: task
Priorità: P3 (terza onda)
Blocked by: 00 (solo per il comando del prefill, punto 7)

# 07 — Anime: un solo parser di mapping, un solo nome di artefatto

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q7** (diagnosi dei due default incompatibili e del drift su `malToTmdb`, patch di `src/anime/mapping.js`, test di parità). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto (due bug, uno grave)

1. **Nomi di default incompatibili**: il produttore
   (`services/anime-source/src/mappingIndex.js`, `DEFAULT_FILENAME = 'anime-mappings.json'`) e il
   consumatore (`src/anime/mapping.js`, `FILE_NAME = 'anime_mapping.json'`) **non si accordano**. In
   produzione funzionano solo perché `docker-compose.yml` inietta `ANIME_MAPPING_PATH` nell'app. Fuori da
   lì (script, test, deploy parziale) l'app cerca un file che non esiste e degrada **in silenzio**:
   `statoAnime` diventa `non-lo-so` per tutto, quindi nessun anime riconosciuto, nessun badge, nessuna
   policy.
2. **Drift già avvenuto**: in `mappingIndex.js` i nodi `mal:` di AniBridge popolano `malToTmdb` quando
   Fribb non ha il mapping; in `src/anime/mapping.js` (`buildAnibridgeIndex`) **no**. Due
   implementazioni dello stesso parsing, già divergenti, che devono restare in sync per commento. È
   l'anomalia A4.

## Cosa fare

1. **Allineare il nome**: `src/anime/mapping.js` usa `DEFAULT_FILENAME` importato da
   `services/anime-source/src/mappingIndex`, con **fallback di lettura** sul nome legacy
   (`anime_mapping.json`) se esiste, e accetta sia `ANIME_MAPPING_PATH` sia `ANIME_MAPPINGS_PATH`.
2. **Delegare il parsing**: `buildFribbIndex`/`buildAnibridgeIndex` non parseno più nulla, chiamano
   `buildMappingIndex({fribbData, anibridgeData, overridesData})` e passano il risultato a
   `applyArtifact(...)` (il metodo esiste già). Si eliminano ~130 righe duplicate e il drift sparisce per
   costruzione.
3. **Test di parità** produttore/consumatore sulle fixture esistenti
   (`services/anime-source/tests/fixtures/fribb_dandadan.json`, `anibridge_dandadan.json`): stesse mappe,
   stesso `resolveKitsu` per due coppie (stagione, episodio).

## Perché è `blocked`

1. Il **build context** di `yaca-anime-source` (ticket 00, punto 2) — decide *come* condividere il codice fra le due immagini:
   - **Context = root del repo** → `require('../../services/anime-source/src/mappingIndex')` funziona anche
     nell'immagine dell'app: soluzione pulita, zero duplicazione.
   - **Context = sottocartella del servizio** → l'app non ha quel file nell'immagine: serve spostare
     `mappingIndex.js` in una cartella condivisa inclusa in entrambi i context (o copiarlo in build).
   **Da decidere prima di scrivere codice**, e da annotare in `map.md`.
2. Conferma che il formato dell'artefatto **già in produzione** (`/data/anime-source/anime-mappings.json`)
   sia quello che `buildMappingIndex` produce oggi: se è più vecchio/diverso, la delega cambierebbe mappe
   in silenzio. Si verifica col test di parità girato su una copia del file di produzione.

## Adattamenti necessari (verificati)

- `buildMappingIndex({fribbData, anibridgeData, overridesData, sources})` esiste ed esporta
  `DEFAULT_FILENAME` ✓.
- `AnimeMappingStore` ha `applyArtifact`, `loadOverrides`, `idsByType`, `isReady` ✓.
- `_rawFribbData` / `_rawAnibridgeData` **non** esistono: vanno aggiunti (servono perché i due metodi
  possono essere chiamati in ordine qualsiasi, e ciascuno deve poter ricostruire l'artefatto completo).
- `getSnapshot()` delega a `snapshotDaArtefatto.getSnapshot` e ritorna **l'artefatto** (o `{}`), non un
  oggetto con `movieCount/showCount/degraded`: il ticket 10 deve adattarsi, non questo.

## Test

- `tests/animeMappingParity.test.js`: artefatto → `applyArtifact` **vs** `loadOverrides` + `buildFribbIndex`
  + `buildAnibridgeIndex` → stesse `idsByType()`, stesse `malToTmdb`, stesso `resolveKitsu` su due
  (stagione, episodio).
- `mappingPath()`: senza `ANIME_MAPPING_PATH` e con solo `anime_mapping.json` in cartella → ritorna quello;
  con solo `anime-mappings.json` → ritorna quello; con entrambi → il canonico.
- Regressione: `node --test services/anime-source/tests/` verde (il servizio non deve accorgersi di nulla).

## Fatto quando

1. Test verdi, `npm test` verde.
2. Su un ambiente **senza** `ANIME_MAPPING_PATH` e con `ANIME_MAPPING_DIR=/data/anime-source`, l'app legge
   l'artefatto (log di boot + `statoAnime` di un id noto = `si`).
3. `wc -l src/anime/mapping.js` cala di ~130 righe; non esiste più nessun parser Fribb/AniBridge nel
   consumatore (`grep -c "fribb\|anibridge" src/anime/mapping.js` → solo import e nomi dei campi).

## Rischi e rollback

- **Rischio**: se l'artefatto in produzione ha un formato leggermente diverso da quello che
  `buildMappingIndex` produrrebbe oggi, la delega può cambiare qualche mappa. Mitigazione: il test di
  parità gira **sul file di produzione** (o su una sua copia) prima del rilascio.
- **Rollback**: revert del commit; il nome legacy resta leggibile, quindi nessun file da rinominare.
