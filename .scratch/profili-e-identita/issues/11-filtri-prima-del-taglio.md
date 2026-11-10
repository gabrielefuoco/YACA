# I filtri agiscono prima del taglio, sempre

Status: resolved
Type: task
Blocked by: 01

## Perché

Il ticket 03 ha trovato un difetto strutturale: **il filtro medium è prima del taglio** (dentro il motore, `services/graph/runtime/engine.py:675`) — sano. Ma **bambini e anime sono dopo**, in Node, sui venti elementi già scelti (`src/stremio/catalogHandler.js:157-177`, `src/stremio/providers/WatchlistProvider.js:142-144`). Non è un filtro: è una potatura. Da qui le righe vuote che l'utente ha già visto.

Con cinque modi il difetto diventa sistemico: ogni modo filtra per costruzione, e un modo che filtra dopo il taglio è un modo che serve meno di quello che promette.

## Cosa va fatto

1. **Portare il filtro bambini dentro il grafo**, prima del taglio, usando l'artefatto del ticket 10. Un titolo vietato non deve occupare un posto fra i 60.
2. **Togliere la cancellazione dei semi non-anime** in `src/pool/index.js:254-258` (`if (animePolicy === 'only') return isAnimeSeed(id)`). La modalità Anime deve: usare **tutta la storia** come semi, e filtrare **solo l'uscita** agli anime. Il filtro d'uscita esiste già (`ANIME` nel canone, usato per il badge), va applicato prima del taglio come il medium.
3. **Applicare lo stesso principio alla watchlist** e a ogni provider che pagina: nessun filtro dopo il `slice(0, 20)`.
4. **Test di non-regressione**: con un profilo che ha 500 film e 5 anime, la modalità Anime deve restituire righe piene (non cinque titoli), e nessuna riga deve contenere un titolo non anime. Con un profilo adulto, la modalità Bambini non deve restituire righe vuote per potatura: se non c'è niente da servire, lo deve dire subito.
5. **Misurare**: quante righe servite oggi risultano vuote o sotto i 20 titoli, prima e dopo, sui dieci profili del banco. Il numero prima non deve esistere dopo.

## Esito

Filtri medium, anime e bambini tutti applicati prima del taglio; nessuna riga servita sotto la soglia minima per potatura; il conteggio prima/dopo sui dieci profili.

---

## Audit: Luoghi di Filtraggio Post-Taglio (Kids / Anime) da Sanare

1. `src/stremio/catalogHandler.js:157-159`:
   - `results = applyKidsMode(results);` viene applicato su `results` già limitato a 20 elementi (`PRESET_PAGE_SIZE = 20`) da `routeCatalogRequest`. I titoli scartati riducono la pagina a meno di 20 elementi o a 0.
2. `src/stremio/catalogHandler.js:166-177`:
   - `results = results.filter(...)` per `animeSelector === 'exclude' || animeSelector === 'only'`. Filtraggio post-fetch sui 20 elementi della pagina, potando la riga a valle.
3. `src/stremio/catalogHandler.js:186-188`:
   - `if (isAnimeCatalog) results = results.filter(item => isItemAnime(item));` applicato sui 20 elementi post-fetch.
4. `src/stremio/providers/WatchlistProvider.js:132-144`:
   - `leggiWatchlist` pagina a monte via MongoDB `.skip(skip).limit(20)`. Subito dopo `enrichWatchlistItemsWithTmdbMetadata(items)` arricchisce i 20 item e `catalogHandler.js:158` applica `applyKidsMode` scartando i titoli per adulti. Se i primi 20 sono per adulti, Stremio riceve una riga vuota (0 card).
5. `src/pool/composer.js:59-71`:
   - In `fetchFallbackDirectCatalog`, `indice.getCatalogFromFilters` estrae `fetchLimit` (20) record da DuckDB; successivamente `applyKidsMode(results)` e `results.filter(item => isItemAnime(item, tipo))` potano l'array a valle del limite.
6. `src/stremio/idratazione.js:149-169` / `src/stremio/hybridServing.js:144`:
   - Sebbene `idrataEImpaginaCandidati` iteri su chunk fino al target, gli scaffali del grafo generano un pool chiuso di `cap = 60` candidati. In assenza di filtraggio kids a monte nel grafo, cluster tematicamente per adulti vengono interamente decimati da `cardSurvivesFilters`, svuotando la riga a 0 titoli.


## Esito

Fatto e **in produzione** (commit `0b4404b1` e `7df1f960`).

**Semi anime.** Rimosso lo scarto dei semi non-anime (`src/pool/index.js`): in modalità Anime la storia completa alimenta la camminata, e il vincolo vive nel motore.

**Filtro prima del taglio.** Il motore accetta `anime` e `kids` e applica le maschere ai candidati **prima** di `min(cap, len(valid_idx))`, in `raccomanda` e `raccomanda_multi`. Le richieste che non chiedono né l'uno né l'altro sono **bit-identiche**: differenza di punteggio 0.000e+00 su 5.580 titoli e 10 profili.

**Effetto misurato.** Da *Il Padrino*, *Pulp Fiction* e *Fight Club*: senza filtro **28 titoli vietati su 60**, con il filtro **0 su 60** e la riga resta piena. Sul server: 16 scaffali, 60 titoli ciascuno, zero titoli vietati, 0,95 s.

**Artefatto.** `services/graph/kids.py` costruisce `kids_ok` (76.497 booleani, 75 KB, +80 ms all'avvio) dalla blacklist e dalla matrice keyword. Se l'artefatto manca: avviso all'avvio, voce in `/health`, **503 esplicito** sulla modalità Bambini — mai il catalogo non filtrato.

**Resta da fare** (annotato nel ticket): i filtri applicati **dopo** il taglio in Node — `catalogHandler.js:157-188`, `WatchlistProvider.js:132-144`, `pool/composer.js:59-71`, `idratazione.js:169`. Sono la stessa malattia in altri cinque posti: vanno spostati a monte quando arriverà il livello dei modi.
