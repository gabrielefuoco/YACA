# 13 — Il soffitto: quanto della posizione collaborativa è riproducibile

**Data**: 08/10/2026 · **Script**: `misura-soffitto.py` · 100.474 utenti per metà, due teacher indipendenti

## Il metodo

Il coseno dello student (0,500) significa qualcosa solo se si sa quanto è raggiungibile. Si spezzano
gli utenti MovieLens in **due metà indipendenti**, si costruiscono **due teacher separati**, e si misura
quanto la posizione dello stesso film è stabile fra i due. Quello che non è stabile è rumore di
campionamento degli utenti: **nessun modello basato sui metadati può prevederlo**.

I due spazi differiscono per una rotazione arbitraria: si allineano con **Procrustes** prima di misurare
(altrimenti il coseno non significa nulla). L'allineamento usa 64×64 = 4.096 parametri su 41.063 film:
ininfluente.

## I numeri

| | coseno |
|---|---|
| fra le due metà indipendenti | **0,422** (mediana 0,402) |
| **affidabilità del teacher INTERO** (Spearman-Brown: 2r/(1+r)) | **0,594** |
| **student sui metadati** | **0,500** |
| vettore medio (il banale) | 0,224 |

## Il rumore non è uniforme (la scoperta più utile)

| popolarità | film | stabilità fra le due metà |
|---|---|---|
| **poveri di voti (<100)** | 22.432 (**55%**) | **0,270** |
| medi (100-1.000) | 14.000 | 0,530 |
| **molto votati (1.000+)** | 4.631 | **0,831** |

## Le tre conseguenze

### 1. Lo student è al **75% del massimo raggiungibile**, non a metà strada

```
(0,500 − 0,224) / (0,594 − 0,224) = 75%
```

Restano **0,094 di coseno** sul tavolo, e lì dentro c'è *tutto* il lavoro di modellazione futuro. Non è
un modello scarso: è un modello che ha quasi finito il suo compito.

### 2. Il buco sui film poco votati non era colpa dello student

Lo student faceva 0,361 su quella fascia e l'avevamo attribuito al teacher. Ora è **quantificato**:
su quei film la posizione collaborativa è stabile solo a **0,270** fra due metà degli utenti. **Il
bersaglio non esiste**: non c'è niente da imparare, c'è rumore. E sono il **55% del catalogo** (22.432
film su 41.063).

**Implicazione grossa**: il grafo costruito sul teacher è *significativo solo per la metà ben votata*
del catalogo. Per l'altra metà il teacher non ha un'opinione — e servono altre fonti (TMDB, keyword,
il comportamento dell'utente stesso).

### 3. Il punteggio 0-100 si rilegge

| asse | prima | **ora** | perché |
|---|---|---|---|
| predire la posizione | 60 | **75** | è al 75% del soffitto, non al 60% di un massimo ignoto |
| struttura | 70 | 70 | invariato (0,699 contro 0,631) |
| prodotto | 35 | 35 | il ranker perde ancora contro la popolarità |
| copertura (serie) | 20 | 20 | teacher cieco, TMDB proxy debole |

**La conclusione cambia di segno**: non siamo lontani da un modello migliore — **il modello è quasi
arrivato**. Siamo lontani sugli assi che toccano l'utente: l'ordine delle liste (prodotto) e le serie
(copertura). Ogni ora spesa a migliorare lo student vale poco; ogni ora spesa sul ranker vale molto.

## Nota di metodo

Il soffitto misurato così è **conservativo**: ogni metà ha metà utenti, quindi è più rumorosa del
teacher intero — ed è per questo che si corregge con Spearman-Brown. Se il teacher intero fosse
*perfettamente* affidabile, il soffitto sarebbe 1,0 e lo student starebbe al 35%. Con la correzione,
il numero difendibile è 0,594.
