# 16 — Il JSON di produzione non è riproducibile dal builder del repo

**Status**: `wontfix` · **Type**: `task` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Il fatto

| | dichiara | scrive `L1_adjacency` |
|---|---|---|
| `src/data/hierarchical_graph.json` (in produzione) | `metadata.version = "2.3"` | **no** |
| `offline_graph_builder/build_graph.py` (nel repo) | `"version": "2.0"` (riga 502) | **sì** (riga 512) |

Stesso commit (`786c230`), due lignaggi diversi. Il secondo output del builder (`src/data/graph_data.json`,
riga 18) **non esiste** nel repo.

**Conseguenza**: il file che gira in produzione non si può rigenerare dal codice che abbiamo — e questa è
probabilmente la *causa* del ticket 13 (una pipeline diversa ha rigenerato il JSON lasciando fuori la chiave).

## Cosa fare

1. Stabilire quale builder ha prodotto il JSON 2.3 (git history, artefatti, macchina) e riconciliare il codice.
2. Allineare la versione dichiarata al formato scritto (2.0 vs 2.3).
3. **Aggiungere un test di contratto**: tutte le chiavi che il codice legge devono esistere nel JSON, o il
   caricamento deve *urlare*. È la classe di bug più costosa di questo filone — tre casi trovati
   ([13](13-l1-adjacency.md), e la diffidenza su `children_L1`), tutti silenziosi.
4. Ricostruire il JSON con lo script riconciliato e diffare l'output prima di sostituirlo.

## Chiusura

Chiuso con la mappa il 10/11/2026, per decisione esplicita. La mappa era già chiusa come ricerca il 13/10/2026 e l'esito è nel V45 servito oggi; i ticket rimasti erano la coda da «passare in rassegna». Restano scritti qui: se una domanda tornerà utile, si riparte da questo testo invece che da zero.
