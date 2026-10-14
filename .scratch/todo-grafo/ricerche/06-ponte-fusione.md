# Ticket 06 — Il ponte film→serie e la fusione dei due voti

`Status: resolved` · 14/10/2026 · esito di `06-ponte.py` e `06b-ponte-studente.py`

**Verdetto: il ponte non funziona, e la fusione peggiora sempre.** Provato in due versioni — la mia e
quella esatta dell'esperto, con lo studente dei film vero — e in tutte e due è peggio del solo voto
diretto. Il `λ` migliore è **0**.

---

## I numeri

| voto | propria bolla |
|---|---|
| **diretto, coseno (ticket 05/06c)** | **35,3%** |
| ponte, ricetta dell'esperto (studente dei film) | **0,8%** |
| ponte, versione mia (coseno contro i centroidi delle bolle-film) | 2,5% |
| fusione `diretto + 0,25·ponte` | 27,8% |
| fusione `diretto + 0,5·ponte` | 19,2% |
| fusione `diretto + 1,0·ponte` | 9,2% |

E la taratura di `λ` su metà del banco, verificata sull'altra metà (dalla versione mia, che è la più
generosa col ponte):

```
lambda 0        taratura  63.3% · verifica  64.0%
lambda 0.25     taratura  64.0% · verifica  64.3%
lambda 0.5      taratura  64.0% · verifica  62.3%
lambda 1        taratura  63.0% · verifica  60.3%
lambda 2        taratura  57.3% · verifica  53.7%
lambda 4        taratura  47.3% · verifica  47.7%
lambda 8        taratura  33.7% · verifica  37.3%
```

Quel 64% è il numero gonfiato dal leave-one-out sbagliato (ticket 05): in scala, `λ=0` è già il
migliore e ogni incremento peggiora. Il guadagno di `λ=0.25` è +0,3%, che è rumore.

## Le due strade non si parlano

| | |
|---|---|
| diretto e ponte scelgono la stessa bolla | **6/600 (1,0%)** |
| il diretto ha ragione dove il ponte sbaglia | **203** |
| il ponte ha ragione dove il diretto sbaglia | **3** |
| sbagliano tutti e due | 392 |

Su 600 serie i due voti concordano **sei volte**. Non sono due misure della stessa cosa: sono due cose
diverse. E il ponte, quando vince, vince 3 volte su 600.

## Perché fallisce — e non è colpa della mia deviazione

L'ho scritto nel codice prima di misurare, e la misura lo conferma: il ponte vero usa la Ridge
`FX → Cf`, cioè lo **studente dei film**, che predice lo spazio CF. Ma il ticket 02 di `inserimento`
aveva già misurato che quella proiezione recupera la **struttura dei metadati**, non il comportamento:
**0,0% di vicini in comune con lo spazio CF**.

Quindi `P(b_film | s)` non è una distribuzione sul comportamento di una serie: è una distribuzione
sui **metadati dei film** che le somigliano. Il ponte è allora un **giro lungo attraverso i centroidi
dei film** per tornare ai metadati della serie — e la sosta intermedia perde informazione. Il diretto
fa la stessa cosa senza il giro e senza la perdita.

**Il ponte non aggiunge un'informazione che il diretto non abbia: usa la stessa.** Non è un difetto
dell'idea in astratto — un ponte fra due mondi funziona se porta un segnale che l'altro non ha — ma
qui i due lati del ponte vedono gli stessi metadati.

## E i 94 casi cross-medium non li recupera nessuno dei due

Il ticket 05 ha misurato il tetto: 94 serie su 600 (15,7%) hanno la bolla vera **a maggioranza film**,
quindi il vincolo di medium le esclude per costruzione. Sono la popolazione che §1.B.2 voleva
recuperare col ponte.

| popolazione | diretto | ponte |
|---|---|---|
| le 506 con bolla-serie | **41,9%** | ~0% |
| le 94 cross-medium | **0%** | **0%** |

Zero e zero. Il ponte non le tocca, e non le tocca perché il suo passo 2 — la matrice `BB~` dei
legami fra bolle-film e bolle-serie — è già **quello che manca loro**: una serie che vive in una bolla
di film non ha una bolla-serie di partenza da cui partire.

**Questo è il problema che resta aperto, ed è piccolo e preciso**: 94 serie su 600, tutte con bolle
grandi (mediana 74 titoli). Non serve un ponte: serve **togliere il vincolo di medium** e lasciare che
una serie candidata possa atterrare in una bolla-film — che è quello che la partizione V8 già dice.
Il posto giusto per misurarlo è il ticket 07, sulla mappa a 6+2.

## Nota sulla ricetta

L'esperto scrive `BB~` riga-normalizzata «perché una bolla-film con 40 archi non deve valere quanto
una con 3»: giusto, ed è quello che ho fatto. E scrive `P(b_film | s)` con la media pesata dalla
distribuzione della serie sulle bolle-film: fatto anche quello (parte positiva, righe normalizzate,
perché la Ridge produce valori negativi che non sono probabilità).

Le due deviazioni dalla lettera della ricetta — usare il voto diretto invece dello studente nel mio
primo tentativo, e `clip(0)` sulla Ridge nel secondo — **non sono la causa del fallimento**: la
versione fedele fa 0,8% e la mia 2,5%, entrambe lontane dal 35,3%. Il ponte non funziona in nessuna
delle due forme.
