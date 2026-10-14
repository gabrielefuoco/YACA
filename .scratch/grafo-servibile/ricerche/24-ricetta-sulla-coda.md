# 24 — La ricetta ridecisa sulla coda

**Status**: `resolved` · **Ticket**: [24](../issues/24-ricetta-sulla-coda.md) · **Script**: `24-prodotto.py` (901 s) · `24-track.py` · **Log**: `log/24-prodotto.log`, `log/24-track.log`

## Il difetto che questo ticket ripara

Il ticket 21 ha scelto **film = CF + TV(0,5)** misurando la **recall globale**. La metrica che il prodotto dichiara di volere è **mezzo+coda** — l'«azzeccato non banale», fuori dal top 5% di popolarità.

**Misurate insieme, le due metriche dicono cose opposte.** Questo ticket rimisura **tutte** le candidate con le tre metriche affiancate e decide **sulla coda**.

## Parte A — il banco prodotto, temporale + mascheramento, 997 utenti

| candidata | **coda @10** | **coda @100** | **coda @500** | glob @10 | glob @100 | glob @500 |
|---|---|---|---|---|---|---|
| **R0** CF da solo | 1,36 | 10,94 | 33,26 | 2,89 | 18,94 | 47,78 |
| **A** + TV (0,5) | 1,21 | 9,95 | 31,42 | 3,27 | 20,15 | 48,95 |
| **B** + LIST (0,5) | 1,27 | 10,37 | 31,92 | 3,07 | 19,46 | 48,30 |
| **C** + TV + LIST | 1,07 | 9,42 | 30,83 | 3,26 | 20,35 | 49,34 |
| **D** **+ decadimento (365)** | **1,38** | **11,11** | **33,69** | 2,88 | 19,07 | 48,22 |
| **E** + gating (τ0=5) | 1,28 | 10,60 | 32,32 | 2,97 | 19,19 | 47,28 |
| **F** tutto | **1,01** | **9,33** | **30,92** | **3,30** | **20,56** | **49,69** |

**Differenza da R0:**

| candidata | coda @10 | coda @100 | coda @500 | glob @10 | glob @100 | glob @500 |
|---|---|---|---|---|---|---|
| A + TV | −0,151 | −0,994 | −1,834 | +0,385 | +1,210 | +1,173 |
| B + LIST | −0,095 | −0,574 | −1,339 | +0,183 | +0,525 | +0,518 |
| C + TV + LIST | −0,289 | −1,517 | −2,424 | +0,367 | +1,410 | +1,556 |
| **D + decadimento** | **+0,020** | **+0,166** | **+0,432** | −0,005 | +0,135 | +0,436 |
| E + gating | −0,079 | −0,341 | −0,939 | +0,080 | +0,257 | −0,499 |
| **F tutto** | **−0,353** | **−1,612** | **−2,341** | **+0,408** | **+1,625** | **+1,913** |

## Il risultato in una riga

> **La ricetta che massimizza la recall globale — F, «tutto» — è la PEGGIORE sulla coda: −2,341 al @500.**

E il rovescio: **l'unica candidata che non peggiora la coda a nessuna soglia è il decadimento temporale** (+0,02 / +0,17 / +0,43), che sulla testa fa quasi niente (+0,135 al @100).

**Questo non è un paradosso: è la misura di quanto le due metriche misurino cose diverse.**
- La recall **globale** è dominata dai titoli popolari, che sono la maggioranza dell'oro;
- la **coda** conta solo i titoli non popolari, e lì il vantaggio della popolarità non esiste.
- Ogni componente che porta **comportamento** (co-visione, liste, comportamento degli altri utenti) porta con sé il **gusto della maggioranza**: aggiungerlo sposta la massa dove il comportamento è denso, cioè sulla testa.

## La decisione, presa sulla coda

> ⚠️ Questa è la decisione **per il catalogo film**, presa sul banco MovieLens. Il **catalogo serie** è deciso nella parte B e **tiene la co-visione**: le due conclusioni sono diverse e la ragione è scritta lì.

