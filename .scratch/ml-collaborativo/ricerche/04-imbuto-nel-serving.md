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
