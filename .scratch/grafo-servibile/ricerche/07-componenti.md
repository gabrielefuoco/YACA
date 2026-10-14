# 07 — Pesi di specificità, maschere di formato, firma produttiva

**Status**: `resolved` · **Ticket**: [07](../issues/07-componenti-specificita.md) · **Script**: `07-componenti.py` · **Log**: `log/07-componenti.log` · **825 s** (componenti + 6 partizioni) · **giudice**: `log/06-giudice-bolle-07-*.log`

## Cosa è stato costruito

Quattro interventi sui componenti strutturali, ognuno misurato separatamente **prima** di essere
combinato, come chiede il ticket. Più sei partizioni Leiden (res 100, seme 42) da giudicare.

| partizione | bolle | con ≥15 titoli | mediana taglia | modularità |
|---|---|---|---|---|
| **A** base (gli stessi componenti di `bolle2-E`) | 5.297 | 1.293 | 9 | 0,0573 |
| **B** + CAST2 al posto di CAST | 5.192 | 1.299 | 10 | 0,0549 |
| **C** + KW2 al posto di KW | 5.144 | **1.373** | 10 | 0,0576 |
| **D** + maschera di formato | 4.877 | **1.379** | 10 | 0,0610 |
| **E** + PROD | 4.762 | **1.441** | 11 | 0,0570 |
| **F** tutto insieme | 4.326 | **1.550** | 12 | 0,0596 |

**`bolle-07-A` riproduce `bolle2-E` esattamente** — 5.297 bolle. È il controllo che il cablaggio è
lo stesso, e senza quello le altre cinque righe non vorrebbero dire niente.

Il conteggio delle bolle utilizzabili passa da **1.293 a 1.550**: **+19,9%**. Sulla carta i quattro
interventi fanno esattamente ciò che dovevano — bolle più grandi, più mondi navigabili, meno briciole.

---

## ⚠️ Ma il giudice automatico dice il contrario

| partizione | bolle | identificazione | controllo |
|---|---|---|---|
| **A** base | 199 | **53,3%** | 20% |
| **F** tutto insieme | 200 | **51,0%** | 20% |

**F è 2,3 punti *peggiore* di A.** Con un errore standard di 5,0 punti, **z = 0,46, p ≈ 0,65**: non è
una differenza, in nessuna delle due direzioni. Il criterio del ticket — «il giudice automatico
migliora rispetto ai componenti attuali» — **non è soddisfatto**, e non è nemmeno smentito: è
**irrisolto**, perché con 200 bolle lo strumento non distingue differenze sotto i 5 punti (lezione
del ticket 06).

**Due indicatori, due storie opposte.** Le bolle utilizzabili salgono del 20%; la separabilità non
si muove. E il ticket 05 aveva già mostrato una volta che il conteggio delle bolle è un **proxy**, e
che i proxy sbagliano: 88 bolle su 100 erano buone lettura alla mano quando la modularità diceva
tutt'altro.

L'unico giudice che resta è la **lettura**, e non è stata fatta: leggere 100 bolle di F e confrontarle
con le 100 di A è il passo che direbbe se il +20% è mondo o è gonfiore. **Questo ticket lascia la
domanda aperta di proposito** invece di scegliere l'indicatore che gli dà ragione.

---

## I quattro interventi, uno per uno

### 1. CAST2 — i pesi che non pesano

L'attore pesa per la **posizione nei titoli di testa** (`1/(1+ordine)`) e per la **concentrazione
tematica** della carriera (`1/(1+entropia di generi e paesi)`).

**Il controllo di ubiquità FALLISCE.** I 16 attori più prolifici del catalogo:

| attore | titoli | posizione mediana | concentrazione | peso |
|---|---|---|---|---|
| Frank Welker | 226 | 9 | 0,293 | **0,276** |
| Mel Blanc | 211 | 9 | 0,408 | 0,346 |
| Bess Flowers | 206 | 14 | 0,386 | 0,159 |
| Samuel L. Jackson | 135 | 6 | 0,250 | ~0,30 |
| *(riferimento: attori con 5-30 titoli)* | — | — | — | **0,464** |

