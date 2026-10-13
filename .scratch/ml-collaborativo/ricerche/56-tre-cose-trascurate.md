# 56 — Le tre cose trascurate: fatte, e una ribalta il report 46

**Il mandato**: fare tutto quello che la retrospettiva (report 55) aveva trovato trascurato: lo sweep di `k` e dei pesi, la correzione dell'hub, l'audit delle foglie sullo spazio pulito.

**L'esito**: **due parametri mai ritoccati valgono +32% al @100 e +12% al @2000** sul catalogo film, con il metro esperto intatto. La correzione dell'hub è marginale e **non chiude il tetto**. E **l'audit delle foglie ribalta il report 46**: la coerenza misurata allora era coerenza di *pubblico*, non di contenuto, e le due non sono correlate (0,024).

Script: `ottimizza-1.py` (con `giro2.json`) · `verifica-finale.py` · `audit-pulito.py`.

---

## 1. La correzione dell'hub: marginale, e non chiude il tetto

Il 22,9% dei film d'oro che non entra mai nel cesto è **4,12× meno popolare** (report 55). L'ipotesi: è l'hub — un film super-popolare sta nel top-15 di migliaia di nodi e domina la camminata. La correzione principled è l'esponente di grado, `P(i→j) ∝ A_ij / d_j^β` (β=0 è quello che avevamo).

| β | catalogo film @100 | @500 | @2000 | metro curato @100 | @2000 |
|---|---|---|---|---|---|
| **0,00 (com'è ora)** | 21,93% | 49,41% | 77,99% | **26,45%** | **71,66%** |
| 0,25 | 22,27% | 50,13% | 78,44% | 25,85% | 71,26% |
| 0,50 | 22,36% | 50,41% | 78,67% | 25,95% | 70,16% |
| 0,75 | 22,30% | **50,53%** | **78,69%** | 26,05% | 70,46% |
| 1,00 | 22,11% | 50,37% | 78,44% | 26,15% | 69,76% |

**+0,4 punti al @100 e +0,7 al @2000 sul prodotto, ma −1,5 al @2000 sull'esperto.** È un lavaggio, non una cura. E soprattutto: **il tetto resta**. La correzione del grado sposta la distribuzione stazionaria della camminata ma non cambia il fatto che i film popolari sono *davvero* vicini a più cose.

**Conclusione**: il tetto del 23% non è un artefatto dell'hub, è **il prezzo della metrica** — che premia la popolarità perché le persone guardano cose popolari. Recuperare quel 23% richiederebbe di privilegiare l'impopolare, che abbasserebbe l'«azzeccato». È una scelta, non un bug. *(La correzione β=0,5 resta una scelta neutra: +0,7 sul prodotto, −1,5 sull'esperto.)*

## 2. I pesi e i k: la cosa trascurata che vale di più

Eredità dell'era contaminata: la massa non-curatela divisa **in parti uguali** (scelta di correttezza del confronto, non un ottimo) e `k=15` dal report 41.

| configurazione | k | catalogo film @10 | @100 | @500 | @2000 | curato @100 |
|---|---|---|---|---|---|---|
| **BASE (pesi uguali)** | 15 | 4,50% | 21,93% | 49,41% | 77,99% | 26,45% |
| k=30 | 30 | 4,80% | 22,94% | 52,42% | 80,98% | 25,55% |
| k=60 | 60 | 4,64% | 22,58% | 52,41% | 81,89% | 25,35% |
| **comportamento ×3** | 15 | 5,70% | 27,27% | 58,43% | 83,89% | 26,65% |
| comportamento ×5 | 30 | 5,94% | 28,56% | 61,80% | 87,49% | 26,55% |
| comportamento ×8 | 30 | 5,88% | 28,57% | 62,11% | 88,14% | 27,54% |
| **comportamento ×5** | **60** | **5,82%** | **28,73%** | **62,48%** | **88,49%** | 26,45% |
| metadati ×3 | 15 | 3,09% | 15,61% | 39,51% | 71,82% | 25,25% |
| temi ×3 | 15 | 3,55% | 17,96% | 43,45% | 72,96% | 27,25% |

**Il peso del comportamento è la leva.** Portarlo da 1 a 3-5 vale **+5-7 punti al @100 e +8-10 al @2000**, e il metro esperto **non peggiora** (26,45 → 26,55). I metadati ×3 e i temi ×3 *peggiorano*: confermano che sono i componenti deboli.

### La verifica (1.000 utenti che non hanno partecipato a nessuna scelta)

| | @10 | @100 | @500 | @2000 | curato @100 |
|---|---|---|---|---|---|
| BASE (pesi uguali, k=15, β=0) | 4,62% | 22,45% | 50,65% | 78,11% | 26,45% |
| **SCELTO (CF ×5, k=60, β=0,5)** | **5,99%** | **29,61%** | **63,35%** | **87,86%** | **26,45%** |
| SCELTO per il curato (curatela 0,80, k=30) | 5,82% | 28,47% | 61,32% | 86,21% | **29,14%** |

