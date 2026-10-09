# 24 — Il pool senza filtro: il guadagno economico

**Data**: 08/10/2026 · 100 account · universo = POOL INTERO (18k, senza filtro genere+keyword) + 2 hop completo

Stesso ranker, stesse feature, stessa disciplina (train/test per account, popolarita in tabella).
Cambia UNA cosa: il pool non viene piu filtrato prima di ordinarlo.

```
righe: 2,469,180 · account: 100 · positive: 11,027 (0.45%)
train: 50 account (1,226,442 righe) · test: 50 account (1,242,738 righe)
soffitto dell'universo: 11,027 su 13,950 titoli della verita' = 79.0%

=== POTERE DI OGNI FEATURE DA SOLA (AUC sul test, account mai visti) ===
  prod      AUC 0.707   (media train 0.77 · sd 0.62)
  lpop      AUC 0.656   (media train 5.32 · sd 1.84)
  collab    AUC 0.772   (media train 0.18 · sd 0.18)
  yeardiff  AUC 0.386   (media train 21.08 · sd 17.26)
  genrec    AUC 0.595   (media train 0.45 · sd 0.40)
  in1       AUC 0.630   (media train 0.04 · sd 0.19)
  in2       AUC 0.720   (media train 0.38 · sd 0.48)

=== RANKER COMPLETO (7 feature) (AUC 0.882) ===
  lpop      peso +1.015
  collab    peso +0.774
  in2       peso +0.581
  yeardiff  peso -0.208
  in1       peso +0.096
  genrec    peso +0.068
  prod      peso +0.035

=== RANKER SENZA LA SCELTA DEL GRAFO (5 feature) (AUC 0.858) ===
  lpop      peso +1.042
  collab    peso +1.028
  yeardiff  peso -0.250
  genrec    peso +0.074
  prod      peso +0.063

=== RECALL SULLO STESSO UNIVERSO DI CANDIDATI (test, account mai visti) ===
| ordinamento | @50 | @200 |
|---|---|---|
| popolarità (controllo banale) | 2.4% | 7.8% |
| scorer di produzione | 1.2% | 4.8% |
| posizione collaborativa | 2.7% | 7.0% |
| generi condivisi | 0.2% | 1.5% |
| RANKER (7 feature) | 4.2% | 14.1% |
| RANKER senza grafo (5) | 3.9% | 12.9% |

=== PER STRATO ===
| strato | ordinamento | @50 | @200 |
|---|---|---|---|
| fondo | popolarità | 0.4% | 1.8% |
| fondo | scorer di produzione | 0.6% | 2.7% |
| fondo | posizione collaborativa | 2.5% | 6.6% |
| fondo | RANKER (7 feature) | 2.8% | 9.8% |
| resto | popolarità | 7.2% | 22.7% |
| resto | scorer di produzione | 2.5% | 9.8% |
| resto | posizione collaborativa | 3.1% | 7.9% |
| resto | RANKER (7 feature) | 7.5% | 24.5% |
```

## Le letture — e una previsione sbagliata

**Avevo previsto che togliere il filtro alzasse il recall. Non e' successo.**

| | pool filtrato (run 23) | **pool intero (run 24)** |
|---|---|---|
| candidati (mediana) | ~10.000 | **~24.700** |
| soffitto (verita' raggiungibile) | 66,7% | **79,0%** (calcolato) |
| popolarita' @50 | 3,5% | 2,4% |
| scorer di produzione @50 | 2,1% | 1,2% |
| posizione collaborativa @50 | 3,0% | 2,7% |
| **RANKER @50** | **5,1%** | **4,2%** |
| ranker in quota del soffitto | 7,6% | **4,7%** |

Il soffitto sale di **12,3 punti** e il ranker **ne prende meno**. Non e' un errore: e' il risultato.

1. **Perche'**: i 12,3 punti di verita' che il filtro esclude sono proprio i titoli **senza legame di
   genere/keyword con il profilo** — i piu' difficili, quelli "sorpresa". Renderli *raggiungibili* non li
   rende *trovabili*: il ranker non ha le feature per distinguerli in un pagliaio 2,4 volte piu' grande.
2. **Il filtro non e' un bug: e' un riduttore di pagliaio.** Costa soffitto, guadagna efficienza. Con
   l'ordinamento di oggi e' **netto positivo**. Andrebbe tolto solo con un ranker molto piu' bravo a
   trovare la nicchia — non prima.
3. **Ma il quadro dei segnali cambia, ed e' la parte utile**: sull'universo grande il vantaggio del ranker
   sulla popolarita' **cresce** (4,2% contro 2,4% = **+75%**, contro +46% col pool filtrato) e il
   collaborativo diventa decisivo sulla nicchia: **2,5% contro 0,4% della popolarita' = 6x**. La
   popolarita' **crolla** dove la verita' e' di nicchia (0,4% @50 sul fondo).
4. **`in2` diventa una feature forte** (AUC 0.720, peso +0.581, era 0.530/+0.227): con il pool intero,
   "essere a distanza 2 nella cronologia" distingue i titoli lontani che il pool filtrato non conteneva.
5. **Il mainstream, per la terza volta su tre**: ranker 7,5% contro popolarita' 7,2% = **pari**. Il ranker
   non batte la popolarita' sui gusti diffusi, in nessuno dei tre universi.
6. Lo scorer di produzione: peso **+0.035** (zavorra per la terza volta su tre, con tre universi diversi).

## La conclusione che cambia la priorita'

Il collo di bottiglia **non e' il soffitto** (79% raggiungibile) ma la **trovabilita'**: 50 posti prendono
il 4,7% di cio' che si puo' prendere. Non servono candidati piu' numerosi — servono **feature che trovino
la nicchia**. E l'unico segnale che oggi lo fa e' la **posizione collaborativa** (6x la popolarita' sul
fondo, dove tutto il resto crolla).

**Quindi**: smettere di allargare i candidati e lavorare sulla nicchia — che e' anche l'unica parte dove
il prodotto ha un vantaggio reale, perche' sui gusti diffusi la popolarita' basta e avanza.


## Correzione (di nuovo un numero stimato)

Avevo scritto "~89%", stimandolo dalla sweep di 60 account invece di calcolarlo. Il soffitto esatto di
questo run e' **79,0%** (11.027 su 13.950), quindi il guadagno di raggiungibilita' togliendo il filtro e'
**+12,3 punti**, non +22.

**E' la seconda volta in due report che scrivo un numero stimato invece di calcolarlo** (il primo: "85-89%"
nel report 23). La direzione delle conclusioni non cambia — il soffitto sale e il recall scende comunque —
ma e' un errore ricorrente e va nominato: **il soffitto si calcola prima di scrivere, sempre**. La
prossima volta il numero sta nel comando, non nella frase.