**I più prolifici pesano 1,2× meno del tipico.** Non «escono dalla testa della classifica»: restano
lì. Il motivo è che l'**IDF** — che già c'è — schiaccia tutto: `log(66.259/227) = 5,68` per Frank
Welker contro `log(66.259/21) = 8,06` per un attore con 20 titoli. Solo **1,4×** di differenza, perché
il logaritmo appiattisce quando i conteggi sono tutti nelle centinaia. E sopra ci si moltiplica il
peso di posizione (0,10-0,17 per un ruolo non protagonista) e la concentrazione (0,22-0,49): il
prodotto totale dà 1,2×.

Per demotivare davvero un caratterista servirebbe una funzione **più ripida del logaritmo**
(`1/conteggio`, o un'entropia calcolata sulla distribuzione *completa* e non sulla concentrazione
normalizzata). Il design come scritto non fa il lavoro.

### 2. KW2 — il filtro che tiene esattamente la metà (per costruzione)

Una keyword sopravvive se la similarità **comportamentale** media delle coppie di titoli che la
condividono sta sopra la mediana. 16.238 keyword con ≥3 titoli · coerenza mediana **+0,0317** ·
tenute **8.119 = 50,0%**.

⚠️ **Il 50,0% non è un risultato: è una tautologia.** La soglia *è* la mediana, quindi tiene
esattamente metà delle keyword per definizione. Il numero non dice niente sulla qualità del filtro.

**Il controllo che dice qualcosa**: le keyword che l'esperto aveva nominato come esempi da potare.

| keyword | titoli | coerenza | esito |
|---|---|---|---|
| based on novel or book | 4.869 | +0,0173 | **potata** ✓ |
| woman director | 3.748 | +0,0296 | **potata** ✓ |
| murder | 2.964 | +0,0250 | **potata** ✓ |
| remake | 851 | +0,0124 | **potata** ✓ |
| flashback | 362 | +0,0096 | **potata** ✓ |
| independent film | 227 | +0,0240 | **potata** ✓ |
| coming of age | 1.050 | +0,0287 | **potata** ✓ |
| sequel | 1.684 | +0,0508 | tenuta ✗ |
| duringcreditsstinger | 611 | +0,0628 | tenuta ✗ |
| based on true story | 1.574 | +0,0383 | tenuta ✗ |
| love | 1.079 | +0,0335 | tenuta ✗ |
| **wuxia** | 122 | +0,0266 | **potata** ✗ |

**Otto su sedici sono state potate, e fra le potate ci sono i casi più grossi** (`based on novel or
book` con 4.869 titoli, `woman director` con 3.748, `murder` con 2.964): il filtro **prende di mira
le keyword generiche frequenti** ✓ che è quello che doveva fare.

**Ma pota anche `wuxia`** — un micro-genere vero, con 122 titoli e nessuna ambiguità. E tiene
`duringcreditsstinger` e `sequel`. Il motivo è che la soglia è la **mediana della coerenza**, senza
alcun riferimento alla **frequenza**: una keyword rara e precisa come `wuxia` ha coerenza +0,0266
perché i suoi 122 titoli sono eterogenei, e cade.

**La correzione da fare**: la soglia deve unire coerenza **e** frequenza — potare solo ciò che è
**generico E incoerente** (per esempio: coerenza sotto la mediana **e** più di 500 titoli). Con la
regola attuale, metà del vocabolario muore per una proprietà statistica, non per una proprietà
semantica.

### 3. FMT — la maschera di formato

| | titoli |
|---|---|
| corti (`runtime` < 45 min, non documentari) | 9.226 |
| documentari | 4.965 |
| fiction | 52.068 |

Matrice di compatibilità (righe/colonne: fiction, corto, documentario):

```
1,00  0,25  0,20
0,25  1,00  0,25
0,20  0,25  1,00
```

