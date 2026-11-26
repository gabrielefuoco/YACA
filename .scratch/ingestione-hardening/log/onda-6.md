# Onda 6 — persistenza: writeAtomic, campi morti, fine del live sync ITA

**Deploy**: `bd3b048e` · **Test**: 201 suite / 1996-1997 · servizi 259/259

## Cosa è entrato

| Voce | Esito |
|---|---|
| **P6 `writeAtomic`** | Nuovo `src/infra/atomicWrite.js` (sync+async, tmp unico con pid+contatore, retry su EPERM/EBUSY, cleanup su errore) + **7 test** su filesystem reale. Convertiti **5 siti**; i due che usavano un `.tmp` **senza pid** (writer, diff) ora non possono più scontrarsi tra timer e giro a mano |
| **P4 (parziale)** | Via da `TasteProfile` tre campi senza lettori in src **e** frontend: `flatnessMetrics`, `signatureTitles`, `compiledVectors.clustersMeta`. Tenuti `dna` (letto da `UserConfig.js:379`), `erdbConfig`/`fastPresetRefresh` (letti dal frontend), `temp` (letto da collection/sync) |
| **Live sync ITA** | Rimosso: 76 righe → `ensureItaColumn()` (2 `ALTER` + `CHECKPOINT`). La colonna la scrive `convert_to_parquet` a ogni conversione; qui resta solo la garanzia che esista per i parquet vecchi |
| Review | `CHECKPOINT` dopo gli `ALTER` (WAL legato al path), header/describe del test allineati, `afterAll` che rimuove la temp dir, `Atomics.wait` al posto del busy-loop sincrono, `scripts/qa/lib/atlas.js` non scrive più `signatureTitles` |

## Verifica in produzione

- health 200, simulcast 34.214 byte;
- colonna `ita` letta **dal parquet** (nessun allineamento a caldo): `movies` 18.433 con `ita IS NOT FALSE` su 98.568, `tv` 5.838.

## Le due review, in breve

- **Standards**: nessuna regressione; una violazione vera (documentazione del test che prometteva il live sync), un busy-wait sincrono, e la conferma che i 5 siti convertiti hanno mantenuto semantica di `mkdir`, propagazione degli errori e payload binari.
- **Spec**: P5 e P2 dichiarati mancanti (con ragione), P6 parziale (restano 9 siti), `CatalogRouter`/`capabilities`/`AiDiscoveryProvider` non toccati, live sync fatto. Ha anche trovato che `atlas.js` scriveva un campo appena rimosso: sistemato.

## Cosa resta aperto

- **P6, gli altri 9 siti**: `saveCursor`/`saveStatus` (`tmdbDumpStore`), `erdb/build.js`, `drenaPoster`, `dump-list`/`dump-list-anime`, `mappingIndex`, `migra-poster-versione-sorgente`. Sono meccanici ma ognuno con la sua gestione d'errore; i due "swap" di file scritti da DuckDB (`convert_to_parquet`, `tier2`) sono **un'altra operazione** e non vanno convertiti.
- **P5**: `getModel()`/`ensureIndexesSafe` hanno 2 chiamanti reali e servono ai mock → non li ho toccati.
- **P2**: l'audit era **sbagliato** — `versioni.json` viene letto tutto da `getStatoVolume`, e di `ita_annotations.meta.json` il `counts.true` è letto dalla guardia del writer. Restano 3 campi cosmetici: non valgono un deploy del servizio.
- **Ticket 18**: `CatalogRouter` (hop eliminabile), `AiDiscoveryProvider` (parametri morti), `capabilities.js` (solo le due funzioni-registro: i descrittori sono usati da `registry.js`).
