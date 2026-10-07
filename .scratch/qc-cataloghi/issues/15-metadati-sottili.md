# 15 — Metadati sottili: classifiche costruite su pochi voti

**Stato**: `chiuso` 07/10/2026 · 6 cataloghi con soglia a 50 voti (rumore a 0%) e 5 documentaristici passati a popolarità (`9a2564a`)

## Problema

**23 cataloghi** hanno oltre il 30% dei primi 50 titoli con **meno di 50 voti**: l'ordinamento per voto medio, lì, è
rumore — due titoli con 12 e 15 voti si scambiano di posto a ogni aggiornamento del dump, e la «classifica» non
significa niente. I peggiori: `preset_new_series_eps` 88% · `preset_doc_food_travel` 82% · `preset_donghua` 74% ·
`preset_sports_docs` 72% · `preset_doc_history_war` 72% · `preset_sea_series_docs` 69% · `preset_turkish_dizi` 66% ·
`preset_true_crime` 64% · `preset_anime_kids_series` 64% · `preset_space_docs` 63% · `preset_sketch_comedy` 58% ·
`preset_nordic_noir` 54% · `preset_sea_movie_docs` 54% · `preset_stand_up` 52% · `preset_italian_comedy` 48% ·
`preset_new_series` 46% · `preset_kdrama_thriller` 42% · `preset_german_dark` 42% · `preset_reality_shows` 42% ·
`preset_nature_series_docs` 38% · `preset_anthology` 36% · `preset_bollywood` 34% · `preset_teen_preteen_tv` 32%.

Non è un difetto del contenuto: i documentari nuovi e le novità hanno pochi voti **per natura**. È un difetto della
**dichiarazione**: il catalogo promette una classifica per qualità che i dati non sostengono.

## Soluzione

Per ogni catalogo elencato, una delle due strade — scelta esplicita, scritta nel ticket di chiusura:

1. **Cambiare l'ordinamento dichiarato** (`sort_by`) verso ciò che i dati sostengono: popolarità o data di
   uscita/ultimo episodio. È la strada preferita dove i pochi voti sono la natura del contenuto
   (documentari, novità, reality, stand-up).
2. **Alzare la soglia dei voti** solo dove il catalogo promette davvero una selezione di qualità — e solo se il pool
   resta sopra la soglia del ticket 04 (60 titoli; sotto i 20 è già critico).

Per i cataloghi in cui l'ordinamento è `vote_average.desc` **per scelta editoriale** (es. i documentari «I migliori»),
la seconda strada è legittima purché il pool regga: la misura lo dice, non l'intuito.

## Criteri di accettazione

- Per ogni catalogo toccato: la quota di titoli sotto 50 voti scende **sotto il 30%**, oppure l'ordinamento dichiarato
  non è più per voto medio. Le due cose sono alternative: il numero da solo non è l'obiettivo.
- Nessun catalogo scende sotto 20 titoli di pool; segnalare chi scende sotto 60.
- La pertinenza non peggiora: sui cataloghi toccati, i titoli «fuori tema» citati dalla campagna
  (`.scratch/qc-cataloghi/review/preset/*.json`) non devono aumentare. Usare `scripts/qa/keyword-bench.js` per misurarlo.

## Fuori ambito

- Il contenuto: qui si cambia l'ordine o la soglia, non i titoli.
- I cataloghi già coperti dal ticket 04 (pool corti) e dal ticket 14 (keyword): se un catalogo compare in due ticket,
  l'ultimo che lo tocca aggiorna la misura nel suo.
