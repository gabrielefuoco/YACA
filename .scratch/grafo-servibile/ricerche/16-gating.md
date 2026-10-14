# 16 — Il gating condizionato al grado per i titoli nuovi

**Status**: `resolved` · **Ticket**: [16](../issues/16-gating-cold.md) · **Script**: `16-gating.py` · **Log**: `log/16-gating.log`
**Protocollo**: banco prodotto, split temporale, **con il mascheramento del ticket 03**. 997 utenti. Il banco è lo stesso del ticket 15, quindi la riga di riferimento deve riprodurre **2,89 / 18,94 / 47,78**.

## Il meccanismo

Il blocco strutturale (pubblico previsto, keyword, regia, cast, firma produttiva) pesa per un fattore che va a **zero sui nodi con comportamento forte** e a **uno sui nodi senza comportamento**:

```
lambda(i) = tau0 / (tau0 + d_behav(i))        d_behav = grado nei componenti comportamentali
```

E l'arco strutturale fra *i* e *j* sopravvive se **almeno uno dei due è freddo** (`max(λ_i, λ_j)`) — altrimenti un titolo nuovo non potrebbe agganciarsi a nessun film caldo, che è esattamente ciò per cui il gating esiste.

`τ0 → ∞` è «metadati dappertutto»: il caso che l'ablation dice dannoso, e che questo esperimento doveva **riprodurre** come controllo della spiegazione.

## Il risultato

| τ0 | @10 | @100 | @500 |
|---|---|---|---|
| **CF da solo** (riferimento) | **2,89** | **18,94** | **47,78** |
| 0 (gating estremo) | 2,92 | 18,96 | 47,52 |
| 1 | 2,95 | 19,02 | **47,61** |
| **5** | 2,97 | **19,19** | 47,28 |
| 20 | **2,99** | 18,98 | 46,16 |
| 100 | 2,36 | 16,97 | 42,97 |
| ∞ (metadati ovunque) | **1,98** | **14,82** | **40,44** |

**Differenza dal riferimento:**

| τ0 | @10 | @100 | @500 |
|---|---|---|---|
| 5 | +0,08 | **+0,25** | −0,50 |
| 20 | +0,10 | +0,04 | −1,62 |
| 100 | −0,53 | −1,97 | −4,81 |
| ∞ | **−0,91** | **−4,12** | **−7,34** |

### 1. ✅ La spiegazione è confermata: i metadati «facevano male» perché erano ovunque

**`τ0 = ∞` costa 4,12 punti al @100 e 7,34 al @500.** È il caso «aggiungi la struttura a tutti», ed è **disastroso** — non lievemente dannoso: disastroso. Il motivo è quello che il ticket supponeva: su un titolo che ha già centinaia di archi comportamentali, la struttura aggiunge rumore rispetto al segnale vero, e con la struttura a peso pieno quel rumore domina.

**Questa è la parte del ticket che regge.** Il gating non è un'ipotesi: è la spiegazione misurata di un risultato che era già in archivio.

### 2. ✅ Il plateau c'è, ed è τ0 ∈ [1, 20]

τ0 = 1, 5, 20 danno tutti risultati quasi identici (max +0,10 al @10, +0,25 al @100). Il ginocchio è fra 20 e 100: sopra, il gating smette di proteggere. Il valore da tenere è **τ0 = 5** (il migliore al @100, il migliore degli altri due al @500) o **20** se conta il @10.

**Il guadagno è piccolo**: +0,25 punti al @100. Nella stessa famiglia del decadimento del ticket 15 (+0,13) e con lo stesso problema — non c'è un intervallo di confidenza, e su 997 utenti una differenza di un quarto di punto **potrebbe non essere distinguibile dal rumore**. Va trattata come una direzione.

### 3. ❌ I titoli freddi NON migliorano — e il motivo è che non ci sono

La stratificazione dell'oro per grado comportamentale (freddo = il quartile più basso, `d_behav ≤ 111`):

| τ0 | oro FREDDO @10 | oro CALDO @10 |
|---|---|---|
| 0 | 1,03% | 3,56% |
| 5 | 1,02% | 3,62% |
| 20 | **1,17%** | 3,60% |
| ∞ | 0,84% | 2,37% |

Il meglio che il gating fa sui titoli freddi è **+0,14 punti al @10** (τ0=20), e a τ0=5 non fa niente. Il criterio del ticket — «la recall sui titoli freddi sale **ben sopra** il 2,4% @10» — **non è soddisfatto**. Non «sale poco»: non sale.

**E il motivo è nel dato, non nel metodo:**

