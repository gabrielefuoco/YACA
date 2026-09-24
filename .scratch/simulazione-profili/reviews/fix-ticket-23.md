# Ticket 23 — Fix hero: diversity, franchigie e hidden gems

## Esito

- Branch: `fix/hero-qualita`, base `main` @ `24569c0`.
- H-05 e H-08 corretti mantenendo il contratto di cache/assegnazione del ticket 21: chiave esterna ancora `heroes_v1`, schema interno 3 per invalidare i pool precedenti, priorità `true_blend → seed_network → hidden_gems → trakt_filtered` invariata.
- Nessun merge/push; nessuna modifica a `.env`, `secrets.env`, `presets.js`, `map.md` o dati reali.

## H-05 — diversity cap e `remaining`

### Modifica

- Rimossa la ricostruzione `finalItems = [...diversified, ...remaining]`, che riapriva il pool scartato e neutralizzava i cap.
- Introdotto `finalizeHeroQualityCandidates`: il risultato strettamente caprato apre il blocco; il resto viene valutato con un overflow genres/registi e può completare al massimo una pagina solo quando il pool non contiene abbastanza alternative. Non viene più ricostruito l'elenco completo.
- `ProfileScorer.applyDiversityCaps` legge ora anche `rawTMDB.credits.crew`: prima i registi del bucket DuckDB non erano visibili al cap nel prefiltro.
- Seed network amplia il pool simili da 40 a 80 e diversifica prima delle chiamate TMDB, così il cap agisce sul pool utile e non soltanto sulle prime 80 righe.

### Test offline

- `tests/heroQuality.test.js`: il ramo `diversified + remaining` non riaggiunge 12 item identici; il refill cap-aware mantiene la prima pagina; i registi nested in `rawTMDB` rispettano il cap 1.
- Test diagnostico H11 esistente: i primi 5 titoli non sono più monoc-genere.

### Evidenza prima/dopo

- Review 11: 39/40 `Comedy` in `true_blend_series`, 5 *Insidious* e 4 *Terminator* in `seed_network_movies`.
- Run locale pre-fix: il bypass era ancora presente; persistevano 1 *Terminator 2* e 1 *Scooby-Doo* nel primo blocco osservabile.
- Verifica finale: 0 director ripetuti e 0 collection ripetute in tutti i cataloghi movie dei 7 profili compatibili (dati DuckDB deduplicati per ID).

## H-05 — cap collection/franchise

### Modifica

- `deduplicateByCollection` ora applica un cap esplicito `max 1` leggendo sia `collection_id` sia `belongs_to_collection.id`.
- Il cap è applicato ai builder normali e ai fallback; i fallback deduplicano anche i registi prima di restituire ID.
- I metadati idratati conservano `genres`, `genre_ids` e `credits` per i controlli finali.

### Test offline

- Test dedicato: più titoli della stessa collection producono un solo output.
- Test fallback offline: stessa collection e stesso regista vengono rimossi dopo l'ordinamento per score.
- Verifica harness finale: 0 violazioni collection e 0 violazioni regista sui cataloghi movie di tutti i profili.

## H-08 — drift `hidden_gems`

### Modifica

- Tetto di popolarità **20**, inclusivo, applicato sia al builder normale sia al fallback; il tetto precedente del fallback era 80 e non veniva tradotto in SQL.
- Aggiunti `F.maxPopularity` e il supporto provider a `popularity.lte` (oltre al max vote già presente nei fallback).
- Coerenza DNA: un hidden gem deve avere almeno un'affinità positiva del profilo. Anime/kids/family e adattamenti manga richiedono un'affinità esplicita del profilo alla famiglia Animation/Family/Kids; i concerti (`Music`) richiedono affinità `Music`. Così Cinefilo non eredita più cluster kids/anime, mentre Otaku e Famiglia li mantengono.
- Dedup franchise applicata anche a `hidden_gems`.
- La pipeline condivisa e la priorità cross-hero non sono state modificate: `hidden_gems` resta un builder dedicato, distinto e non viene sostituito dal fallback.

### Test offline

- `tests/heroQuality.test.js`: tetto 20 accepted, 20.01/41.4/missing rejected; allineamento Cinefilo/Famiglia per kids-anime e concerti.
- `tests/dataFetchers.test.js`: il fallback riceve `popularity.lte: 20` e filtra 41.4.

### Evidenza prima/dopo

- Review 11: Cinefilo con anime/kids, 11/39 *Scooby-Doo*, 12/39 concerti; Famiglia con *Pokémon* e *PAW Patrol* (popolarità 41+).
- Run finale: 275 hidden gems verificati, popolarità massima **19.8664**, 0 violazioni; Cinefilo hidden: 0 *Scooby-Doo*, 0 concerti, 0 marker anime kids segnalati; Famiglia hidden: 0 *Pokémon*/*PAW Patrol*.
- `hidden_gems` non vuoto su tutti gli 8 profili: movie/series = Cinefilo 20/20, Otaku 19/8, Serie 20/20, Famiglia 18/8, Solo Film 20, Solo Serie 20, No Anime 18/4, Freddo 40/40.

## Harness completo

- Before: `.scratch/simulazione-profili/runs/2026-09-24T12-40-48-671Z-ticket-23-before`.
- After: `.scratch/simulazione-profili/runs/2026-09-24T13-14-38-502Z-ticket-23-final`.
- Comando: `PORT=7012 npm start`, poi fetch `--fresh --pages 2` dei 4 movie hero + 4 series hero per tutti gli 8 profili, quindi `review`.
- Esito: 56 cataloghi, 1.004 item, 0 errori manifest/catalogo/richiesta; 0 duplicati intra-pagina e 0 sovrapposizioni fra pagine.
- Tempo fetch+review: **72 s** (log server: `/tmp/yaca-7012.log`).
- Compare: 711 item spariti, 451 aggiunti, 338 spostati, 0 cambiati; report `compare_2026-09-24T12-40-48-671Z-ticket-23-before.md`.

## Overlap pairwise post-fix

| Profilo | Movie | Series |
|---|---:|---:|
| Cinefilo | 0 | 0 |
| Otaku | 0 | 0 |
| Solo Serie | 0 | 0 |
| Famiglia | 0 | 0 |
| Solo Film | 0 | n/a |
| No Anime | 0 | 0 |
| Freddo | 0 | 0 |
| Solo Serie (diagnostico) | n/a | 0 |

Totale pairwise su tutti gli 8 profili: **0**.

## Test finali

- `npx jest --runInBand`: **65 suite passed, 2 skipped; 485 test passed, 9 skipped; 0 failed** (79.933 s).
- ESLint sui file toccati: 0 errori (warning preesistenti).
- `git diff --check`: pulito.
