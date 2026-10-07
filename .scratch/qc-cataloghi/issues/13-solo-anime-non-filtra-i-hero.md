# 13 — `Solo Anime` non filtra i hero: il marcatore `_isAnime` è `true` su tutto

**Stato**: `ready-for-agent` · **Gravità**: alta · **Trovato**: 07/10/2026 durante la campagna QC · **Causa radice**: identificata (§ Causa)

## Sintomo

Con un profilo che ha `typeSelectors.anime = 'only'`, i cataloghi hero servono **titoli non-anime marcati come anime**:
in un test dedicato, `yaca_true_blend_movies` ha restituito **14 item su 20 live-action** (Mediterraneo, L'alba del
pianeta delle scimmie, I Tenenbaum, Nebraska, Marie Antoinette, Il cavaliere pallido…), tutti con `_isAnime: true`.
Con `anime = 'exclude'` lo stesso hero sembra corretto (0 anime serviti): il difetto è **asimmetrico**.

Lo stesso marcatore sbagliato agisce anche sui **preset**: in produzione un film con id collidente risulta anime, quindi
un profilo «No Anime» lo elimina e un profilo «Solo Anime» lo tiene. Nei dump della campagna il difetto non compare
solo perché quei dump sono stati prodotti da processi con lo store ancora vuoto (§ Perché si vede solo in produzione).

## Causa radice (verificata)

**Lo store anime di YACA confonde i due spazi di id di TMDB.** TMDB assegna id *separati* a film e serie: la serie
*Toriko* ha `tv id 38251`, il film *Mediterraneo* ha `movie id 38251`. Sono due titoli diversi con lo stesso numero.

1. `animeMappingStore` scarica il dataset **Anibridge** e ne ricava `anibridgeTmdbIds` (7.008 id) dove confluiscono
   insieme `tmdb_show:<id>` **e** `tmdb_movie:<id>` (`buildAnibridgeIndex`, `src/data/animeMappingStore.js`); poi
   `_rebuildAnimeTmdbIds()` fonde show, movie, kitsu e certificati in **un unico set di numeri**.
2. `isAnimeTmdbId(id)` risponde su un **id nudo**, senza tipo: `animeTmdbIds.has('38251')` → `true` perché esiste
   `tmdb_show:38251`.
3. `isAnimeContent()` consulta lo store **per primo** e, se risponde sì, ritorna `true` **senza guardare genere né
   lingua** («store certificato»).
4. `normalizeAnimeMarker()` scrive `_isAnime: true` sull'item; il boundary dei cataloghi e i filtri anime si fidano
   di quel booleano (`catalogHandler` §2.6, `hybridRecommendations` riga ~518).

Il dataset contiene `tmdb_show:38251` (anilist 6941 / mal 6941) ma **non** `tmdb_movie:38251`: la collisione è quindi
dimostrata sulla fonte, non inferita.

### Perché si vede solo in produzione (e non nei test freschi)

Lo store parte **vuoto** e si popola con una sync in background (`sync()`, all'avvio). Un processo appena avviato
classifica correttamente (lo store risponde `false` su tutto); dopo la sync, ogni id collidente diventa «anime».
Misurato: prima della sync `animeTmdbIds` = 0 → dopo la sync = 7.046. È la ragione per cui due processi nuovi
(locale e **dentro** il container di produzione) costruivano lo stesso hero in modo corretto, mentre il processo in
esecuzione — e quindi tutta la campagna QC — serviva liste inquinate.

### Impatto misurato sul catalogo

| Tabella | Titoli | Falsi anime per collisione |
|---|---|---|
| `movies` | 97.613 | **1.363 (1,4%)** — film con id uguale a una **serie** anime |
| `tv` | 19.585 | **91 (0,5%)** — serie con id uguale a un **film** anime |

Esempi verificati nel parquet locale: 🎬 *Mediterraneo* (movie 38251) ↔ 📺 *Toriko* (tv 38251) · *I Tenenbaum*
(movie 9428) ↔ una serie anime con 26 episodi (`tmdb_show:9428`).

## Riproduzione

```bash
# l'effetto è visibile solo a store popolato: forzare la sync e chiedere
docker exec yaca-app node -e "const s=require('/app/src/data/animeMappingStore'); s.init().then(async()=>{ await s.sync(); console.log(s.isAnimeTmdbId('38251')); })"
# → true (atteso: false, è un film italiano di guerra)
```

Falsi positivi già raccolti: `runs/verifica-soloanime*`, `runs/probe1*`, `runs/probe4.js`, `runs/probe5.js`.

## Fix proposto

1. **Rendere lo store consapevole del tipo**: `isAnimeTmdbId(id, tipo)` consulta `anibridgeShowTmdbIds` per le serie e
   `anibridgeMovieTmdbIds` per i film (i due insiemi **esistono già**, ma non vengono usati), e allinea i due
   namespace kitsu (`tmdbToKitsu` vs `tmdbToKitsuMovie`).
2. `_rebuildAnimeTmdbIds()` non deve fondere i due spazi in un solo set: o li tiene separati, o li indicizza con la
   chiave `tipo:id`.
3. `isAnimeContent({…, tipo})`: far passare il tipo ai chiamanti che lo conoscono già (`normalizeAnimeMarker` ha
   `item.type`; `mapItemToMeta` sa se è movie o tv).
4. Rete di sicurezza: se lo store dice «anime» per un **film** senza genere Animazione e senza lingua `ja`, registrare
   la divergenza (log) invece di fidarsi in silenzio — così una collisione futura si vede subito.
5. **Test di regressione** (prior art: `tests/animeContentFilter.test.js`, `tests/animeMarkerNormalization.test.js`):
   - `isAnimeTmdbId('38251', 'movie') === false` e `isAnimeTmdbId('38251', 'tv') === true`;
   - `isAnimeContent({ tmdbId: 38251, genreIds: [35,10749,10752], originalLanguage: 'it', tipo: 'movie' }) === false`;
   - a store popolato, un profilo `anime: 'only'` non deve servire nessun item il cui contenuto non sia anime.

## Criteri di accettazione

- Il comando di riproduzione sopra stampa `false`.
- Con store popolato, `yaca_true_blend_movies` per un profilo «Solo Anime» non contiene titoli non-anime (oggi: 14/20).
- I falsi anime su `movies` scendono da 1.363 a 0 (o ai soli casi certificati a mano).
- Il caso `exclude` resta corretto.

## Collaterali emersi dalla stessa indagine

- **`?_nocache` non esiste nel codice**: `simulate.js fetch --fresh` aggiunge un parametro che il server ignora, quindi
  «fresh» e «cached» sono la stessa richiesta. Da sistemare nel harness (ticket 11) o rinominare il flag.
- **`[HeroPool] trakt_filtered builder failed: Cannot access 'types' before initialization`**: il builder Trakt solleva
  un errore di TDZ e degrada via `catch` (`hybridRecommendations.js:169-176`). Non è la causa di questo ticket, ma
  significa che quel hero non ha **mai** un percorso pulito: da indagare a parte.

## Fuori ambito

La qualità editoriale delle liste (campagna QC, ticket 02-09): qui si corregge il *perimetro*, non il contenuto.