```
d_behav = 0 su 2.481 titoli (3,7% del catalogo) · di cui FILM: 654 · mediana di d_behav: 59
```

**Il grafo del comportamento copre il 96,3% del catalogo.** Un k-NN a k=30 dà almeno 30 vicini a quasi ogni titolo per costruzione, e la co-visione aggiunge il resto: i titoli **senza nessun** vicino comportamentale sono **654 film su 49.709 (1,3%)**.

Quindi la popolazione che il gating doveva servire — «il titolo appena uscito, che non ha comportamento» — **è quasi vuota nel catalogo film**. Questo non dice che il gating sia inutile: dice che nel grafo del comportamento **non esistono titoli freddi**, e che il problema dei «titoli nuovi» va affrontato **dove i titoli nascono**, non nel grafo che li contiene già tutti.

**Il ticket 15 aveva già mostrato la stessa cosa da un altro lato**: il filone dominante di un utente pesa il 2,6%, perché il grafo è troppo connesso per avere popolazioni separate. Questo è il secondo sintomo dello stesso fatto.

## Le cautele sulla stratificazione

- **La soglia «freddo» al 25° percentile è `d_behav ≤ 111`**: un titolo con 111 vicini comportamentali **non è freddo**, è normale. La stratificazione è quindi **troppo larga** e diluisce l'effetto in cerca. La verifica vera (i 654 film a grado zero, o i titoli usciti dopo T) non è stata fatta separatamente, e va fatta se il gating viene ripreso.
- Il criterio del ticket citava **2,4% @10** — che è il valore delle 163 sorgenti FREDDE del **banco curato**, non dei titoli freddi del catalogo. Misurare il gating su quel banco è un esperimento diverso, non fatto.

## I controlli

Sono **gli stessi del ticket 15** — stesso banco, stesso protocollo, stessa esclusione del profilo e del cesto — quindi si riusano invece di ricalcolarli (`15-controlli.py`):

| | @10 | @100 | @500 |
|---|---|---|---|
| popolarità | 1,47% | 9,23% | 27,70% |
| ordine di indice | 0,74% | 7,04% | 21,63% |
| **CF da solo** | **2,89%** | **18,94%** | **47,78%** |
| τ0 = 5 | 2,97% | 19,19% | 47,28% |

⚠️ La parte dei controlli **dentro** `16-gating.py` è andata in errore (`misura_fissa` costruiva un rango a una dimensione su una matrice a 997 colonne) **dopo** aver stampato tutti i risultati. Non è stato corretto nel file perché i numeri sono già quelli sopra e ricalcolarli in un secondo posto violerebbe la regola «una sola implementazione»: si citano quelli di `15-controlli.py`, che sono gli stessi per costruzione.

## I criteri del ticket

- [ ] ❌ **la recall sui titoli freddi sale ben sopra il 2,4% @10**: non sale (1,03% → 1,17% al meglio, e a τ0=5 non si muove). Il motivo è che i titoli freddi sono **654 film su 49.709**: la popolazione è quasi vuota
- [x] **i titoli caldi non degradano** entro la tolleranza dichiarata: a τ0=5 il @10 passa da 2,89 a 2,97 e l'oro caldo da 3,56 a 3,62 — migliora, non degrada ✓
- [x] **τ0 è esplorato e il plateau trovato**: [1, 20], con il ginocchio fra 20 e 100
- [x] **✅ la spiegazione è verificata**: il caso «metadati ovunque» **riproduce** il danno (−4,12 al @100, −7,34 al @500) e il gating lo rimuove. È il risultato più solido del ticket
- [x] `d_behav` è dichiarato: comportamento = CF + co-visione (B); **non** TV, che non è nella ricetta film

## Limiti dichiarati

1. **Il guadagno è di un quarto di punto al @100, senza intervallo di confidenza.** Trattarlo come una direzione, non come un guadagno dimostrato.
2. **La stratificazione «freddo/caldo» è troppo larga** (soglia al 25° percentile = 111 vicini). Un test vero richiede la definizione stretta (grado zero, o titoli usciti dopo T).
3. **`d_behav` conta anche i 30 vicini che ogni titolo ha per costruzione** nel k-NN di CF: non misura «quanto comportamento ha un titolo», misura «quanti vicini ha nel grafo», che è una cosa più debole. Con k più basso, o con una soglia di similarità più alta, la popolazione fredda sarebbe più grande — e il gating avrebbe su cosa lavorare.
4. **La struttura è entrata a peso uguale a CF** (`CFn + struttura`): altre dosi non sono state provate, e l'ottimo di τ0 dipende da quella scelta.
5. **Il lato serie non è stato toccato.**
