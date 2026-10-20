Status: open
Type: research
Punto: P08, P09, P23
Blocked by: —

# 04 — Compatibilità addon: manifest, paginazione, tipi, ID

## Domanda

Cosa deve fare il manifest di YACA per comportarsi bene in Nuvio — non “funzionare per caso” — e quali
sono le incompatibilità note? Il sospetto principale è la paginazione: YACA restituisce 20 titoli per
pagina, Nuvio calcola lo skip con `pageSize`/`skip`/default 100. Servono anche: `showInHome`, extras
(`genre`, `sortBy`, `skip`, `search`), `types`, `idPrefixes`, `meta`, versioning, catalog-only mode e
ID anime.

## Cosa deve uscire

Una nota in `ricerche/04-manifest-addon-compatibilita.md` con:

- **matrice campo per campo** del manifest: cosa legge Nuvio, cosa ignora, cosa è obbligatorio, cosa è
  un’estensione Nuvio (`pageSize`, `showInHome`).
- **paginazione**: conferma del mismatch 20 vs 100; quali cataloghi YACA restituiscono 20/altro; come
  dichiarare `pageSize` e/o `skip` options; effetto su “load more”.
- **tipi**: `movie`, `series`, `anime`, `other`; come `ContentType` mappa gli unknown; cosa succede a
  `anime` e `kitsu:`; quali stream addon li risolvono.
- **ID**: IMDb-first per film e serie; quando YACA usa `tmdb:`/`kitsu:`; cosa serve per massimizzare la
  compatibilità con gli stream addon; test plan.
- **meta**: cosa succede se YACA dichiara `meta` e l’utente ha AIOMetadata/Cinemeta sopra; catalog-only
  mode; quando serve il meta YACA (anime/ITA).
- **versioning**: `version` dinamica, `configVersion`, cache manifest di Nuvio, refresh.
- **raccomandazioni**: elenco “must / should / nice” per il manifest Nuvio-ready.

## Fonti primarie

- YACA: `src/stremio/manifest.js`, `src/stremio/CatalogRouter.js` (`PRESET_PAGE_SIZE = 20`),
  `src/stremio/catalogHandler.js`, `src/stremio/formatters/StremioFormatter.js`, `src/stremio/meta.js`.
- NuvioTV: `data/mapper/AddonMapper.kt`, `domain/model/CatalogDescriptorExtensions.kt`,
  `domain/model/ContentType.kt`, `data/repository/AddonRepositoryImpl.kt`,
  `ui/screens/collection/FolderDetailViewModel.kt`.
- Nuvio wiki: Addons, Collections.
- Kaptain: `addon-core.js` (install/validate), `nuvio-push.js` (addon ordering).

## Come si chiude

La nota è pronta quando:

1. ogni campo del manifest è classificato (letto/ignorato, must/should/nice);
2. il mismatch di paginazione è confermato o smentito con path/riga;
3. la strategia ID è raccomandata (film, serie, anime);
4. il catalog-only mode ha una specifica minima;
5. c’è una lista di test da fare in Nuvio TV e mobile.
