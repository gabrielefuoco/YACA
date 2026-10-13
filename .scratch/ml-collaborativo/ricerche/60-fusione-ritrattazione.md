# 60 — La fusione: ritrattazione, e la regola vera

**Cosa è successo**: il report 58 annunciava che la fusione per ranghi **raddoppiava il @10** sul metro curato. **Era un artefatto.** Il teacher chiamato «comportamento» era la **matrice nulla**, e la fusione con la matrice nulla non è una fusione: è un bias sistematico. Qui c'è la prova, la regola vera che ne esce, e il risultato buono che stava accanto.

Script: `rrf-curato-2.py` · `rrf-cataloghi.py` · `rrf-prodotto.py`.

---

## 1. La ritrattazione

Il teacher del report 58 era `Cf` — lo spazio del comportamento. Ma:

```
Cf: 66.259 righe, di cui le 16.550 SERIE sono TUTTE ZERO
sorgenti del gold curato: 249, di cui SERIE 249, FILM 0
norma media di Cf sulle sorgenti: 0.0
```

`Cf @ Cf[sorgenti].T` è quindi la **matrice nulla**. E `argsort` su tutti valori pari non restituisce un ordine casuale: restituisce **l'ordine di indice**, identico per ogni sorgente. Non un esperto: **una permutazione fissa**.

**La prova, per confronto diretto** — le tre righe che dovevano essere diverse e sono identiche:

| | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| teacher SOLO — `CF` (la matrice nulla) | 1,10% | 3,39% | 5,49% | 20,86% | 45,11% |
| **CONTROLLO — teacher = ordine di indice** | **1,10%** | **3,39%** | **5,49%** | **20,86%** | **45,11%** |
| **RRF camminata + `CF`(nullo), k=3000** | **22,65%** | **35,43%** | **39,82%** | **53,09%** | **70,36%** |
| *(il numero celebrato dal report 58)* | *22,65%* | *35,33%* | *39,72%* | *53,09%* | *70,36%* |

E il controllo con una **permutazione casuale** fissa, che è il vero «teacher senza informazione»:

| | @10 | @100 |
|---|---|---|
| CONTROLLO — permutazione casuale | **0,00%** | 0,20% |

**Piatto, come deve.** Un teacher senza informazione **distrugge** la fusione; l'ordine di indice no, perché non è senza informazione — porta il bias dei nodi di indice basso, e quello basta a gonfiare il numero.

## 2. Con teacher veri, sul metro curato: niente

Rifatta la misura con teacher che **coprono davvero le serie** (e con la camminata mascherata sulla sorgente, che è il protocollo corretto):

| | teacher solo @10 | teacher solo @100 | RRF k=60 @10 | RRF k=60 @100 | RRF k=3000 @10 |
|---|---|---|---|---|---|
| **camminata sola** | — | — | **9,88%** | 24,05% | — |
| metadati puliti | 0,50% | 5,29% | 6,79% | 24,15% | 1,70% |
| **CFst** (pubblico previsto) | **2,89%** | **17,76%** | 7,98% | **24,45%** | 4,89% |
| co-visione Trakt | 0,00% | 0,10% | 6,99% | 23,25% | 0,30% |
| `CF` (nullo) | 1,10% | 5,49% | 10,28% | 24,55% | **22,65%** ← l'artefatto |

**Nessun teacher vero batte la camminata al @10** (il migliore, `CFst`, fa 7,98% contro 9,88%). Al @100 il migliore guadagna **+0,40 punti** — dentro il rumore (±1,5).

**E si capisce perché**: sul metro curato la camminata **vede già tutto** — ha la curatela, i metadati, i temi, `CFst`. Non c'è niente che un teacher possa aggiungere. L'unica riga che «vince» è quella col teacher nullo, cioè quella rotta.

## 3. La regola vera: la fusione aiuta dove la camminata è cieca

Il risultato **buono** stava accanto, nei due cataloghi (`rrf-cataloghi.py`, cronologie Trakt, 356 utenti, split 60/40). Lì si vede la regola:

