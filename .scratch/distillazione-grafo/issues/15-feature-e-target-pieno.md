Status: resolved
Type: research

# 15 — Feature nuove e target pieno: il modello onesto

Dopo il ritiro dell'ibrido (ticket 14) e la scoperta che il collocatore è leaky, il compito è
chiaro: **solo feature → vettore**, niente grafo a inferenza. Due leve provate: feature che il
vocabolario 05 non ha, e target che usa l'intero grafo invece dei soli top-25.

## La misura che mancava: il soffitto delle feature

kNN coseno sul `X_meta` grezzo (81k), stessi 1.600 test: **recall@20 11,0%** (film plot 6,3%,
film no-plot 4,5%, serie 14,9-18,5%). Il modello A1 faceva 12,7%: la rete aggiungeva +1,7 punti.
Non c'era architettura che colmasse il resto: il top-20 del grafo è **comportamento**.

## Cosa mancava nelle feature

| segnale | copertura | quota top-20 (archi / peso) | in `X_meta` 05 |
|---|---:|---|---|
| `collection_id` (franchise) | 14,5% dei film | 13,1% / **49,8%** | no |
| `networks` TV | 100% delle serie | 11,4% / — | sì (`rt:`) |
| `writers` | — | — | no |
| `original_language` | — | — | no (`lg:` assente) |
| `content_rating`, durata, stagioni | — | — | no |

`data.extra_features()` aggiunge: `cl:` (collection), `wr:` (sceneggiatori), `lg:` (lingua),
`cr:` (rating), `du:` (durata a fasce), `se:` (stagioni, 1-5+), con pesi per tipo e L2 per riga;
token rari (df<3) fuori. 8.052 token, 222k nonzero, 774 collection.

## Cosa è stato addestrato (stessa split, 256-d)

| modello | feature | target | own | quartiere | recall@20 |
|---|---|---|---:|---:|---:|
| A1 | 05 | top-25 InfoNCE | 19,4% | 38,8% | 12,7% |
| **A8** | + extra | top-25 InfoNCE | **20,2%** | 38,7% | **13,0%** |
| **A10** | + extra | **intera riga del grafo** | **21,9%** | **40,7%** | **15,2%** |
| A11 | + extra + keyword film | intera riga | 22,8% | 40,7% | 15,1% |
| **A12** | + extra | intera riga, γ=0,5 | **22,1%** | **41,2%** | **15,2%** |

A10: softmax pieno su tutti i 66.259 con memory bank; target = distribuzione della **riga intera**
del triangolo (13,2M archi, pesi normalizzati), non i 25 forti. Gli 11,6M archi deboli portano la
struttura della bolla che il top-25 butta via: **+2,2 punti di recall** sul miglior A8. A12
(γ=0,5, target più piatto) pareggia il recall e migliora la collocazione: 22,1% / 41,2% — è il
modello dell'artefatto.

Per strato (A10): film plot 13,4%; film no-plot 8,6%; serie plot 23,2%; serie no-plot 18,3%;
film low 8,0%; serie low 18,2%. Franchise (96 test): 19,8% contro 16,5% di A1 — la collection
serve, ma i film senza trama restano il punto debole (la trama è il segnale forte).

## Esito

- **Il modello puro è migliorato**: 12,7% → **15,2%** recall, 19,4% → 21,9% own, senza un solo
  lookup nel grafo a inferenza. La supervisione è il grafo (legittimo: è distillazione).
- **Le keyword non aggiungono** nemmeno sopra A10 (A11: 15,1%): il set di token cambia il
  carattere del vicinato (ticket 13), non il numero.
- **Il 50% non è raggiungibile con i metadati**: il kNN grezzo fa 11,0%, il modello 15,2%, e la
  bolla oracolo + ranking denso si ferma a 32,3%. Il resto è comportamento non osservabile nei
  metadati TMDB.
- **Artefatto**: `spazio-denso-v10.npz` ricostruito da **A12** (`--nome a12`), con
  `kwset_sha` e `modello` dentro.

Acceptance: soddisfatta. Modello puro, misurato per strato, con il soffitto dichiarato.
