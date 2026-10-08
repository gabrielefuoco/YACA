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
