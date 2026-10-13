# 67 — Ritaratura di `k` e `beta` sulla ricetta minima

**Il mandato**: `k` e `beta` erano gli ottimi di un grafo a **sei componenti**. Ora la ricetta è minima (`CF` da solo / `CFst`+`B`), quindi le condizioni sono cambiate: con un solo componente `k` controlla **tutta** la densità del grafo, e senza `Kc` (6,5 milioni di archi) il grafo è più rado.

Script: `k-beta-minima.py` (3.634 s). Banco Trakt a 1.063 utenti, MovieLens a 300 (il riferimento è interno all'esecuzione).

---

## 1. Lo sweep di `k` (con beta = 0,50)

| k | FILM @10 | FILM @100 | FILM @500 | PROD @100 | PROD @500 | PROD @2000 | SERIE @10 | SERIE @100 | SERIE @500 |
|---|---|---|---|---|---|---|---|---|---|
| 15 | 4,21 | 19,84 | 41,06 | 28,03 | 58,59 | 87,04 | **3,12** | 17,33 | 43,39 |
| **30** | **4,23** | **20,15** | 42,95 | **28,82** | 60,00 | 87,68 | 3,05 | 17,95 | 45,32 |
| 60 *(com'era)* | 4,09 | 19,73 | **43,39** | 28,72 | **60,47** | **87,78** | 2,95 | **18,08** | **46,12** |
| 120 | 3,96 | 19,15 | 42,72 | 28,41 | 60,30 | 87,32 | 2,91 | 18,11 | 46,34 |
| 240 | 3,88 | 18,59 | 41,60 | 27,49 | 59,14 | 86,33 | 2,87 | 17,89 | 46,01 |

**`k`=30 è il migliore sulla testa** (film @10 e @100, prodotto @100) e **`k`=60 resta migliore sulla coda** (@500) e per le serie al @100. **Oltre 60 peggiora ovunque**: allargando i vicini si includono simili sempre più deboli, e la camminata si diluisce.

## 2. Lo sweep di `beta` (con k = 30)

| beta | FILM @10 | FILM @100 | FILM @500 | PROD @100 | PROD @500 | PROD @2000 | SERIE @10 | SERIE @100 | SERIE @500 |
|---|---|---|---|---|---|---|---|---|---|
| **0,00** | 4,24 | 20,15 | 43,06 | 28,47 | 59,56 | 87,34 | **2,37** | **13,80** | **37,45** |
| **0,25** | **4,25** | **20,22** | **43,07** | 28,67 | 59,87 | 87,51 | **3,05** | **18,09** | **45,62** |
| 0,50 *(com'era)* | 4,23 | 20,15 | 42,95 | **28,82** | **60,00** | **87,68** | 3,05 | 17,95 | 45,32 |
| 0,75 | 4,13 | 19,82 | 42,64 | 28,93 | 60,25 | 87,78 | 3,03 | 17,50 | 44,39 |
| 1,00 | 4,03 | 19,38 | 42,15 | 28,99 | 60,36 | 87,82 | 2,95 | 16,78 | 43,02 |

**La cosa grossa: senza correzione dell'hub (`beta`=0) il catalogo serie crolla.** @10 da 3,05% a **2,37%** (−22%), @100 da 18,09% a **13,80%** (−24%), @500 da 45,62% a **37,45%** (−18%). La correzione non è un dettaglio: **`CFst` e `B` hanno hub** (CFst ha una mediana di 81 vicini e un massimo di 498; B un massimo di 788), e senza la divisione per il grado la camminata ci si incastra.

**Sui film e sul prodotto invece `beta` conta poco**: il prodotto preferisce `beta`=1,00 (28,99 contro 28,67), i film `beta`=0,25.

## 3. La configurazione nuova

| | prima | **dopo** |
|---|---|---|
| `k` | 60 | **30** |
| `beta` | 0,50 | **0,25** *(o 0,50 se conta il prodotto)* |

**Cosa si guadagna e cosa si perde:**

| | FILM @10 | FILM @100 | FILM @500 | PROD @100 | PROD @500 | SERIE @10 | SERIE @100 | SERIE @500 |
|---|---|---|---|---|---|---|---|---|
| prima (`k`=60, `beta`=0,50) | 4,09 | 19,73 | **43,39** | 28,72 | **60,47** | 2,95 | 18,08 | **46,12** |
| **dopo (`k`=30, `beta`=0,25)** | **4,25** | **20,22** | 43,07 | 28,67 | 59,87 | **3,05** | **18,09** | 45,62 |
| delta | **+0,16** | **+0,49** | −0,32 | −0,05 | −0,60 | **+0,10** | **+0,01** | −0,50 |

**Si guadagna sulla testa e si perde sulla coda.** E il motivo è chiaro: `k` piccolo = vicini più simili = testa migliore; `k` grande = più strade = coda migliore.

**Quindi la scelta dipende da che profondità serve al prodotto** — che è la domanda a cui non ho ancora risposta. Se il catalogo mostra i primi 50-100, `k`=30; se mostra centinaia, `k`=60.

## 4. Cosa resta dei parametri

Dopo questa ritaratura, **i parametri liberi della ricetta sono quattro**:

```
catalogo FILM    CF da solo             k-NN 30 · beta 0,25
catalogo SERIE   CFst + B (pesi uguali) k-NN 30 · beta 0,25
```

Niente curatela, niente `Kc`, niente temi, niente pesi da bilanciare. **Da ~15 parametri a 4.**

## 5. Limiti

- Il prodotto è misurato su **300 utenti** (non 500): il riferimento è interno all'esecuzione, ma i numeri assoluti non sono confrontabili con i report precedenti.
- Le differenze di **mezzo punto sono dentro il rumore** del banco. Valgono i salti: il crollo a `beta`=0 sulle serie (−4,3 punti @100) e la differenza `k`=30 contro 240 (−1,6 sui film).
- Il banco `related` **non è ancora completo** (le serie sono al 55%): quando finisce, `B` cambia e **`k`/`beta` vanno ritestati un'ultima volta**. Questa ritaratura vale per il `B` di oggi.
