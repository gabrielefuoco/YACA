# 04 — Il grafo davanti allo scorer: il test che decide (08/10/2026)

**Mappa**: [../map.md](../map.md) · **Banco**: `export-graph-candidates.py` + `bench-graph-funnel.js`

---

## Il disegno

Stessi semi, stessi titoli nascosti, **stesso ranker** (lo scorer di produzione: `extractActiveDNAFromTmdbData`
→ `computeActiveDNA` → `computeFinalDNA` → `ProfileScorer._computeThematicScoreForVector`). Cambia **solo da
dove vengono i candidati**. Il controllo decisivo non è «il pool è grande», è **a parità di posti**: gli stessi
49/576/2.872 candidati riempiti a caso dal pool.

75 trial, 5 profili reali, cronologie reali (5 film + 14-16 serie per profilo).

## I numeri

| sorgente di candidati | candidati (mediana) | recall@50 | recall@200 |
|---|---|---|---|
| **grafo 2 hop** | **573** | **4,7%** | 8,0% |
| pool attuale (generi, proxy) | 17.794 | 3,3% | **8,6%** |
| grafo 1 hop | 48 | 3,2% | 3,2% |
| grafo cluster + vicini | 2.869 | 2,5% | 6,3% |
| caso = \|2 hop\| a caso dal pool | 576 | 1,3% | 2,1% |
| caso = \|cluster\| a caso dal pool | 2.872 | 1,5% | 4,7% |
| caso = \|1 hop\| a caso dal pool | 49 | 0,3% | 0,3% |