**Sul prodotto: +30% al @10, +32% al @100, +25% al @500, +12% al @2000. Sull'esperto: identico.**

E non è adattamento: la calibrazione dava 28,73% al @100, la verifica **29,61%** — la verifica è *migliore*. Due parametri, scelti su metà utenti, reggono sull'altra metà.

**C'è un compromesso vero sulla curatela**: 0,80 protegge il giudizio esperto (29,14% contro 26,45) al prezzo di 1,1 punti sul prodotto. Da decidere, non da dedurre.

## 3. L'audit delle foglie: il report 46 va ribaltato

L'audit era stato fatto in `Pc` — che il report 48 ha dimostrato essere comportamento travestito. Rifatto nei tre spazi:

| spazio | mediana | 10°ile | sotto 0,20 | sotto 0,30 |
|---|---|---|---|---|
| **`Pc` — CONTAMINATO (report 46)** | **0,744** | 0,333 | **3,2%** | 8,0% |
| **METADATI PULITI** | **0,297** | 0,105 | **28,6%** | 50,7% |
| COMPORTAMENTO (CF) | 0,107 | −0,058 | 71,6% | 85,7% |

**Correlazione `Pc` contro metadati puri: 0,024.** Cioè: **le due coerenze non hanno niente a che vedere.** La 0,744 del report 46 era **coerenza di pubblico**, non di contenuto — e in quello spazio l'avevo chiamata "contenuto".

**875 foglie sono "buone" in `Pc` e lasche nei metadati; solo 54 il contrario.**

E la conseguenza che ribalta la lettura del report 46, per fascia di dimensione:

| fascia | foglie | `Pc` (report 46) | **metadati puliti** | comportamento |
|---|---|---|---|---|
| 2-5 | 165 | 0,726 | 0,296 | 0,047 |
| 6-10 | 594 | 0,764 | 0,322 | 0,097 |
| 11-20 | 1.264 | 0,767 | 0,294 | 0,123 |
| 21-40 | 1.051 | 0,735 | 0,285 | 0,116 |
| **41-80** | 124 | 0,458 | **0,336** | 0,032 |
| **81-150** | 33 | 0,436 | **0,305** | 0,005 |
| **151+** | 7 | 0,430 | **0,305** | 0,040 |

**Nei metadati puri le foglie GRANDI sono le più coerenti** (0,336 contro 0,285-0,296 delle piccole): l'esatto contrario del report 46, dove le grandi erano le più lasche (0,43-0,46 contro 0,73-0,77).

**Cosa vuol dire**: le foglie non raggruppano per contenuto, **raggruppano per pubblico** — e per un raccomandatore è la cosa giusta (è il pubblico che conta, non il genere). Ma va detto per quello che è: il report 46 diceva "le foglie sono buone di contenuto e non migliorabili spezzandole", e la prima metà era **falsa**: sono buone di comportamento, e di contenuto sono lasche (28,6% sotto 0,20). La seconda metà (non migliorabili spezzandole) resta valida perché era misurata sul grafo, non su `Pc`.

## 4. La ricetta aggiornata

```
CF    comportamento dichiarato (utenti disgiunti)      peso 5    k-NN 60
CFst  pubblico previsto (tutte le serie)               peso 1    k-NN 60
Kc    metadati puliti                                  peso 1    k-NN 60
B     co-visione Trakt                                 peso 1    k-NN 60
T     temi                                             peso 1    k-NN 60
K     curatela                                         0,60  (0,80 se conta il giudizio esperto)
correzione del grado                                   beta 0,50
```

**Catalogo film, verifica: @10 5,99% · @100 29,61% · @500 63,35% · @2000 87,86%.**
**Metro curato: @10 11,18% · @100 26,45% · @500 50,00% · @2000 70,26%.**

Contro la ricetta precedente (report 49-54): **+32% al @100, +12% al @2000, esperto invariato.** Con **due parametri** — il peso del comportamento e `k` — che nessuno aveva mai ritoccato dopo il cambio di grafo.

## 5. Cosa resta aperto, aggiornato

1. **Il tetto del 23%** è il prezzo della metrica, non un difetto: recuperarlo abbasserebbe l'azzeccato. Decisione di prodotto.
2. **`k` per componente**: ho misurato un `k` uguale per tutti. Il comportamento potrebbe volerne uno diverso dai metadati — spazio non esplorato.
3. **L'ordinamento del catalogo serie** — ancora il pezzo mancante più grosso.
4. **Lo split temporale** su Trakt.
5. **L'audit delle foglie va rifatto anche per la *portata*** (report 45): quella misura usava la co-occorrenza MovieLens, che è indipendente da `Pc`, quindi dovrebbe reggere — ma non l'ho riverificata.
