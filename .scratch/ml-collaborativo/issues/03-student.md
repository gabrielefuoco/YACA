# 03 — Lo student: dai metadati allo spazio collaborativo

**Status**: `wontfix` · **Type**: `task` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 02

## Cosa è stato fatto

Ridge lineare (`sklearn`, `solver=lsqr`) che predice il vettore del teacher dai metadati, su 39.768 film di
train e 9.941 di test (20% tenuto fuori, seed 20260810). Feature: topoi del sottografo (1.982) + generi + 5
numeriche.

## Bilancio

| | held-out | in-sample | gap |
|---|---|---|---|
| controllo (vettore medio) | 0,224 | — | — |
| student base | **0,430** | 0,484 | +0,054 |
| + feature estese | 0,479 | 0,607 | +0,128 |
| **+ alpha 30** | **0,500** | 0,581 | **+0,081** |

Il gap base di +0,054 dice una cosa precisa: **il Ridge non sotto-adatta** → una testa non lineare non è la
prima leva. Le leve erano le feature ([07](07-feature-estese.md)) e la regolarizzazione ([08](08-fix-puntuali.md)).

## Chiusura

Chiuso con la mappa il 10/11/2026, per decisione esplicita. La mappa era già chiusa come ricerca il 13/10/2026 e l'esito è nel V45 servito oggi; i ticket rimasti erano la coda da «passare in rassegna». Restano scritti qui: se una domanda tornerà utile, si riparte da questo testo invece che da zero.
