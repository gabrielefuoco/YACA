# 03 — Lo student: dai metadati allo spazio collaborativo

**Status**: `resolved` · **Type**: `task` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 02

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
