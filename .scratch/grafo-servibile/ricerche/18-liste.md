# 18 — Il componente LIST dalle liste curate da umani

**Status**: `resolved` · **Ticket**: [18](../issues/18-componente-liste.md) · **Script**: `18-liste.py` (38 s) · `18-bis-recupero.py` (324 s) · **Log**: `log/18-liste.log`, `log/18-bis-recupero.log`

## Cosa è stato costruito

422 liste Trakt (su 540 file: 118 illeggibili o con meno di 2 titoli nel catalogo), **22.867 item**, mediana di lunghezza **55**. Ogni coppia di titoli che compare nella stessa lista riceve

```
delta(i,j) = 1 / log2(1 + |L|)
```

poi la matrice si normalizza per grado come tutti gli altri componenti e si tengono i 30 vicini.

## ⚠️ Prima cosa: il «megadump da 1.500 titoli» non esiste

L'esperto motivava il peso per lunghezza con «una lista di quindici titoli pesa molto, un megadump da millecinquecento titoli pesa pochissimo».

**Misurato: le liste sono cappate a 100 item.** Il massimo è 100, la mediana 100, e il rapporto di peso fra la lista più corta (2 titoli, peso 0,631) e la più lunga (100, peso 0,150) è **4,20×** — non le decine di volte che il disegno presupponeva. Fra una lista da 15 e una da 100 e `1,66×`.

Il peso per lunghezza quindi **fa poco**, ed è giusto dirlo: la normalizzazione che conta in questo componente resta quella di **grado**, come per tutti gli altri. (Il cap a 100 è del raccoglitore, non del dato: se un giorno si raccogliessero le liste intere, il peso tornerebbe a servire.)

## ✅ La verifica che conta: le liste portano segnale comportamentale vero

**Le coppie che stanno in una lista si somigliano, nello spazio del comportamento, molto più di coppie a caso.**

| | similarità CF media | mediana |
|---|---|---|
| coppie dalla stessa lista | **+0,1597** | +0,0869 |
| coppie a caso | +0,0237 | −0,0003 |
| coppie a caso (media di 4 estrazioni) | +0,0232 | — |

**6,9× il caso**, e la differenza (+0,136) è enorme rispetto alla scala. Con un controllo replicato quattro volte per escludere che sia un'estrazione fortunata.

**Quindi le liste non sono un elenco di gusto personale: sono un segnale.** Un intenditore che mette insieme 55 titoli sta dicendo qualcosa che la co-visione conferma — ed è la prima volta in questa sessione che un dato di **curatela pura** supera una verifica comportamentale invece di fallirla.

## Il componente è preciso ma raro

| | |
|---|---|
| titoli coperti | **9.835 su 66.259 (14,8%)** — tutti film |
| coppie distinte (prima del top-30) | 727.173 |
| archi dopo il top-30 | 294.745 |
| mediana di archi per titolo | **0** |

**Metà dei titoli coperti resta senza nessun vicino** sopra la soglia di similarità (0,02): le coppie sono concentrate, e il componente tocca una fetta stretta del catalogo. Non è un male — è la sua natura: **alta precisione, bassa copertura.**

## ✅ E nel recupero migliora la testa della classifica

Banco prodotto, temporale + mascheramento. `LIST peso 0` = CF da solo.

| peso | @10 | @100 | @500 |
|---|---|---|---|
| 0 | 2,89 | 18,94 | 47,78 |
| **0,5** | **3,07** | **19,46** | **48,30** |
| 1,0 | 2,84 | 18,54 | 46,65 |
| 2,0 | 2,55 | 16,61 | 43,36 |

**A peso 0,5: +0,18 al @10, +0,52 al @100, +0,52 al @500.** È il miglioramento più grande visto finora in questa sessione — più del decadimento del ticket 15 (+0,13) e del gating del ticket 16 (+0,25). E sull'oro **coperto dalle liste** il guadagno è ancora più netto: 3,37% → **3,67%** al @10.

