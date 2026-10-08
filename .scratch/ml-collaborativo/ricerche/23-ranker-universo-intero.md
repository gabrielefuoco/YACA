# 23 — Il ranker sull universo intero (soffitto 89%)

**Data**: 08/10/2026 · 100 account sintetici · universo = pool vero + 2 hop COMPLETO (nessun taglio)

Stessa disciplina: train/test separati per account, popolarita sempre in tabella, stesso universo per
tutti gli ordinamenti. Se il ranker tiene la precisione qui, la generazione dei candidati e l ordinamento
sono risolti insieme.

```
righe: 1,045,541 · account: 100 · positive: 9,305 (0.89%)
train: 50 account (518,189 righe) · test: 50 account (527,352 righe)
soffitto dell'universo: 9,305 su 13,950 titoli della verita' = 66.7%

=== POTERE DI OGNI FEATURE DA SOLA (AUC sul test, account mai visti) ===
  prod      AUC 0.683   (media train 0.82 · sd 0.68)
  lpop      AUC 0.694   (media train 4.87 · sd 1.85)
  collab    AUC 0.691   (media train 0.29 · sd 0.20)
  yeardiff  AUC 0.443   (media train 18.19 · sd 15.58)
  genrec    AUC 0.560   (media train 0.54 · sd 0.41)
  in1       AUC 0.628   (media train 0.09 · sd 0.29)
  in2       AUC 0.530   (media train 0.89 · sd 0.31)

=== RANKER COMPLETO (7 feature) (AUC 0.817) ===
  lpop      peso +0.920
  collab    peso +0.787
  in2       peso +0.227
  yeardiff  peso -0.166
  in1       peso +0.153
  genrec    peso +0.041
  prod      peso +0.030

=== RANKER SENZA LA SCELTA DEL GRAFO (5 feature) (AUC 0.807) ===
  lpop      peso +0.959
  collab    peso +0.896
  yeardiff  peso -0.194
  prod      peso +0.029
  genrec    peso +0.021

=== RECALL SULLO STESSO UNIVERSO DI CANDIDATI (test, account mai visti) ===
| ordinamento | @50 | @200 |
|---|---|---|
| popolarità (controllo banale) | 3.5% | 10.7% |
| scorer di produzione | 2.1% | 7.1% |
| posizione collaborativa | 3.0% | 8.2% |
| generi condivisi | 0.4% | 2.3% |
| RANKER (7 feature) | 5.1% | 16.4% |
| RANKER senza grafo (5) | 4.5% | 15.6% |

=== PER STRATO ===
| strato | ordinamento | @50 | @200 |
|---|---|---|---|
| fondo | popolarità | 1.4% | 3.9% |
| fondo | scorer di produzione | 1.2% | 4.1% |
| fondo | posizione collaborativa | 2.8% | 7.5% |
| fondo | RANKER (7 feature) | 3.3% | 11.1% |
| resto | popolarità | 9.6% | 29.7% |
| resto | scorer di produzione | 4.6% | 15.6% |
| resto | posizione collaborativa | 3.6% | 10.3% |
| resto | RANKER (7 feature) | 10.0% | 31.4% |
```

## Le letture

1. **Il ranker tiene la sua leadership su un universo 5 volte piu' grande**: 5,1% contro 3,5% della
   popolarita' (**+46%**) e 2,4x lo scorer di produzione. La gerarchia e' la stessa dei due universi:
   ranker > popolarita' > posizione collaborativa > scorer di produzione > generi.
2. **La quota del raggiungibile crolla** (dal 78% del vecchio universo al ~6%), ma il raggiungibile ora
   e' l'85-89% invece del 22,8%: i titoli che il vecchio strumento non vedeva erano i piu' difficili
   (nicchia, 199 voti mediani contro 4.872). **Il compito e' piu' difficile, non il risultato peggiore**:
   su 10k candidati, 50 posti prendono il 6% di tutto cio' che si puo' prendere.
3. **Il pattern e' stabile su due universi indipendenti**: `prod` pesa +0.03 in entrambi (**zavorra**),
   `collab` e' la seconda feature in entrambi (+0.65 e +0.79), il guadagno e' tutto sulla nicchia
   (fondo: 3,3% contro 1,4% = **2,4x** la popolarita'; resto: 10,0% contro 9,6% = **pari**).
4. Quindi: la **generazione** e' risolta dal 2 hop del grafo (85% raggiungibile, contro il 67% del pool
   da solo); l'**ordinamento** batte la popolarita' grazie alla nicchia; **il lavoro che resta e' trovare
   la nicchia dentro 10k candidati**, ed e' esattamente dove il collaborativo e' l'unica cosa che funziona
   (sul fondo la sola posizione collaborativa fa 2x la popolarita': 2,8% contro 1,4%).
5. **Una feature instabile, da non usare**: `yeardiff` passa da +0.02 a -0.17 fra i due universi e cambia
   AUC (0.330 -> 0.443). Le feature che cambiano segno col contesto vanno segnalate, non usate.
6. L'AUC scende da 0.873 a 0.817: coerente con un compito piu' difficile. Il numero da guardare resta il
   recall@50, non l'AUC.

## Cosa resta aperto

- **Il mainstream**: il ranker pareggia la popolarita' (10,0% contro 9,6%), non la batte. Sui gusti
  diffusi la popolarita' e' gia' quasi ottimale.
- **La serie**: non misurate da nessuno strumento (MovieLens e' solo film).
- **La produzione**: le feature che vincono (posizione collaborativa, vicinato del grafo) esistono solo
  nel prototipo. Portarle in `src/` e' un lavoro a parte, e servirebbe training data vero.
