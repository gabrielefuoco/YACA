# 05 — L'imbuto: il grafo davanti allo scorer di produzione, a parità di budget

**Status**: `wontfix` · **Type**: `research` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 04

## Il metodo (che è la parte che vale)

75 trial, 5 profili reali, **ranker di produzione** (`scoringEngine`), a parità di posti: per ogni sorgente di
candidati si pesca lo stesso numero di titoli e si conta il **recall** su ciò che l'utente ha davvero visto
dopo. Accanto a ogni riga, **il caso con la stessa numerosità** e il **rank per sola popolarità**: se il caso
fa lo stesso punteggio, la sorgente non ha informazione.

## I numeri (dopo le feature estese)

| sorgente | candidati | recall@50 | recall@200 | solo popolarità |
|---|---|---|---|---|
| **grafo 2 hop** | 824 | **5,9%** | **8,7%** | 4,9% |
| grafo 1 hop | 53 | 3,5% | 3,5% | 3,3% |
| grafo cluster+vicini | 4.118 | 2,9% | 7,3% | 2,3% |
| **POOL VERO** (`fetchSmartAndPool`) | 1.851 | 1,9% | 4,2% | 0,9% |
| caso (a parità di posti) | 534 | 1,3% | 2,8% | — |

**Il grafo batte il pool di produzione 3,1× @50 con 2,2 volte meno candidati.** E i suoi candidati sono meno
"famosi" (63 voti mediani contro 22 del pool): il segnale è gusto, non popolarità — anche se 4,9 dei 5,9 punti
sono ancora spiegati dalla popolarità da sola ([ticket 10](10-banco-appaiato-popolarita.md)).

Riproduzione: `export-graph-candidates.py` → `bench-graph-funnel.js`.

## Chiusura

Chiuso con la mappa il 10/11/2026, per decisione esplicita. La mappa era già chiusa come ricerca il 13/10/2026 e l'esito è nel V45 servito oggi; i ticket rimasti erano la coda da «passare in rassegna». Restano scritti qui: se una domanda tornerà utile, si riparte da questo testo invece che da zero.
