# Attraversamento: motore attuale contro min + k32 + spreading

Banco curato completo (499 voci, 3.533 link), candidati tutti i titoli. Base COVISION 1,0.

| grafo | modo | R@5 | R@10 | R@20 | MRR | >5k top-10 |
|---|---|---:|---:|---:|---:|---:|
| COV1.0 · tau3.0 | motore (top-16 diretto) | 0,139 | **0,201** | 0,239 | 0,091 | 66,0% |
| COV1.0 · tau3.0 | min + k32 + spreading | 0,135 | 0,193 | **0,261** | 0,095 | 63,7% |
| COV1.0 · tau2.0 | motore | **0,143** | **0,205** | 0,243 | 0,093 | 68,4% |
| COV1.0 · tau2.0 | min + k32 + spreading | 0,142 | 0,200 | **0,267** | 0,097 | **65,9%** |

## Cosa guadagna e cosa perde

- **R@20 +0,024 (+10%)**, MRR +0,004, meno blockbuster (68,4% → 65,9%).
- **R@5 −0,003, R@10 −0,005**: i primissimi posti restano uguali o leggermente peggiori.
- **Copertura dei link curati: dal 24,7% al 76,2%** — il grafo può esprimere tre volte tante
  relazioni curate, e il primo link giusto resta al primo posto nel 34,7% delle voci contro 35,5%.

## Correzione di un numero precedente

Il «+8% di R@10» misurato prima su 50 semi **non è confermato** sul banco completo: sul banco è
R@10 −0,005 e R@20 +10%. Un primo run di questa misura riportava un MRR crollato da 0,307 a 0,128;
era un errore di misura (i link non raggiungibili venivano esclusi dal denominatore), non un
risultato. Corretto il denominatore, l'MRR sale leggermente.

## Lettura

Lo spreading non migliora la precisione in testa: **allarga**. Per un prodotto che deve proporre
titoli che l'utente non ha ancora visto, il guadagno di copertura (+3x) e di R@20 vale la perdita di
0,005 in top-10 — ed è il tipo di cambiamento che sposta le liste fuori dal giro dei soliti noti.

## Artefatti

- script: `.scratch/distillazione-grafo/attraversa.py`
- grafi: `services/graph/data/v18cov-1.0/`, `services/graph/data/v18tau-2.0/`
