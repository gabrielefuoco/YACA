# Misura t12 — il tipo nel badge ITA degli anime

Tre script, tre comandi, **tutto in sola lettura**. Nessuna scrittura in produzione, nessun deploy.
Il report coi numeri è `misura-tipo-ita.md` nella radice del repository.

## 1. Stato di produzione (Mongo + parquet + annotazioni)

```bash
ssh mate "docker exec -i yaca-app node" < .scratch/t12/1-dump-state.js > .scratch/t12/state.json
```

Gira dentro `yaca-app`: legge `anime_airing_state` da Mongo (URI nell'ambiente del container),
`/data/tmdb/tv.parquet`, `/data/tmdb/movies.parquet` e `/data/tmdb/ita_annotations.jsonl`, e butta
tutto su stdout.

## 2. Censimento (in locale)

Prima le due copie dei mapping che la sorgente anime scarica e già legge:

```bash
ssh mate "docker exec yaca-anime-source cat /app/.cache/fribb-mini.json"          > .scratch/t12/fribb-mini.json
ssh mate "docker exec yaca-anime-source cat /app/.cache/anibridge-mappings.json" > .scratch/t12/anibridge-mappings.json
ssh mate "docker exec yaca-anime-source cat /app/.cache/tvdb-tmdb-cache.json"    > .scratch/t12/tvdb-tmdb-cache.json
```

Poi:

```bash
node .scratch/t12/2-census.js
```

Incrocia i documenti con il tipo **dichiarato dalla fonte** (Fribb `themoviedb_id.{tv,movie}`,
AniBridge `tmdb_show:`/`tmdb_movie:`, bridge TVDB `mediaType`) e confronta con il tipo **scritto**
da `services/doppiaggi-source/src/anime.js`. Scrive `dir1.json` e `films_ok.json`.

I tre file di mapping **non** vanno committati (16 MB): sono copie di dati di produzione, si
rigenerano coi comandi sopra.

## 3. Il badge compare davvero? (i poster)

```bash
DIR1=$(cat .scratch/t12/dir1.json) OK=$(cat .scratch/t12/films_ok.json) \
  ssh mate "docker exec -i -e DIR1='$DIR1' -e OK='$OK' yaca-app node" < .scratch/t12/3-badge-poster.js
```

Il badge non è un flag ma il **nome del poster**: senza badge la card chiede `tmdb-movie-<id>.jpg`,
con badge `tmdb-movie-<id>_ITA.jpg` (`src/catalog/formatters/StremioFormatter.js`). Quindi la
misura del danno è il numero di file **senza** `_ITA` fra i film che dovrebbero averla.
