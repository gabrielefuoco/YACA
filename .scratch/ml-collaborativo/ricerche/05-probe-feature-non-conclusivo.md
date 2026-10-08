# 05 — I due test a basso costo: **non conclusivi** (bug nello strumento, non nel modello)

**Data**: 08/10/2026 · **Banco**: `probe4-features.py` · **Esito**: numeri **non attendibili**, indagine aperta

---

## Cosa dovevo misurare (deciso con l'utente)

- **A)** il Ridge **sotto-adatta**? (coseno in-sample vs held-out) e **dove** sbaglia (keyword, tipo, epoca, popolarità);
- **B)** quanto valgono le feature che **abbiamo e non usiamo**: lingua, paesi, franchise (`collection_id`), cast,
  registi/creatori, budget/incassi, network, `content_rating`.

## Cosa ho trovato invece: lo strumento non regge il confronto col build

Il controllo che smaschera tutto è il **vettore medio**: se lo spazio è sano, il vettore medio del catalogo ha
un coseno decente con gli item (è la direzione comune). Ecco il confronto fra i due script, **stessa matematica**:

| misura | `build-film-graph.py` (riferimento, già usato e misurato) | `probe4-features.py` (questo) |
|---|---|---|
| film nel teacher | 51.061 | 49.709 |
| coseno del **vettore medio** coi bersagli | **0,224** | **0,056** |
| coseno **held-out** del Ridge | **0,431** | 0,044 |
| coseno **in-sample** | — | 0,085 |

Il vettore medio che passa da 0,224 a 0,056 dice che **lo spazio bersaglio è diverso**: non è il Ridge a
fallire, è il *bersaglio* a essere degradato in questo script. Un modello che non batte nemmeno il banale
(0,044 contro 0,056) sta gridando che c'è un disallineamento, e non va interpretato.

**Sospetto principale**: il peso anti-popolare. Nel build è `1/log1p(n_item)` e su alcune colonne `n_item = 0`
produce un `inf` (c'era un `RuntimeWarning: divide by zero`); qui ho usato `np.maximum(n_item, 1)`, quindi
**niente inf**. Quella differenza può cambiare quali colonne entrano davvero nella SVD — e quindi il fattore
d'item di tutti. Non ho ancora isolato la causa con certezza, e finché non la isolo **non so quale dei due
script sbaglia**.

## Cosa si può dire lo stesso (indicativo, non conclusivo)

Pur in uno spazio degradato, il confronto base/estese mostra una **direzione coerente**:

| feature | held-out | in-sample | gap |
|---|---|---|---|
| BASE (topoi + generi + 5 numeriche) | 0,044 | 0,085 | +0,041 |
| ESTESE (+ lingua, persone, franchise, budget…) | 0,034 | 0,112 | **+0,078** |

Più feature = il modello **fitta di più** (in-sample 0,085 → 0,112) e rende **peggio** fuori campione. È il
ritratto dell'overfitting su feature ad alta cardinalità (3.000 persone, 800 franchise) — ma **va riverificato
nello spazio sano** prima di trarne qualunque regola.

Dato che invece regge ed è utile: **i paesi di produzione non si parsano** (0% — nel parquet la chiave è
`iso_3166_1`, non `id`), **il budget è presente solo nel 15%** dei titoli (e mai nelle serie) e il
`content_rating` nel 39%: le feature "arricchite" sono più rade di quanto sembri.

## Ordine dei passi prima di riprovare

1. **Riconciliare i due script** partendo dal controllo del vettore medio: deve tornare 0,224. Finché non
   torna, ogni A/B su questo spazio è rumore.
2. **Normalizzare le feature ad alta cardinalità** (persone, franchise) o ridurle a un embedding appreso —
   è il punto in cui l'idea dell'utente (embedding delle keyword/del sottografo) si applica anche qui.
3. **Fissare la metrica**: coseno held-out *con il controllo del banale accanto*, sempre. Un numero solo
   (0,431, 0,044) senza il banale di fianco non dice niente; il banale è ciò che ha smascherato questo giro.

## Perché l'ho scritto invece di aggiustarlo in silenzio

Due numeri in conflitto sulla stessa matematica sono un **buco nel metodo**, e vale più dire "non lo so
ancora" che pubblicare 0,044 come se fosse un risultato sul modello. Le conclusioni precedenti (teacher
ortogonale, candidati densi 11 per mille, pool vero più stretto) **non dipendono** da questo: sono misure
fatte con l'altro script, quello con il vettore medio a 0,224, e restano valide.

