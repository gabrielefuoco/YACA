Status: needs-triage
Type: research
Priorità: P4 (complessità, nessun dato sbagliato in giro)
Blocked by: nessuno

# 18 — Audit ponytail del percorso di servizio dei cataloghi

**Riferimento**: audit dell'agente (report completo nel transcript della sessione). Sintesi: **−720 righe
potenziali**, di cui però **solo una parte è realmente tagliabile** — vedi "verifica".

## La catena di servizio, e dove si può tagliare

`preset_pop_movies` → `src/api/stremio.js` → `catalogHandler` (`resolveCatalogDefinition` →
`isCatalogConformant` → `cache.leggi`) → **`CatalogRouter.routeCatalogRequest`** (ri-strippa `yaca_preset_`
e ri-cerca `getPresets()`, poi fa solo `findSourceForCatalog(ctx).serveCatalog(ctx)`) → `ricerca/registry.js`
→ `indice.getDuckDbCatalogFromPreset` → `applyCatalogSpecialOrdering` → `formatStremioCatalog`
(`sanitizeCatalogMeta`) → `applyPostCacheBadges` (**riesegue `sanitizeCatalogMeta` per card**) →
`allineaIdFilm`.

Due hop candidati al taglio: `CatalogRouter` (unico chiamante) e il doppio `sanitizeCatalogMeta`.

## Verificato da me: cosa NON è codice morto

L'agente dichiarava "0 chiamanti" per `registerSource`, `getSource`, `getAllSources`, `isCatalogSortable`,
`getSortComparator`, `scomponiPosterComposto`: **falso**. Sono esportati e **18 riferimenti nei test**.
Sono API testata, non peso morto: cancellarli significa cancellare i loro test, non semplificare.

Anche `assignHeroPools` (1 chiamante reale, `pool/index.js:646`) e `isAlwaysVisible` (2 usi) sono vivi.

## Cosa resta sul tavolo, in ordine di valore

1. **`capabilities.js` duplica il contratto del registro** (`registry.js`): 220 righe di metadati fonti con
   `registerSourceCapabilities`/`getAllSourceCapabilities` **senza chiamanti in `src/`**. Da verificare se
   il frontend/dashboard li legge prima di toccarli.
2. **`TraktProvider.js` + `traktSourceEntry` + `paginationHelper.js`**: gli id `trakt_*` non compaiono in
   manifest/preset/frontend. Ma il progetto ha integrazione Trakt viva altrove: **da verificare**, non da
   cancellare sulla parola dell'agente.
3. **`CatalogRouter`**: unico chiamante, 43 righe che rifanno un lavoro già fatto dal chiamante.
4. **`defineCatalog`** duplica ogni campo tra forma annidata e piatta.
5. **`AiDiscoveryProvider`**: `cacheOptions`/`tmdbClient` mai letti, `withGenres`/`activeContext` morti,
   `consensusBonus` calcolato due volte.
6. **Dati nei preset senza lettori**: `presentation_strategy` su ~160 preset, `weights` su 2. Da verificare
   lato frontend.

## Sospetto bug fuori mandato (da verificare, non da fidarsi)

`catalogHandler.js` idrata i badge episodio solo se `type === 'series'`, mentre `StremioFormatter.js` e
`badges.js` li applicano anche per `type === 'anime'` — che quindi arriverebbero senza `rawTMDB` idratato.
Se confermato è un ticket a sé (badge episodio mancanti nelle card anime).
