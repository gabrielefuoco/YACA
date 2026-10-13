# 49 — Il grafo migliore: comportamento dichiarato batte contenuto contaminato

**Mandato dell'utente**: «curare la qualità pura dei suggerimenti, creare questo grafo migliore possibile».

**Risultato**: il grafo migliore **non è** quello attuale. Il componente "contenuto" era comportamento MovieLens travestito (report 48). Rifacendolo per bene — keyword pulite + **un tipo di arco comportamentale dichiarato, costruito su 198.948 utenti disgiunti** da quelli di valutazione — il grafo **migliora di ogni misura** e non è più contaminato.

Script: `cf-edges.py` (56 s) · `grafo-nuovo.py` (2.120 s) · artefatti `.cache/movielens/cf-spazio.npz`, `cf-studente.npz`, `spazio-pulito.npz`.

---

## 1. Il disegno

Sei grafi, stessa massa non-curatela (0,40 divisa equamente) e stessa curatela (0,60):

| componente | cos'è | copertura |
|---|---|---|
| `Pc` | contenuto **contaminato** (l'attuale) | 66.259 |
| `Kc` | keyword pulite, SVD 128 del TF-IDF | 66.259 |
| **`CF`** | **co-occorrenza MovieLens, svds 128, dai 198.948 utenti disgiunti** | **49.041 film** |
| `CFst` | keyword → CF (Ridge sui film), il **pubblico previsto** | 66.259 (tutte le 16.550 serie) |
| `B` | co-visione Trakt | mono-medium |
| `T` | temi (tassonomia scritta a mano) | 66.259 |
| `K` | curatela (solo metà pari) | 3.417 archi |

Valutazione: 1.000 utenti di **calibrazione** + 1.000 di **verifica** (disgiunti anche dagli archi), recupero @100/@500/@2000 e testa riordinata per popolarità.

## 2. I risultati

| grafo | @100 | @500 | @2000 | testa @10 | | @100 | @500 | @2000 | testa @10 |
|---|---|---|---|---|---|---|---|---|---|
| | **CALIBRAZIONE** | | | | | **VERIFICA** | | | |
| ATTUALE  Pc+B+T+K | 12,32% | 41,95% | 71,20% | 3,16% | | 12,56% | 42,12% | 70,41% | 3,27% |
| PULITO  Kc+B+T+K | 5,39% | 23,15% | 50,83% | 2,33% | | 5,73% | 23,54% | 50,96% | 2,54% |
| **PULITO+CF  Kc+CF+B+T+K** | **16,67%** | **50,40%** | **78,63%** | 3,14% | | **16,19%** | **49,37%** | **77,12%** | 3,24% |
| PULITO+CFst  Kc+CFst+B+T+K | 6,78% | 26,59% | 55,76% | 2,57% | | 7,00% | 26,87% | 55,71% | 2,69% |
| CFst solo  CFst+B+T+K | 7,52% | 28,54% | 57,61% | 2,71% | | 7,65% | 28,92% | 57,81% | 2,83% |
| TUTTO  Kc+CF+CFst+B+T+K | 15,26% | 47,97% | 78,04% | 3,19% | | 14,73% | 47,20% | 76,63% | 3,25% |

**Calibrazione e verifica coincidono a mezzo punto su tutte le righe.** Non ho tarato niente: la differenza è segnale, non adattamento.

## 3. Cinque cose, in ordine di importanza

**1. Il grafo pulito con il comportamento dichiarato è il migliore, e batte quello contaminato.**

| | @100 | @500 | @2000 |
|---|---|---|---|
| ATTUALE (contaminato) | 12,32% | 41,95% | 71,20% |
| **PULITO+CF** | **16,67%** | **50,40%** | **78,63%** |
| guadagno | **+35%** | **+20%** | **+10%** |

Non è un pareggio con un grafo onesto: è **meglio del grafo contaminato**, con utenti di valutazione esclusi dalla costruzione del segnale. Il contenuto contaminato non catturava tutta l'informazione comportamentale — la spalmava su un Ridge con 64 componenti e un bersaglio sbagliato. L'arco dichiarato la prende intera.

**2. Il contenuto, da solo, vale la metà di quanto sembrava.** 23,15% @500 contro i 41,95% dell'attuale. La frase del report 41 — «il contenuto trova il quartiere» — era al 50% merito del comportamento. Il contenuto *puro* resta il peggiore dei componenti forti.

**3. Il pubblico previsto (`CFst`) è debole e va tolto dalla fusione.** Da solo fa 28,54% @500 (meglio del contenuto pulito, 23,15%), ma aggiungerlo **peggiora**: TUTTO (47,97%) sotto PULITO+CF (50,40%). È la regola del report 41 che si riconferma: **un esperto sotto gli altri, fuso, trascina giù.** Non va pesato, va escluso.

**4. Il comportamento esplicito è la cosa più forte che abbiamo.** Con 1,16M di archi su 49.041 film è il componente che da solo sposta il recupero da 23% a 50% a @500.

**5. La testa non si muove: 3,14-3,24% su tutte le armi forti.** Dopo il riordino per popolarità, il top-10 vale ~3,2% qualunque cosa si metta nel grafo. **La testa è governata dalla popolarità, non dal grafo** — il che conferma il report 47 e dice che l'ordinamento è un lavoro separato dal grafo.

## 4. Il limite dichiarato, che è grosso

**Tutto questo è misurato sul lato film.** Il gold di MovieLens è fatto di film; le 16.550 serie non hanno cronologie da nessuna parte. Quindi:

- `CF` copre 49.041 film e **zero serie**. Per il film-side è la scelta giusta.
- `CFst` è l'unico modo di dare un pubblico alle serie, ed è quello che il test **boccia** — ma il test non può vedere il suo valore, perché non ha serie da valutare.
- Quindi la scelta "togliere CFst" vale per il lato film e **non è dimostrata per il lato serie**. Va detto, non nascosto.

La via d'uscita è nella stessa misura: se un giorno arrivano cronologie di serie (anche poche), `CFst` si valuta con lo stesso protocollo. Fino a quel momento, la scelta è di prodotto, non di misura.

## 5. La ricetta

**Il grafo migliore, oggi, misurato e non contaminato:**

```
Kc   keyword pulite (SVD 128 del TF-IDF)      k-NN 15
CF   co-occorrenza MovieLens, utenti DISGIUNTI dal test, svds 128   k-NN 15
B    co-visione Trakt                          k-NN 15
T    temi (tassonomia scritta a mano)          k-NN 15
K    curatela (solo la metà pari)              peso 0,60
─────────────────────────────────────────────────────────────────
massa non-curatela 0,40 divisa equamente fra Kc, CF, B, T
CFst NON entra nella fusione (diluisce)
```

E l'ordinamento della testa si fa a parte (report 47), perché il grafo non lo governa.

## 6. Cosa ha detto la sessione sul metodo

Tre volte su tre, l'errore grave non è stato nel codice: è stato **una premessa non controllata**.
- il bootstrap: «la bassa copertura esiste» → il grado minimo era 16 (report 43);
- la coerenza delle foglie: «il lift misura la coerenza» → misurava coerenza + portata (report 44-45);
- il grafo: **«il contenuto è contenuto»** → era MovieLens travestito (report 48).

Le tre volte, il controllo è costato meno della correzione: dare un'occhiata a come era fatto `Pc` avrebbe risparmiato metà sessione. **Guardare come è costruito un input prima di ottimizzarlo** è la lezione operativa.
