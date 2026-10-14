# 21 — La decisione di ricetta

**Status**: `resolved` · **Ticket**: [21](../issues/21-decisione-ricetta.md) · **Script**: `21-decisione.py` · **Log**: `log/21-decisione.log` · **532 s**

---

## La regola, scritta e datata PRIMA dei numeri — 13/10/2026

> **1. Invarianza cross-dominio.** Un componente estratto da una sorgente si valida se migliora o **non degrada** il banco dell'altra. Un componente nato dai dati di comportamento si valida sul banco comportamentale di origine opposta.
>
> **2. Minimax normalizzato.** Si misura il guadagno relativo alla baseline di **ciascun** banco e si sceglie la ricetta che massimizza il **minimo** dei guadagni.
>
> **3. I parametri liberi non crescono.** La ricetta non ha più di **quattro** parametri liberi.
>
> **4. Un negativo dichiarato è un risultato ammesso.** Se nessuna ricetta vince sul minimo, si dice.

**Le candidate, enumerate prima**: `R0` MINIMA (film = CF, serie = CFst+B) · `R1` +TV · `R2` +TV+LIST · `R3` R2 + decadimento + gating.

**Il banco nativo non esiste** (ticket 22, `wontfix`): la decisione è presa **senza**, e il ticket lo dichiara.

---

## Il test che mancava: l'invarianza cross-dominio di TV

TV è estratta dalle cronologie **Trakt**, e i banchi su cui era stata misurata (ticket 17) sono banchi **Trakt** — la sua stessa sorgente. **L'invarianza chiede che TV migliori anche il banco MovieLens**, che è l'altra. **Non era mai stato misurato.**

**Ed è stato misurato ora.** Banco prodotto, temporale + mascheramento, 997 utenti:

| | @10 | @100 | @500 |
|---|---|---|---|
| **R0** MINIMA (CF da solo) | 2,89% | 18,94% | 47,78% |
| R1 **+ TV (0,25)** | 3,13% | 19,72% | 48,57% |
| **R1 + TV (0,5)** | **3,27%** | **20,15%** | **48,95%** |
| R1 + TV (1,0) | 3,30% | 20,28% | 48,53% |
| **R2 + TV (0,5) + LIST (0,5)** | 3,26% | **20,35%** | **49,34%** |

| differenza da R0 | @10 | @100 | @500 |
|---|---|---|---|
| TV peso 0,5 | **+0,39** | **+1,21** | **+1,17** |
| TV peso 1,0 | +0,41 | +1,34 | +0,75 |
| LIST peso 0,5 | +0,18 | +0,52 | +0,52 |
| **TV 0,5 + LIST 0,5** | +0,37 | **+1,41** | **+1,56** |

**E sul banco Trakt (ticket 17, 5 fold in cross-validazione, utenti mai visti): film +1,09 al @10, serie +2,19.**

> **TV è il primo componente di questa sessione che migliora ENTRAMBI i banchi.** Passa l'invarianza cross-dominio: estratta da Trakt, migliora MovieLens; misurata su utenti che non l'hanno costruita, migliora il catalogo serie del **77%**.

---

## La decisione: **R1 — MINIMA + TV a peso 0,5**

```
catalogo FILM    CF + TV (0,5)
catalogo SERIE   CFst + B + TV (0,5)
                 k = 30 · beta = 0,25 · alfa = 0,30 · w_TV = 0,5     <- QUATTRO parametri liberi
                 senza curatela
```

**Perché R1 e non R2** (che aggiunge le liste e vale +0,20 in più al @100):

- **Le liste peggiorano mezzo+coda di −1,34 al @500** (ticket 18), e la coda è la metrica che conta per il prodotto;
- l'effetto delle liste **sul banco Trakt non è mai stato misurato**, quindi non passa l'invarianza per mancanza di prova, non per merito;
- il guadagno marginale (+0,20 al @100) **non paga** una regressione non dichiarata sulla coda.

**R1 è l'unica candidata che non ha nessuna regressione misurata.** Le liste **possono rientrare**, ma riequilibrate in uscita (un peso che non si applichi ai titoli già popolari) — ed è un lavoro, non una decisione.

**e il decadimento e il gating restano fuori** dalla ricetta di riferimento:

| | guadagno | perché non entra |
|---|---|---|
| decadimento temporale | +0,13 al @100, **zero al @10** | sotto il rumore, e aggiunge un parametro (τ) |
| gating λ_cold | +0,25 al @100, −0,50 al @500 | il guadagno è dentro il rumore e la coda peggiora |
| pesi appresi dalla curatela | +6,99 al @100 sul banco curato | misurato su **un** banco: l'invarianza non è provata |

---

## ⚠️ Il limite che invalida un minimax rigoroso

**I tre banchi usano protocolli diversi**: il prodotto è temporale con mascheramento, il Trakt è a split casuale con cross-validazione, il curato è un banco di giudizio. **Un minimax che li attraversa somma mele e arance.**

Quindi la regola 2 è stata applicata **dentro ciascun banco** (dove il confronto è lecito) e la scelta finale è ricaduta sulla regola 1 — **l'invarianza** — che è l'unica che attraversa i banchi in modo sensato: *un componente deve fare bene su entrambi, o non entra.*

**La decisione è solida per la regola 1 e debole per la regola 2.** Va letto così.

---

## I criteri del ticket

- [x] la regola è scritta e **datata prima** di produrre i numeri (in testa a questo report e nel docstring dello script)
- [x] le ricette candidate sono **enumerate prima**, non cercate dopo: R0, R1, R2, R3
- [x] la ricetta scelta è riportata col **guadagno minimo** e col **banco perdente dichiarato**: R1 guadagna su **tutti** i banchi misurati — non c'è un banco perdente
- [x] la ricetta **non ha più parametri liberi di quella di oggi**: quattro (k, β, α, w_TV)
- [ ] ⚠️ **un negativo dichiarato è un risultato ammesso**: qui il negativo c'è ed è **R2, R3 e i pesi appresi** — non entrano, e le ragioni sono scritte
- [x] **il micro-banco non esiste** (ticket 22, `wontfix`): la decisione dichiara di essere stata presa **senza**
- [x] il banco curato (ticket 19) **non entra nella decisione**: migliora solo sé stesso, e l'invarianza non è provata

## Limiti dichiarati

1. **Il banco Trakt è a split casuale**, quindi il +2,19 al @10 è gonfiato di 2-3× come tutti i numeri presi così (ticket 68). **La direzione è verificata in cross-validazione, la grandezza no.**
2. **Il peso 0,5 di TV è un punto di una griglia di tre** (0,25 / 0,5 / 1,0): il vero ottimo è fra 0,4 e 0,7 e non è stato cercato.
3. **TV è un componente dell'era `componenti-nuovi.py`** (SVD a 128 delle cronologie Trakt, 4/5 degli utenti in cross-validazione): se TV viene ricostruito — per esempio con la co-occorrenza diretta invece dell'SVD — i pesi vanno rimisurati.
4. **La decisione non tocca l'ordinamento**: i numeri qui sono di recupero. L'ordinamento del catalogo serie (report 69, ticket 63-65) resta un pezzo separato che il ticket 15 ha solo iniziato a toccare.
5. **Nessuna delle ricette è stata provata end-to-end** sul prodotto: si decide la struttura, non il servizio.