A peso 1 il segno si inverte già: **la dose conta più del componente**, e il peso giusto è **metà** di quello di CF.

## ⚠️ Ma peggiora il mezzo+coda — e questa è la cosa da guardare

| peso | @10 globale | @10 mezzo+coda | @500 globale | @500 mezzo+coda |
|---|---|---|---|---|
| 0 | 2,89 | **1,36** | 47,78 | **33,26** |
| 0,5 | 3,07 | **1,27** | 48,30 | **31,92** |

Il guadagno globale va **a spese della coda**: +0,18 sulla testa del catalogo, −0,09 su mezzo+coda al @10 e **−1,34 al @500**. Le liste curate sono fatte di titoli **noti** — un intenditore sceglie cose che conosce — quindi il componente spinge verso i titoli popolari.

E il prodotto, per dichiarazione, vuole l'**azzeccato non banale**: la metrica che conta è mezzo+coda, non la globale. Quindi:

> **il componente LIST, a questa dose, migliora il numero che non conta e peggiora quello che conta.**
>
> Non è un rifiuto: è una condizione. Per usarlo va riequilibrato — un peso più basso ancora, o un peso **differenziato in uscita** (che non si applichi ai titoli già popolari). Ed è esattamente il tipo di intervento che la specifica chiama «rilanciare sulla coda».

## Le altre verifiche

**La sovrapposizione con il banco**: 8.569 dei 9.835 titoli delle liste sono anche titoli del banco (87,1%) — ma la sovrapposizione è **al livello dei titoli, non delle persone**. I file delle liste sono per *lista* (`items-<id>.json`), non per utente: **le liste non sono state raccolte dalle cronologie che fanno da banco**, quindi non c'è contaminazione per costruzione ✓.

## I criteri del ticket

- [x] il componente è costruito, con copertura (14,8%) e archi (294.745) dichiarati
- [x] il rumore delle liste lunghe è **verificabilmente** abbattuto — ma va letto al contrario di come lo scrive il ticket: il rapporto è **4,20×** e il «megadump» non esiste, quindi il peso per lunghezza **fa poco**. Dichiarato
- [ ] ⚠️ **migliora l'asse comportamentale delle bolle misurato col giudice (06)**: non misurato, e per una ragione: il ticket 06 ha stabilito che con 200 bolle il giudice **non risolve differenze sotto i 5 punti**. La verifica A (6,9× il caso) è più forte e più economica, ed è quella che ho fatto
- [x] **migliora il recupero**: +0,52 al @100 globale a peso 0,5 ✓ — **ma peggiora mezzo+coda** (−1,34 al @500), e questo va scritto accanto al guadagno
- [x] la sovrapposizione liste/banco è verificata e dichiarata (87,1% dei titoli, zero a livello di persone)
- [x] il componente è passato da una prova di dose: 0 / 0,5 / 1 / 2, con l'ottimo a **0,5**

## Limiti dichiarati

1. **Il componente copre il 14,8% del catalogo** e metà dei titoli coperti non ha vicini: un guadagno misurato su tutto il banco poggia su una minoranza di titoli.
2. **La verifica A misura la similarità CF sulle coppie delle liste**: dice che le liste predicono la **co-occorrenza**, non che siano *buone*. Una lista di film famosi predice co-occorrenza perché i film famosi si guardano tutti. **Il controllo appaiato per popolarità non è stato fatto su questo componente** (è stato fatto a caso): è la lacuna più seria del ticket.
3. **Il peso 0,5 è un punto di una griglia di quattro.** Il vero ottimo è fra 0,4 e 0,7 e non è stato cercato.
4. **La dose è relativa a CF**: cambiando la ricetta (per esempio aggiungendo la struttura del ticket 16), il peso ottimo cambia.
5. **Solo il catalogo film**: le liste contengono anche serie (il campo `type` c'è) e non sono state separate.
