Status: open
Type: research
Punto: P07, P18
Blocked by: 04

# 05 — Profili Nuvio e identità dell’addon

## Domanda

Come si mappano i profili YACA sui profili Nuvio (max 6) senza rompere l’identità dell’addon? Nuvio
risolve una source con `addons.find { it.id == source.addonId }`: se due istanze YACA hanno lo stesso
manifest id, la collection può agganciarsi all’istanza sbagliata. Servono le opzioni reali, non
un’ipotesi.

## Cosa deve uscire

Una nota in `ricerche/05-profili-identita-addon.md` con:

- **vincoli Nuvio**: 6 profili, `uses_primary_addons`, PIN (non gestito dall’API), scope di addons/
  collections/library per `profile_id`.
- **come Nuvio risolve l’addon**: manifest id vs URL vs database row; cosa succede con due URL dello
  stesso manifest id; cosa succede se l’addon è disabilitato.
- **opzioni di mapping**:
  1. un profilo Nuvio = un profilo YACA, con manifest id per profilo;
  2. un solo profilo Nuvio, più collection YACA (una per profilo);
  3. un’istanza YACA “attiva” server-side, con un solo manifest id;
  4. ibrido: profili Nuvio per famiglia, collection per gusto.
  Per ognuna: pro, contro, effort, rischio, cosa si perde.
- **kids mode**: come si mappa su un profilo Nuvio e su una collection; quali filtri YACA bastano.
- **test plan**: due profili, due manifest id, due collection; quale istanza vince; cosa succede se
  l’utente disinstalla una delle due.

## Fonti primarie

- Nuvio docs v1.3, sezione Profiles + Concepts.
- NuvioTV: `ProfileManager`, `AddonManagerViewModel`, `AddonRepositoryImpl`,
  `FolderDetailViewModel` (risoluzione `source.addonId`), `CatalogReference.kt`.
- YACA: `src/models/AddonConfig.js`, `src/models/UserConfig.js`, `src/stremio/manifest.js`,
  `src/profile/*`, `frontend/src/types/index.ts`.
- Kaptain: `nuvio-push.js` (`normalizeProfiles`, `listAddons`), `profile-snapshots.js`.

## Come si chiude

La nota è pronta quando:

1. il comportamento di risoluzione addon è provato con path/riga;
2. ci sono almeno tre opzioni di mapping con pro/contro;
3. c’è una raccomandazione esplicita e il motivo;
4. il test plan è eseguibile su un account usa-e-getta;
5. sono elencati i casi in cui il multi-profilo non conviene.