*(caso casuale sull'intero pool: 0,3% @50)*

## Cosa dice

1. **Come sorgente di candidati il grafo vale**: a parità di posti batte la selezione casuale **10× (1 hop)** e
   **3,7× (2 hop)**. La scelta dei candidati è informazione, non rumore.
2. **Il colpo grosso è l'efficienza**: il **2 hop con 573 candidati fa meglio del pool intero con 17.794** sul
   recall@50 (4,7% contro 3,3%, **+42% relativo con 31× meno candidati**). Sul @200 il pool recupera (8,6% vs
   8,0%) — normale, contiene 30 volte più roba e quindi più titoli giusti in coda.
3. **1 hop** (48 candidati) fa già il 3,2% @50, cioè il **97% del risultato del pool intero con 370 volte meno
   candidati**: è la testa della lista, densissima.
4. La variante `cluster + vicini` è la meno brillante a parità di posti (1,7× il caso): allargare a ~3.000
   candidati diluisce il vantaggio. **La finestra buona è 50-600 candidati.**

## La proposta operativa

Il grafo entra come **primo imbuto** davanti allo scorer di produzione:

```
titoli visti → 2 hop nel grafo (~600 candidati: ~575 dalla mediana)
             → scorer di produzione (DNA + gerarchia) → top-50
             (fallback: se i titoli visti non sono nel grafo — il 25% del catalogo — si usa il pool attuale)
```

Guadagno atteso: **top-50 migliore del 42% relativo** con **31 volte meno candidati** → meno query, meno
scoring, meno latenza, e una testa di lista più densa di titoli giusti.

## Limiti dichiarati

- Il «pool attuale» qui è un **proxy** (titoli che condividono un genere coi semi), non la query esatta di
  `fetchSmartAndPool`: l'ordine di grandezza è quello, il numero non è quello di produzione.
- Le cronologie reali sono piccole (19-21 titoli per profilo): i numeri sono rumorosi, anche se la direzione è
  coerente su 75 trial e su tutti e tre i livelli di budget.
- **Il 25% del catalogo non è nel grafo** (87.848 su 117.198: mancano i titoli senza keyword, che sono anche
  quelli con meno metadati). Serve il fallback, e va misurato quanto pesa.
- Il grafo è **offline**: si ricostruisce periodicamente (nuovi titoli, nuovo MovieLens), non in tempo reale.
- Non è stato toccato `src/`: la misura è fuori produzione. L'integrazione è un lavoro a sé, con i suoi test.

---

## Addendum — i buchi, cercati e trovati (08/10/2026)

### Buco 1 (grave): il mio «pool attuale» era un proxy — e il pool VERO è peggiore

Ho replicato la logica esatta di `fetchSmartAndPool`: **(uno dei top-3 generi del profilo) E (una keyword dei
cluster dei top-3 nodi L2)**, con i nodi L2 espansi a keyword dal grafo.

| sorgente | candidati | recall@50 | recall@200 |
|---|---|---|---|
| **grafo 2 hop** | 573 | **4,7%** | **8,0%** |
| **POOL VERO (fetchSmartAndPool)** | 1.604 | **1,7%** | 4,1% |
| pool proxy (generi condivisi) | 17.794 | 3,3% | 8,6% |
| caso (\|2 hop\| dal pool vero) | 381 | 1,0% | 1,6% |

**Il pool vero è più stretto del proxy e perde di più**: 1.604 candidati contro 17.794, e il suo tetto è
**1,7% @50 contro 3,3%**. La causa è l'`AND` fra genere e keyword: il vincolo sulle keyword taglia via titoli
che l'utente ha davvero guardato. Il grafo lo batte **2,8× @50 e 2× @200 con 3 volte meno candidati**.

→ **Azione indipendente dal grafo**: allargare la generazione del pool (OR invece di AND fra genere e keyword,
oppure più generi/keyword) è una correzione a costo quasi zero che vale da sola.

### Buco 2 (grave): il vantaggio del grafo è nella SELEZIONE, non nell'ordinamento

| sorgente | recall@50 con lo scorer | **recall@50 ordinando per POPOLARITÀ** | voti mediani dei candidati |
|---|---|---|---|
| graph 2 hop | 4,7% | **4,2%** | 162 |
| graph 1 hop | 3,2% | 3,2% | 258 |
| POOL VERO | 1,7% | 0,9% | 22 |
| pool proxy | 3,3% | 0,0% | 144 |

Dentro i candidati del grafo **la popolarità da sola prende 4,2 dei 4,7 punti**: lo scorer aggiunge +0,5. Il
valore del grafo è *restringere bene* (17.794 → 573 aumentando la densità di titoli giusti), non ordinare
meglio. Due conseguenze:

- **buona notizia operativa**: l'imbuto funziona anche con un ranker quasi gratis → latenza bassa;
- **cattiva notizia per la tesi «gusto»**: i vicini del grafo sono popolarità-correlati (la co-visione è
  guidata da ciò che tutti guardano) e i titoli visti da questi profili sono popolari. Il vantaggio misurabile
  è «selezione popolarità-consapevole», non «comprensione del gusto». Chi vuole il gusto deve migliorare la
  **selezione**, e il posto per farlo è il *controllo di popolarità* già impostato nel teacher (`npmi`), non
  il ranker.

### Cosa NON è un buco (verificato)

- **Il fallback per il 25% fuori dal grafo**: i titoli delle cronologie reali sono **tutti** nel grafo
  (100%: 21/21, 20/20, 19/19). Il 25% mancante è catalogo senza keyword, non titoli visti. Il fallback serve,
  ma pesa molto meno di quanto avessi scritto.
- **La separazione film/serie**: smentita (81 cluster misti su 246, coseno film↔serie ≥ film↔film).

### I buchi che restano aperti (e come si colmano)

| buco | come si misura | costo |
|---|---|---|
| **Statistica debole**: 19-21 titoli per profilo, 5 profili | usare **utenti MovieLens tenuti fuori** dalla costruzione del grafo: migliaia di utenti, hold-out dei loro voti. Il grafo si costruisce su un sottoinsieme di utenti, si valuta sul resto | alto (ricostruzione del grafo su split utenti) |
| **Stabilità ai parametri** (k=12, soglia 0,45, res 16) | rigirare il banco con k=8/20, soglia 0,35/0,55, res 8/32/64 e vedere se il vantaggio resta | medio |
| **Popolarità come confondente** del vantaggio del grafo | rifare il banco **a parità di popolarità**: candidati del grafo e del pool appaiati per fascia di voti | medio |
| **Il grafo invecchia**: MovieLens fermo a fine 2023, grafo offline | misurare la quota di catalogo 2024-2026 **senza** segnale collaborativo (i 2020s erano coperti al 36,5%): quelli dipendono dallo student, e va misurato quanto perdono | basso |
