# Pipeline del grafo — cosa ricostruisce, e cosa ha rivelato

Comando unico: `services/graph_dense/build_graph.py`. Ricostruisce tutti i *processing* dai corpora già
in `.cache` e dagli embedding conservati; non scarica dati e non riaddestra lo studente. Non sovrascrive
V42: scrive una versione nuova (`services/graph/data/v42d/`) con `pipeline-manifest.json`.

```bash
PYTHONPATH=. py -m services.graph_dense.build_graph --check
PYTHONPATH=. py -m services.graph_dense.build_graph --build --version v42d
```

## Cosa è entrato

| passo | fonte | note |
|---|---|---|
| canone, metadati, TF-IDF, trama, studente | `graph_dense/data/{graph,trama-qwen3b,rffstudent-v18}` | riusati, mai rigenerati |
| interazioni Trakt | `.cache/trakt/users` | `trakt.py` ricalcola la matrice compatta |
| COVISION | MovieLens + Trakt + AniList + Serializd | sconto temporale, `--topk 100`, `minsup 2` |
| TRAMA | embedding trama conservato | identico |
| KWSEM | TF-IDF + Qwen3 | embedding **ora conservati** in `data/embeddings/kwsem-qwen3-0.6b.npz` |
| RRFST | `rrfstudent-v18.npz` (default) | vedi sotto: V42 usava un altro file |
| CAST/DIR/PROD/COLL | Parquet TMDB | identici (PROD differisce solo per arrotondamenti float) |
| LIST | liste Trakt, autori holdout esclusi | ricetta documentata |
| CREWPROP | Parquet TMDB | identico |
| CONTESTI | NMF su 4 blocchi, K=24 | identico |
| LISTSEM | nomi liste + Qwen3 | embedding **ora conservati** |
| TRIBU | SVD deterministica | seed 20261105, vettore latente salvato |
| RESID | MovieLens residualizzato, NMF, seed 7 | identico |

Embedding conservati in `services/graph_dense/data/embeddings/` (KWSEM, LISTSEM, TRIBU, RESID). I pesi
Qwen sono serviti una sola volta, per materializzarli; i build successivi lavorano offline.

## Riproducibilità verificata

- **TRIBU**: due build con lo stesso seed → **0 differenze** su 2.767.000 archi. Prima, senza seed, la
  matrice cambiava del 90% pur mantenendo lo stesso numero di archi.
- **Dieci tipi su quattordici** ricostruiti byte-identici: TRAMA, KWSEM, RRFST (a parità di sorgente),
  CAST, DIR, COLL, CREWPROP, CONTESTI, LISTSEM, RESID.

## Quattro tipi di V42 non erano ricostruibili dai dati documentati

| tipo | V42 | ricetta documentata | causa |
|---|---|---|---|
| RRFST | 7.649.700 archi | `rrfstudent-v18.npz` | V42 usava **`rrfstudent-swap.npz`** (jaccard 1.000 con quello, 0.195 con lo studente v18) |
| COVISION | 3.950.110 archi | `--topk 100`, sconto temporale | jaccard 0.55 con la ricostruzione: dipende dalle date di uscita usate allora |
| LIST | 146.564 archi | autori holdout esclusi | V42 precedente all'introduzione dell'holdout (ora 105.684, jaccard 0.58) |
| TRIBU | 2.767.000 archi | SVD non seedata | matrice diversa al 90% |

## V42 conteneva il vecchio studente

`rrfstudent-swap.npz` è il file dell'esperimento di scambio: le prime 66.259 righe sono i vettori
**V15** esatti, il resto è V18. La RRFST congelata in V42 viene da lì, non dal file documentato.

Effetto misurato su *Barbie* (`movie:346698`):

| grafo | top-7 | *Povere creature!* |
|---|---|---:|
| V42 congelato (RRFST dal file swap) | Lady Bird · Big Eyes · The Mask · Piccole donne · Crudelia · Past Lives · EEAAO | **#11** |
| V42D con RRFST da `rrfstudent-v18` | Piccole donne · **La sirenetta · Wonka** · Lady Bird · The Mask · Big Eyes · **Pinocchio** | **#183** |
| V42D con RRFST dal file swap | Lady Bird · Piccole donne · The Mask · Big Eyes · EEAAO · Past Lives · The Red Pill | **#12** |