Un corto verso un lungometraggio vale 0,25, un documentario verso la fiction 0,20. È la sola delle
quattro che **riduce** gli archi invece di ripesarli, e la partizione D è quella che migliora di più
il conteggio dopo PROD (+86 bolle utilizzabili). Nessun effetto misurato separatamente sulla
separabilità: **non verificata**, non «verificata negativa».

### 4. PROD — la firma produttiva

Studio o rete di **nicchia** (≤40 titoli per le compagnie, ≤60 per le reti), oppure **paese non
statunitense + decennio + genere** — la combinazione, non «entrambi USA» e non «entrambi anni '90».

| | |
|---|---|
| firme distinte | 48.538 |
| titoli con almeno una firma | 57.342 (**86,5%**) |
| firme per titolo (mediana) | 3 |
| archi | 1.661.064 · titoli con archi 53.775 |

**La copertura è alta (86,5%)** ed è il criterio del ticket ✓. I numeri di recupero sono
**invariati** ✓ (è un componente che entra solo nella partizione delle bolle, non nella ricetta).

---

## I criteri del ticket

- [x] ciascuno dei quattro è misurato separatamente **prima** di essere combinato (sei partizioni, A riproduce la base)
- [ ] ❌ **il giudice automatico NON migliora**: F 51,0% contro A 53,3%, differenza non risolvibile (p ≈ 0,65). Il criterio non è né soddisfatto né smentito
- [ ] ❌ **il controllo di ubiquità fallisce**: i 16 attori più prolifici pesano 1,2× meno del tipico, non «escono dalla testa»
- [ ] ⚠️ **le keyword potate sono riconoscibili come non estetiche — solo in parte**: 8 su 16 delle nominate, ma anche `wuxia` è stata potata, e restano `duringcreditsstinger` e `sequel`
- [x] copertura di PROD dichiarata (**86,5%**) e numeri di recupero invariati
- [ ] ⚠️ **l'ablation non è stata rifatta**: la partizione E aggiunge PROD senza togliere niente, quindi non c'è un test «un componente peggiora in silenzio il contributo di un altro»

## Cosa resta aperto (e chi lo riprende)

**La domanda vera non ha risposta: le bolle di F sono mondi o sono gonfiore?** Il conteggio dice
+19,9%, il giudice dice niente, e il ticket 05 ha già stabilito una volta che **il conteggio è un
proxy che sbaglia**. Serve la **lettura**: 100 bolle di F contro le 100 di A, con lo stesso campione
e gli stessi occhi. Il ticket 08 è il posto dove farlo, perché è il ticket che riguarda la
rifinitura delle bolle — e il ticket 05 ha già detto che il suo pezzo forte (lo split delle chimere)
non copre la popolazione malata.

**La correzione pronta da fare**: la soglia del KW2 deve unire coerenza **e** frequenza. È una riga
di codice e un ri-run di 13 minuti.

## Limiti dichiarati

1. **Il giudice su A e F è a 200 bolle per parte**, quindi risolve differenze di ≥5 punti al 95%: una differenza di 2 non è misurabile con questo campione, in nessuna direzione.
2. **Le partizioni A-F sono sei Leiden a seme 42** su grafi diversi: il seme fisso non garantisce che i mondi siano gli stessi, anzi **non lo sono** (A ha 5.297 bolle, F 4.326). Confrontare i conteggi è legittimo, confrontare le singole bolle no.
3. **La formula del KW2 usa lo spazio del comportamento (CF) per misurare la coerenza**: una keyword che predice bene la co-visione *TV* ma non CF viene potata anche se è buona.
4. **La soglia di nicchia di PROD (≤40 compagnie, ≤60 reti) è arbitraria.** Non è stata esplorata: con soglie diverse la copertura cambierebbe.
5. **La concentrazione di carriera usa la metà generi e la metà paesi** (peso 0,5 ciascuno): una scelta, non una misura.
6. **La maschera di formato non è mai stata verificata da sola**: la partizione D migliora il conteggio, ma quale parte venga dalla maschera e quale dal rumore del seme non è stato isolato.
