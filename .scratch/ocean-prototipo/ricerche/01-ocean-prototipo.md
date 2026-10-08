# 01 — OCEAN a 5 assi: cosa succede se lo si integra (misurato)

**Data**: 08/10/2026 · **Tipo**: prototipo, nessuna modifica a `src/` · **Mappa**: [../map.md](../map.md)
**Banco**: `face-validity.js`, `sim-coldstart.js`, `sim-neighbors.js` (una riga l'uno, offline, parquet + Atlas in sola lettura)

---

## 1. Come è costruito l'OCEAN del prototipo (e perché così)

L'OCEAN vero è un modello della **persona** (Costa & McCrae). Per rispondere alla domanda che conta —
«una rappresentazione densa a 5 dimensioni generalizza meglio quando i segnali sono pochi?» — serve
una proiezione dei **titoli** sui 5 assi. Qui la si costruisce dai **70 nodi L4 del grafo** (quelli con
`ui_name` italiano, già scritti a mano) più i generi: `ocean-core.js` contiene la matrice 70×5, leggibile
e correggibile a mano.

Questo significa che l'OCEAN del prototipo **deriva dagli stessi dati** del vettore sparso. È una
scelta deliberata: misura la **forma** (5 numeri densi) e non la provenienza (annotazione psicometrica
vera). Se nemmeno la forma vince, la provenienza va valutata per quello che aggiunge, non per fede.

I 5 assi, operazionalizzati sul contenuto:

| asse | cosa misura nel titolo | negativo |
|---|---|---|
| **O** Apertura | arte, idee, scienza, mondi e culture altri, spiritualità | comfort, formula |
| **C** Coscienziosità | struttura, dovere, metodo, regole, lavoro, ricostruzione storica | caos, sregolatezza |
| **E** Estroversione | azione, festa, folla, avventura, performance, velocità | solitudine, lentezza |
| **A** Amicalità | famiglia, amicizia, amore, cura, animali, comunità | crudeltà, vendetta, cinismo |
| **N** Nevroticismo | ansia, trauma, lutto, malattia mentale, dipendenza, orrore | comfort, leggerezza |

## 2. Test 1 — faccia valida: gli assi dicono qualcosa

| film | O | C | E | A | N | tinte forti |
|---|---|---|---|---|---|---|
| 2001: Odissea nello spazio | 0,71 | 0,29 | 0,38 | 0,00 | −0,04 | O+ E+ C+ |
| Hereditary | 0,12 | −0,18 | 0,07 | −0,50 | **0,83** | N+ A− |
| Il silenzio degli innocenti | 0,15 | 0,00 | 0,11 | −0,49 | **0,68** | N+ A− |
| John Wick | 0,17 | 0,08 | 0,33 | −0,17 | 0,56 | N+ E+ |
| Oppenheimer | 0,40 | **0,46** | 0,37 | −0,20 | 0,42 | C+ N+ |
| Mad Max: Fury Road | 0,54 | 0,15 | 0,48 | −0,15 | 0,30 | O+ E+ |
| Toy Story | 0,39 | 0,19 | 0,31 | **0,43** | −0,02 | A+ O+ |
| Inside Out | 0,41 | 0,18 | 0,16 | **0,48** | 0,07 | A+ O+ |
| Amélie | 0,31 | 0,25 | 0,28 | 0,34 | 0,18 | A+ O+ |
| Fast & Furious 9 | 0,34 | 0,32 | **0,48** | −0,08 | 0,08 | E+ O+ |
| Fight Club | 0,41 | 0,12 | 0,18 | 0,12 | 0,34 | O+ N+ |
| Il padrino | 0,30 | 0,16 | 0,25 | −0,11 | 0,61 | N+ O+ |

**Verdetto**: sì, a faccia valida funzionano — e sono anche *leggibili*. Copertura: **19.140/19.141
titoli (100%)** hanno un profilo, perché i generi danno comunque un segnale.

Dispersione sul catalogo (dev.std): O 0,19 · C 0,18 · E 0,19 · **A 0,31 · N 0,34**. Gli assi con più
carattere sono Amicalità e Nevroticismo; Apertura, Coscienziosità ed Estroversione sono più compressi.

## 3. Test 2 — la proiezione non conserva la struttura

| misura | valore |
|---|---|
| Spearman(coseno OCEAN, coseno sparso) su 4.996 coppie | **0,31** |
| coseno medio OCEAN fra due titoli qualsiasi | **0,63** |
| coseno medio del vettore sparso fra due titoli qualsiasi | **0,03** |

Il vettore sparso dice: due titoli a caso sono quasi ortogonali (0,03), quindi **quando due titoli si
somigliano lo dice forte**. La proiezione a 5 assi dice: due titoli a caso sono già simili al 63% — e
siccome tutti stanno lì, il margine fra "uguale" e "diverso" si assottiglia fino a sparire. Questa è la
causa meccanica di tutto il resto.

## 4. Test 3 — cold start, leave-out sulla storia **reale**

Metodo: dai 5 profili reali (Atlas, sola lettura) si nasconde il grosso della cronologia, si mostrano
*k* titoli al modello, e lo si fa ordinare un pool di ~2.000 titoli (i nascosti + esca popolare).
Metrica: quanti dei titoli **nascosti** finiscono nella top-50 / top-200. Random atteso: 2,5% / 10,0%.
120 prove (6 estrazioni casuali × 5 profili × 4 livelli di k).

| semi | sparso @50 | OCEAN @50 | OCEAN std @50 | miscela std @50 | sparso @200 | OCEAN @200 | OCEAN std @200 | miscela std @200 |
|---|---|---|---|---|---|---|---|---|
| 1 | **6,4%** | 3,3% | 3,7% | 5,7% | **21,7%** | 14,6% | 14,4% | 16,8% |
| 3 | **9,2%** | 5,3% | 6,1% | 8,2% | **31,5%** | 16,3% | 17,7% | 24,2% |
| 5 | **8,2%** | 4,8% | 5,3% | 8,9% | **36,0%** | 20,7% | 21,0% | 29,4% |
| 10 | **10,2%** | 4,0% | 8,0% | 10,0% | **46,0%** | 16,9% | 24,4% | 35,2% |

Tre cose da leggere:

1. **Il vettore sparso vince a tutti i livelli**, anche a k=1 — dove l'intuizione dice che un denso
   dovrebbe generalizzare meglio. Non succede.
2. **Standardizzare gli assi aiuta OCEAN** (a k=10: 4,0% → 8,0% @50), a conferma che il problema è la
   scala compressa e non il lessico. Ma non basta a sorpassare.
3. **La miscela non aggiunge**: a k=1 e 3 è uguale allo sparso da solo, a k=5 e 10 è peggio. Cioè:
   l'informazione dei 5 assi è **già contenuta** nel vettore sparso, diluita.

## 5. Test 4 — i vicini, che si giudicano a occhio

**Hereditary — O 0,12 · C −0,18 · E 0,07 · A −0,50 · N 0,83**

- *vettore sparso*: Babadook, Midsommar, Rosemary's Baby, L'esorcista, Angel Heart, Il segnato
- *OCEAN (assi standardizzati)*: Halloween, Radio Killer, Week-end di terrore, Il ritorno dei morti viventi 3,
  Ring, Terrifier — **tutti a 1,00 di somiglianza**

**Mad Max: Fury Road — O 0,54 · E 0,48 · N 0,30**

- *vettore sparso*: Anno 2670, Contagious, Escape Plan 3, Resident Evil: Apocalypse, The Running Man
- *OCEAN*: Spider-Man, The One, Cyborg, Starship Troopers 2, Paycheck, Dredd e — **Sister Act**

Il secondo elenco è la prova più chiara: quando tutto è a 0,96-1,00, l'ordine non significa più niente.

## 6. Le tre conclusioni

1. **Un OCEAN derivato dai dati esistenti non va integrato**: perde su recall, non aggiunge in miscela e
   azzera la capacità di distinguere i titoli. È una proiezione *lossy* di informazione che il profilo
   possiede già intera.
2. **La domanda su OCEAN cambia forma**: non è «quali 5 assi?» ma «cosa porta un denso che le keyword
   non hanno?». Annotazioni LLM o co-visione porterebbero informazione nuova — ma con 5 dimensioni il
   collo di bottiglia resta, quindi la dimensione va decisa insieme alla provenienza.
3. **Il valore degli assi è nel racconto, non nell'ordine.** Test 1 dice che gli assi sono leggibili e
   plausibili; test 3 e 4 dicono che non sanno ordinare. YACA ha già **201 assi nominati** in italiano
   (`ui_name` su 131 nodi L3 e 70 L4) che nessuno legge: la stessa lezione, dal lato opposto.

## 7. Come si riproduce

```bash
node .scratch/ocean-prototipo/face-validity.js    # faccia valida, copertura, fedeltà della proiezione
node .scratch/ocean-prototipo/sim-coldstart.js    # cold start leave-out su storia reale (Atlas, sola lettura)
node .scratch/ocean-prototipo/sim-neighbors.js    # i vicini a occhio, sparso vs OCEAN
```

Nota tecnica: il driver DuckDB di questo repo **muore su una `WHERE` con `vote_count` (BIGINT)** letta da
parquet — i filtri numerici si fanno in JS dopo la lettura.