La differenza è **interamente** RRFST: tutto il resto della build è identico. Coincide con quanto V18.md
dichiarava già ("caso debole: Barbie, lo studente nuovo deriva sul blockbuster family").

Dev set, V42 vs V42D con RRFST-swap: R@20 0,028 → 0,025, Δ −0,0034 [−0,0068; −0,0003], MDE 0,0046.
Differenza al limite del rumore, ma non nulla.

## Ciclo completo: grafo senza studente → studente nuovo → grafo

Esperimento `V42E`, in due passi.

**1. Il grafo senza studente.** RRFST a peso 0, tutti gli altri tipi identici (hash verificati).

| grafo | R@5 | R@10 | R@20 | MRR | >5k |
|---|---:|---:|---:|---:|---:|
| V42 (congelato) | 0,008 | 0,016 | 0,028 | 0,0081 | 69,0% |
| V42D (studente v18) | 0,007 | 0,014 | 0,030 | 0,0070 | 67,1% |
| **senza RRFST** | 0,007 | 0,012 | **0,021** | 0,0069 | 67,5% |

Il confronto appaiato sul dev set: **−0,0072** [−0,0125; −0,0026], MDE 0,0071 → **sopra l'MDE**.
RRFST non è ridondante: porta accuratezza reale. Su *Barbie* spariscono *La sirenetta* e *Wonka*,
ma *Povere creature!* resta al #139.

**2. Studente nuovo, addestrato su quel grafo.** `train-studente.py` con quel MIX come maestro,
30 epoche (399 s), poi tipo RRFST, miscela e chiusura → `V42E`.

| grafo | R@20 | Δ vs V42 [IC95] | verdetto |
|---|---:|---|---|
| V42 (congelato) | 0,028 | — | riferimento |
| V42D (studente v18) | 0,030 | +0,0021 [−0,0034; +0,0078] | rumore |
| senza RRFST | 0,021 | −0,0072 [−0,0125; −0,0026] | **sopra MDE** |
| **V42E (studente nuovo)** | **0,026** | −0,0022 [−0,0069; +0,0025] | rumore |

Lo studente addestrato sul grafo senza studente **recupera quasi tutto** (0,021 → 0,026) e torna
indistinguibile da V42 e da V42D. Il grafo non ha più bisogno di nessuno dei due studenti ereditati:
nessun vettore V15, nessun file di esperimento, un solo studente coerente che copre il canone e ha il
modello `.pt` per i titoli futuri.

**Barbie in V42E**: Lady Bird · Piccole donne · Glass Onion · Borat 2 · La rivincita delle bionde ·
The Mask You Live In · Big Eyes. Niente cartoni family; *Povere creature!* però resta al #192.
Su *Drive* e *Povere creature!* le liste sono buone quanto prima.

## La conseguenza scomoda

Nessuno dei tre grafi "puliti" riproduce *Povere creature!* al #11 di V42. Quel #11 poggiava sui vettori
V15 dentro `rrfstudent-swap.npz`, e la self-distillation non li ricrea — coerente con quanto V18.md già
diceva: il vecchio studente valeva per le fonti esterne (Mercury, pool curati) che l'auto-distillazione
non ha.

Quindi la scelta non è più "quale studente", ma una di queste:

1. **Adottare V42E** come base riproducibile e pulita; accettare che *Barbie→Povere creature!* resti un
   problema aperto da risolvere con un segnale nuovo (non con un vettore vecchio).
2. **Tenere V42 congelato** sapendo che contiene V15 dentro un file di test: nessun lavoro, ma il grafo
   resta a due velocità (86,6% dei titoli con vettori V15, 13,4% — quasi tutta la coda recente — con V18).
3. **V42D**: miglior R@20 (0,030) ma *La sirenetta*, *Wonka*, *Pinocchio* in testa a *Barbie*.

V42E cambia i candidati in 46 liste su 50 rispetto a V42: è un grafo diverso, non una variante cosmetica.


