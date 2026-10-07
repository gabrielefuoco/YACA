# 17 — Applicare le proposte del banco keyword

**Stato**: `chiuso` 07/10/2026 · 12 proposte applicate + 2 rinomine; secondo giro su 5 cataloghi (commit `2b27480`)

## Problema

Il banco (ticket 14) ha misurato, per 12 cataloghi, quali filtri sostengono la promessa e quali no. Le proposte non
sono ancora applicate: i cataloghi restano come li ha fotografati la campagna — pool corti, titoli fuori tema al
10-40%, e due nomi che nessuna keyword può realizzare.

## Soluzione

Applicare in `src/data/presets.js` le proposte **finali** del report, catalogo per catalogo, senza toccare altro.
Il report contiene per ciascuno: promessa attuale, alternative provate con i numeri, proposta finale.
Riepilogo dei 12 (i dettagli e i numeri stanno nel report, che è la fonte autorevole):

| Catalogo | Proposta |
|---|---|
| `preset_cult_classics` | include `6158\|155493\|11532`, `vote_average >= 6.2`, `vote_count >= 300` |
| `preset_zombies_movies` | `with_genres: 27\|878` + keyword `12377\|4884\|9744\|186565\|360949`, esclusa `210024` |
| `preset_psych_thriller` | `with_genres: 53` + keyword `12565\|9951\|157053\|10854`, escluse `210024\|10292` |
| `preset_italian_comedy` | togliere le 4 keyword tossiche, `vote_average >= 6.0`, `vote_count >= 40` |
| `preset_mindfuck` | `without_genres: 16`, `without_keywords: 9715\|180547`, keyword raffinate |
| `preset_mindfuck_series` | togliere le keyword `3298` e `3394`, togliere Drama (18) da `with_genres` |
| `preset_fantasy_magic` | togliere `dragon` (12554), inserire il cluster magia (`c_36`), escludere `210024` |
| `preset_space_hard_scifi` | **rinomina** in «Spazio Profondo & Odissee Cosmiche» + escludere `9715\|180547` |
| `preset_action_blockbusters` | **rinomina** in «Blockbuster d'Azione» + `without_genres: 16` |
| `preset_anime_shonen` | include `14643\|779\|33637\|180734`, escluse `9914\|190370`, `vote_count >= 30` |
| `preset_heist` | `without_keywords: 9715\|180547`, `without_genres: 10751` |
| `preset_treasure_hunters` | cluster `c_252` (treasure map) + `without_genres: 16\|99`, `vote_average >= 5.5` |

Le due **rinomina** sono una decisione già presa dal proprietario: gli `id` non cambiano (i profili e i template
referenziano gli id), cambia solo il `name` mostrato.

## Criteri di accettazione

Per ognuno dei 12 cataloghi, misurato con `node scripts/qa/keyword-bench.js --preset <id>`:

- i titoli **fuori tema** (etichette della campagna) scendono **≤ 5%**, oppure il catalogo è uno dei due rinominati e
  il fuori tema scende sotto il valore di partenza;
- il **pool** non scende sotto 20 e — dove era sopra 60 — non scende sotto 60, salvo eccezione dichiarata con il numero
  accanto (il caso noto è `preset_mindfuck_series`, che dimezza il fuori tema ma scende a ~28: va scritto nel ticket di
  chiusura, non nascosto);
- nessun catalogo peggiora la **quota anime reale** (classificatore di contenuto tipizzato, non il flag `isAnime`);
- `git diff` limitato a `src/data/presets.js` (o ai file strettamente necessari, dichiarati);
- `npm test` senza nuove rotture.

## Fuori ambito

- I due cataloghi con piloti aggiunti (`preset_tv_high_fantasy` e `preset_cyberpunk_series`) arrivano dal banco in un
  secondo giro: si applicano dopo, con lo stesso metodo.
- Il ticket 04 (pool sotto la pagina) e il 15 (metadati sottili): stessa leva, cataloghi diversi. Se un catalogo
  compare in due ticket, l'ultimo che lo tocca riporta la misura finale.

## Esito (07/10/2026)

Applicato. Verifica indipendente: confronto tra la top-50 **nuova** e le etichette «fuori tema» della campagna
(`.scratch/qc-cataloghi/runs/verify-17-fuori-tema.js`).

| Catalogo | Fuori tema prima → dopo | Pool prima → dopo |
|---|---|---|
| `preset_anime_shonen` | 40% → **0%** | 15 → **129** |
| `preset_italian_comedy` | 16% → **0%** | 53 → **575** |
| `preset_cult_classics` | 14% → **0%** | 64 → 71 |
| `preset_zombies_movies` | 25% → **2%** | 28 → **346** |
| `preset_psych_thriller` | 13% → **4%** | 45 → **206** |
| `preset_fantasy_magic` | 16% → **2%** | 89 → **134** |
| `preset_mindfuck` | 12% → **4%** | 78 → 72 |
| `preset_action_blockbusters` *(rinominato)* | 10% → **4%** | 378 → 329 |
| `preset_heist` | 4% → **2%** | 120 → 114 |
| `preset_treasure_hunters` | 12% → **2%** | 61 → **44** |
| `preset_space_hard_scifi` *(rinominato)* | 14% → 10% | 51 → 49 |
| `preset_mindfuck_series` | 16% → 11% | 43 → **28** |

**Due eccezioni, dichiarate:**
- `preset_mindfuck_series`: unico catalogo che non centra il ≤ 5%, e con il pool dimezzato. Il trade-off era noto dal
  banco; resta il peggiore del gruppo e va ripreso con il ticket 04 (pool) o con una seconda passata del banco.
- `preset_space_hard_scifi`: rinominato, quindi il 10% residuo è misurato contro le etichette della **promessa vecchia**
  («hard sci-fi»): col nome nuovo («Spazio Profondo & Odissee Cosmiche») parte di quei titoli può essere in promessa.
  Da riverificare nella rilettura (ticket 12).

**Pool sotto 60 residui**: `mindfuck_series` 28, `space_hard_scifi` 49, `treasure_hunters` 44 — materiale del ticket 04,
insieme a `tv_high_fantasy` e `cyberpunk_series` che arrivano dal secondo giro del banco.