| catalogo | camminata | RRF col teacher migliore | delta @10 |
|---|---|---|---|
| **FILM** (semi film) | 4,65% | 4,64% *(comportamento, k=60)* | **−0,01** ← cieco? no: la camminata ha già `CF`×5 |
| **SERIE** (semi serie) | 1,83% | **3,20%** *(metadati, k=3000)* | **+75%** ← la camminata NON vede il comportamento |
| **SERIE** (semi film) | 1,03% | **1,32%** *(CFst, k=3000)* | **+28%** |
| **FILM** (semi serie) | 0,58% | **0,88%** *(CFst, k=3000)* | **+52%** |

**La regola**: la fusione aggiunge **dove il teacher vede qualcosa che la camminata non vede.**

- **Catalogo film**: la camminata ha il comportamento a peso 5. Il teacher del comportamento non aggiunge niente → **neutro**. ✓
- **Catalogo serie**: `CF` copre **zero serie**, quindi per un profilo di serie la camminata è cieca sul comportamento. Il teacher dei **metadati** — che per le serie è l'unico segnale, e da solo fa 1,15% @10 — aggiunge **+75%**. ✓
- **I due versi incrociati**: il profilo è di un medium, il catalogo dell'altro. La camminata attraversa, ma il teacher `CFst` (che dà un pubblico previsto a *tutte* le serie) aggiunge +28% e +52%. ✓
- **Metro curato**: la camminata ha già curatela + metadati + temi + `CFst` → **niente da aggiungere**. ✓

**E una cosa che vale da sola**: per il catalogo serie **il teacher dei metadati batte quello del comportamento** (3,20% contro 2,41% al @10) — perché le serie non hanno comportamento. Mentre per il catalogo film il teacher dei metadati è inutile (0,24% @10 da solo). **Il teacher va scelto per catalogo, non una volta per tutte.**

## 4. Un problema da risolvere: due varianti del grafo in giro

Controllando le discrepanze ho trovato che **i miei script non costruiscono lo stesso grafo**. Due varianti:

| | `correggi_hub` | mixing |
|---|---|---|
| **canonica** — `ottimizza-1.py`, `verifica-finale.py` | grado **binario** (`(A>0).sum(0)`) | **ogni componente normalizzata prima** di essere mescolata |
| **grezza** — `rrf-nuovo.py`, `rrf-prodotto.py`, `rrf-cataloghi.py`, `rrf-curato-2.py` | grado **pesato** (`A.sum(1)`) | i pesi grezzi, normalizzazione **alla fine** |

Sulla camminata del metro curato la differenza è **9,48-9,88% @10 (grezza) contro 11,18% (canonica)**: 1,4 punti, cioè l'errore del banco. **Non sono confrontabili fra loro.**

**Quale vale**: la **canonica**, perché è quella che ha prodotto i numeri di testa — il prodotto a 29,61% / 63,35% / 87,86% e il curato a 26,45% / 50,00% / 70,26%. E la normalizzazione per componente è anche la scelta più sensata: senza, un componente con peso 5 domina anche dove è più rado.

**Conseguenza**: le conclusioni dei report 58-59-60 sono **interne** a ciascuno script (il confronto è sempre fatto dentro la stessa esecuzione, quindi regge), ma **i loro numeri assoluti non vanno confrontati con quelli dei report 56-57**. Da sistemare prima di qualunque altra misura.

## 5. Cosa resta in piedi, in una riga

> **La fusione per ranghi non è un moltiplicatore: è un rimedio alla cecità.** Vale +75% al @10 sul catalogo serie e +28-52% sui versi incrociati — cioè **esattamente dove il prodotto è più debole**. Sui film, dove la camminata vede già il comportamento, è neutra.

E il corollario per il prodotto: **il catalogo serie è il posto dove la fusione serve**, e la sua testa (il @10) passa da 1,83% a **3,20%** — il guadagno più grande mai misurato su quel catalogo.

## 6. Cosa resta aperto

1. **Rifare la misura sul grafo canonico** — i numeri qui sono su una variante. Il segno delle conclusioni non cambia (i teacher non dipendono dal grafo), ma i valori sì.
2. **Il riferimento del report 41** (18,90% @10 sul curato): era su un **altro grafo** e va rifatto sul canonico, altrimenti il confronto è falso come lo era il report 58.
3. **I pesi e il `k` della fusione** vanno ritoccati: qui `k=3000` vince sul catalogo serie e `k=60` sul film. Sono due ottimi diversi.
4. **Il teacher per il catalogo serie va costruito meglio**: i metadati funzionano, ma la combinazione metadati + `CFst` non è stata provata.