**La ricetta di riferimento per il FILM è R0 + decadimento:**

```
catalogo FILM    CF + decadimento sui semi (tau = 365 giorni)          SENZA TV
catalogo SERIE   CFst + B + TV + decadimento (tau = 365)              CON TV
                 k = 30 · beta = 0,25 · alfa = 0,30 · tau = 365      <- QUATTRO parametri liberi
                 senza curatela · senza liste · senza gating
```

**Sulla coda è l'unica che tiene** (+0,17 al @100, +0,43 al @500) e **sulla testa non fa danno** (−0,005 al @10, +0,135 al @100). È piccola, ma è **l'unica nella direzione giusta**, ed è coerente con il fatto che non porta comportamento nuovo: cambia **quali** semi contano nel profilo dell'utente, non aggiunge il gusto di nessun altro.

**Restano fuori, e la ragione è la coda, non la testa:**

| fuori | sulla coda | sulla testa |
|---|---|---|
| **TV** | −1,834 al @500 | +1,173 al @500 |
| **LIST** | −1,339 al @500 | +0,518 al @500 |
| **gating** | −0,939 al @500 | −0,499 al @500 (male su entrambe) |
| **i pesi appresi** | mai misurati sulla coda | +8,38 al @500 sul banco curato |
| **la curatela** | misurata ma su **un** banco solo | — |

⚠️ **E i pesi appresi dalla curatela (ticket 19) non sono mai stati misurati sulla coda.** Il +8,38 al @500 è una recall globale su un banco di giudizio: **la stessa lacuna che ha fatto sbagliare il ticket 21**, e non è stata chiusa. Va scritta come tale.

## Parte B — il banco Trakt stratificato (5 fold, TV costruito sui 4/5 degli utenti)

Il guadagno più celebrato della fase — «la co-visione porta il catalogo serie da 2,86% a 5,04% al @10» — **era una recall globale e non era mai stato stratificato**.

| catalogo **film** | @10 | @100 | @500 |
|---|---|---|---|
| globale DIFF (con − senza TV) | +1,09±0,08 | +3,33±0,06 | +3,38±0,16 |
| **coda DIFF** | **+0,31±0,13** | **+1,06±0,31** | **+1,78±0,22** |

| catalogo **serie** | @10 | @100 | @500 |
|---|---|---|---|
| globale DIFF | +2,19±0,14 | +7,88±0,21 | +10,27±0,21 |
| **coda DIFF** | **+1,44±0,08** | **+6,82±0,35** | **+10,01±0,19** |

**Sul banco Trakt la co-visione migliora la coda su ENTRAMBI i cataloghi** ✓✓ — e sul catalogo serie il guadagno della coda è quasi tutto il guadagno: **+10,01 su +10,27 al @500, cioè il 97%**.

### Ma il quadro cambia segno passando al banco MovieLens

| catalogo film | coda @10 | coda @100 | coda @500 |
|---|---|---|---|
| **MovieLens** (TV = sorgente **estranea**) | **−0,151** | **−0,994** | **−1,834** |
| **Trakt** (TV = sorgente **propria**) | **+0,31** | **+1,06** | **+1,78** |

**Sulla coda, la co-visione passa l'invarianza sul suo banco e la fallisce su quello estraneo.** E la spiegazione è la stessa di tutto il resto: **TV è costruita dalle cronologie Trakt, quindi porta il gusto di QUELLA popolazione**. Su Trakt quel gusto è quello giusto; su MovieLens è il gusto di un'altra platea — e sulla coda, dove il vantaggio della popolarità non esiste, si vede.

**Quindi il verdetto del ticket 21 — «TV passa l'invarianza cross-dominio» — era vero sulla testa e falso sulla coda.** L'invarianza va dichiarata **per metrica**, non per componente.

## La ricetta finale, e i due cataloghi non la vogliono uguale

