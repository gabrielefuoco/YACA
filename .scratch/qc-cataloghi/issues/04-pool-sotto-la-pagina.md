# 04 — Pool sotto la pagina Stremio

**Stato**: `ready-for-agent` · **Causa**: C3 · **Fonte**: [report §3 C3](../ricerche/01-report-qc-cataloghi.md)

## Problema

La pagina di un preset è di **20 titoli** e non c'è refill (`PRESET_PAGE_SIZE = 20`, `CatalogRouter`): sotto 20
titoli il catalogo mostra **una pagina sola e corta**, un sintomo visibile all'utente come «catalogo vuoto».
46 preset hanno un pool sotto 60 titoli e **12 stanno sotto 20**.

## I 12 critici (pool < 20)

`preset_villeneuve` 10 · `preset_fincher` 12 · `preset_nolan` 14 · `preset_anime_shonen` 15 · `preset_tarantino` 16 ·
`preset_kubrick` 16 · `preset_dc` 16 · `preset_sea_series_docs` 16 · `preset_teen_drama_comedy` 16 ·
`preset_sports_underdog` 17 · `preset_lynch` 19 · `preset_doc_tech_future` 19.

Altri 34 stanno tra 20 e 59: tutti i cataloghi «registi» e «attori» restanti, 6 anime di nicchia, i documentari su
abissi/spazio/musica.

## Approccio

Per ogni preset sotto 60:

1. **Allentare il vincolo che stringe** — soglia voti troppo alta (es. `vote_count.gte: 200` su un regista con
   filmografia breve), finestra temporale, AND di generi.
2. **Dove il pool non cresce** (una filmografia è quella che è): dichiarare il catalogo «corto» e non fingere —
   valutare se tenerlo, accorpato o con `sortable` diverso.
3. **Per i cataloghi di persona**: distinguere «regia» da «partecipazione» e contare solo le opere principali
   (vedi ticket 06).

## Criteri di accettazione

- Nessun preset sotto 20 titoli di pool, oppure una riga di motivazione nel ticket di chiusura per quelli che restano.
- I preset tra 20 e 59 salgono sopra 60 dove il vincolo era arbitrario (es. soglia voti 200 → 50).
- Un secondo giro di `top50-dump.js` mostra `pagine ≥ 3` per tutti i cataloghi non dichiarati «corti».

## Fuori ambito

Il refill delle pagine (cambiare `PRESET_PAGE_SIZE` o aggiungere una logica di riempimento): è una decisione di prodotto, non una bonifica.

## Caso nuovo (dal ticket 07, 07/10/2026) — i film anime sono diventati pochi

Applicando il vincolo di durata ai percorsi hero, le liste **film** del profilo anime si sono accorciate: `yaca_true_blend_movies` **79 id di pool → 14 serviti**, `yaca_seed_network_movies` 18, `yaca_trakt_filtered_movies` 27.

Non è un difetto del vincolo: nel dump, **7.151 dei «film» di animazione sono in realtà OVA/ONA/speciali**, e il **52,4% dura meno di 60 minuti**. Il DNA del profilo otaku però *premia* proprio le keyword `compilation`, `original video animation (ova)`, `edited from tv series` — quindi il pool era pieno di pseudo-film, e il vincolo li ha tolti. Film di animazione giapponesi con durata ≥ 60' nel dump: **1.057**, abbastanza per riempire una pagina, ma non entrano nel pool perché il DNA non li cerca.

Per questo catalogo il fix **non è allentare la durata**: è **allargare il pool** verso i film veri (peso minore alle keyword di compilazione, canali dedicati al cinema d'animazione). Va trattato qui, non nel ticket 07.