---

## Risoluzione (08/10/2026) — la causa era un errore mio di namespace

**Il bug**: nel probe filtro i voti di MovieLens con i **tmdbId** invece che con i **movieId**
(`ratings[ratings["movieId"].isin(covered_mids)]` dove `covered_mids` conteneva id TMDB). Sono due namespace
diversi che **collidono per caso** sugli stessi numeri: la SVD veniva costruita su un insieme arbitrario. La
diagnostica lo ha smascherato in una riga: **18.913 colonne vuote su 23.309** — cioè quasi tutte.

Il `build-film-graph.py` faceva giusto (convertiva una volta sola, `to_pos` conteneva movieId). **La
riconciliazione dice quindi: il build è corretto, il probe era rotto.** Il controllo del vettore medio è
tornato a **0,224**, identico al riferimento.

## I due test, ora validi

Controllo del banale (vettore medio): **0,224**.

| feature | held-out | in-sample | gap |
|---|---|---|---|
| BASE (topoi + generi + 5 numeriche) | 0,430 | 0,484 | **+0,054** |
| **ESTESE** (+ lingua, persone, franchise, budget…) | **0,479** | 0,607 | +0,128 |

### A) Il Ridge sotto-adatta? **No, poco** — e la leva sono le feature

Il gap base è **+0,054**: il modello non sta sotto-adattando, quindi **una testa non lineare non è la prima
leva**. Con le feature estese il gap sale (+0,128): lì c'è margine per regolarizzazione o riduzione di
dimensionalità, ma **l'held-out migliora lo stesso**.

Dove sbaglia il modello base (held-out):

| fascia | coseno |
|---|---|
| 0-3 keyword / 4-8 / 9-15 / 16+ | 0,419 / 0,440 / 0,440 / 0,415 → **il numero di keyword conta poco** |
| pre-1980 / 1980-1999 / 2000-2014 / 2015+ | 0,466 / **0,368** / 0,414 / 0,455 |
| poveri di voti / medi / molto votati | **0,361** / 0,449 / 0,461 |

Il buco non è «titoli con poche keyword»: è **film poco votati (0,361) e degli anni '80-'90 (0,368)**. Su quelli
il teacher stesso è più debole (meno co-visione), non le feature.

### B) Le feature che non usavamo: **valgono +0,049 di coseno** (0,430 → 0,479, +11% relativo)

Lingua, persone (cast+registi/creatori, top 3.000), franchise (top 800), budget/incassi, `content_rating`,
stagioni. Vanno **dentro il grafo** — ed è l'unico esperimento di oggi che ha migliorato il bersaglio.

Due avvertenze dai numeri: le feature ad alta cardinalità (persone, franchise) alzano molto anche l'in-sample
(+0,128 di gap) → **vanno regolarizzate o ridotte a embedding**; e i paesi di produzione restano da parsare
(chiave `iso_3166_1`, non `id`) — erano 0% di copertura nel primo giro.

## Il passo che segue

Ricostruire il grafo con le feature estese (10 minuti) e **rimisurare l'imbuto** (`bench-graph-funnel.js`):
il coseno migliore (+11%) si traduce in **candidati migliori**? Questa è la catena da tenere: feature →
coseno → selezione dei candidati → liste servite. Se il miglioramento non arriva in fondo alla catena, non
conta.