```
catalogo FILM    CF + decadimento (tau = 365)              SENZA TV
catalogo SERIE   CFst + B + TV + decadimento (tau = 365)   CON TV
                 k = 30 · beta = 0,25 · alfa = 0,30 · tau = 365
```

**Quattro parametri liberi** (k, β, α, τ): quello che cambia fra i due cataloghi è l'**insieme dei componenti**, che è una decisione, non un parametro tarato.

**Perché i due cataloghi divergono**: sul film la co-visione è una sorgente estranea e **peggiora la coda** (−1,83 al @500); sul serie è la sorgente propria e **la migliora di +10,01 al @500**. È la stessa asimmetria che il ticket 66 aveva trovato («i componenti essenziali dei due cataloghi sono disgiunti»), ora confermata sulla metrica che conta.

⚠️ **Ma il lato serie è misurato SOLO sulla sorgente propria**: non esiste un secondo banco di serie, quindi l'invarianza del lato serie **non è verificabile**. Va letto come «funziona sulla sua popolazione», non come «funziona».

## ⚠️ Il rovescio della medaglia, che va detto

**La coda non si guadagna con niente di ciò che abbiamo provato.** Su 62.322 titoli d'oro, il miglioramento della coda è di **+0,17 punti al @100** (dal 10,94% all'11,11%). Non c'è nessuna aggiunta, fra quelle misurate, che sposti la coda in modo sostanziale — e **sei su sette la peggiorano**.

Questo dice qualcosa che vale più del ticket: **la coda non è un problema di componente mancante, è un problema di come si sceglie.** Il comportamento disponibile è popolare per costruzione; se il prodotto vuole la coda, la coda va **imposta**, non cercata — per esempio un peso differenziato in uscita (che non si applichi ai titoli già popolari), che è la stessa correzione che servirebbe alle liste.

## I criteri del ticket

- [x] la tabella delle candidate con **globale / mezzo+coda / auto-informazione** affiancate — anzi: globale e coda, che sono le due che divergono
- [x] **la ricetta di riferimento dichiarata sulla coda**: R0 + decadimento, e cinque candidate su sei escluse
- [x] **il banco Trakt stratificato** ✓ — e il risultato **cambia il verdetto su TV**: la coda migliora su Trakt (+1,44 al @10 sul serie, +0,31 sul film) e **peggiora su MovieLens** (−0,15). L'invarianza va dichiarata **per metrica**
- [x] **se la coda non migliora con nessuna aggiunta il negativo è dichiarato**: non migliora in modo sostanziale (+0,17 al @100), e il negativo è scritto
- [x] il ticket 21 e il map portano **il verdetto corretto**, non quello vecchio
- [x] il numero di parametri liberi **non cresce**: quattro (k, β, α, τ)

## Limiti dichiarati

1. **Il lato serie è misurato solo sulla sorgente propria** (non esiste un secondo banco di serie): la scelta di tenere TV sul catalogo serie poggia su una popolazione sola, e l'invarianza **non è verificabile** lì. È il limite più serio della decisione.
2. **La coda è misurata come un blocco unico** (mezzo+coda, il 95% del catalogo): un'analisi per fascia separata (mezzo, coda) direbbe se il guadagno è nei titoli medi o in quelli rari. **Non è stata fatta.**
3. **Le differenze sulla coda sono piccole** (+0,17 al @100 su 62.322 titoli d'oro): non ho calcolato un intervallo di confidenza, e +0,17 potrebbe essere dentro il rumore.
4. **Un solo τ (365 giorni)** per il decadimento: il ticket 15 ne aveva provati due (180 e 365) e il 365 vinceva, ma nessuno dei due era stato valutato sulla coda.
5. **La regola del 21 sulla coda non è stata applicata come minimax su due banchi**: il banco curato non ha una misurazione della coda, quindi l'invarianza cross-dominio **non è verificabile** per questa decisione. Si è deciso su un banco (il prodotto), e va letto come tale.
