# Mappa: OCEAN e i modelli densi — prototipo (mai in produzione)

**Aperta e chiusa**: 08/10/2026 · **Natura**: prototipo usa-e-getta, **nessuna modifica a `src/`**
**Report**: [ricerche/01-ocean-prototipo.md](ricerche/01-ocean-prototipo.md) · **Codice**: `ocean-core.js`, `face-validity.js`, `sim-coldstart.js`, `sim-neighbors.js`

## Destination

Una risposta con i numeri a: **i 5 pilastri OCEAN possono entrare in YACA e migliorare i
suggerimenti?** In particolare sul cold start, dove il vettore sparso soffre di più.

La domanda non è «OCEAN è bello?» ma: **una rappresentazione densa a 5 dimensioni generalizza meglio
del vettore sparso quando i segnali sono pochi?** Se sì, vale la pena pagare per una vera annotazione
psicometrica dei titoli; se no, nessuna annotazione serve.

## Esito — in una riga

**No.** La proiezione a 5 assi *perde* contro il vettore sparso a ogni livello di segnale (1, 3, 5, 10
titoli), sia grezza sia standardizzata, e la miscela 50/50 non aggiunge mai niente. Il motivo è
strutturale e si vede a occhio: **in 5 dimensioni tutto assomiglia a tutto** (coseno medio fra due
titoli qualsiasi: **0,63** contro **0,03** dello sparso), quindi la classifica perde il potere di
distinguere. Da *Mad Max* si arriva a *Sister Act*.

## Cosa è stato misurato (4 test, tutti riproducibili)

| Test | Cosa ha detto |
|---|---|
| **1. Faccia valida** (`face-validity.js`) | Gli assi *dicono qualcosa*: 2001 → O 0,71; Hereditary → N 0,83 e A −0,50; Toy Story → A 0,43; Oppenheimer → C 0,46; John Wick → N 0,56 E 0,33. Copertura: **100%** del catalogo (19.140/19.141 titoli). |
| **2. Fedeltà della proiezione** | Spearman fra coseno OCEAN e coseno sparso: **0,31**. Coseno medio OCEAN **0,63**, sparso **0,03**. La proiezione non conserva la struttura: la sostituisce con una similarità alta e piatta. |
| **3. Cold start vero** (`sim-coldstart.js`) | Leave-out sulla **storia reale** (5 profili, 120 prove): recupero della cronologia nascosta da un pool di 2.000 titoli. Caso casuale 2,5% @50. |
| **4. Vicini a occhio** (`sim-neighbors.js`) | Hereditary → sparso: *Babadook, Midsommar, Rosemary's Baby*. OCEAN: *Halloween, Terrifier, The Babysitters*, tutti a 1,00. Mad Max → sparso: *Anno 2670, Escape from…*; OCEAN: *Spider-Man, Starship Troopers 2, **Sister Act***. |

### Test 3, i numeri

| semi | sparso @50 | OCEAN @50 | OCEAN std @50 | miscela std @50 | sparso @200 | OCEAN @200 | OCEAN std @200 | miscela std @200 |
|---|---|---|---|---|---|---|---|---|
| 1 | **6,4%** | 3,3% | 3,7% | 5,7% | **21,7%** | 14,6% | 14,4% | 16,8% |
| 3 | **9,2%** | 5,3% | 6,1% | 8,2% | **31,5%** | 16,3% | 17,7% | 24,2% |
| 5 | **8,2%** | 4,8% | 5,3% | 8,9% | **36,0%** | 20,7% | 21,0% | 29,4% |
| 10 | **10,2%** | 4,0% | 8,0% | 10,0% | **46,0%** | 16,9% | 24,4% | 35,2% |

## Cosa questo NON prova

- **OCEAN non è stato provato con annotazioni vere.** Qui i 5 assi sono la proiezione dei 70 nodi L4
  del grafo (quelli con `ui_name`), quindi derivano dagli **stessi dati** del vettore sparso. Un
  OCEAN annotato da un LLM su ogni titolo (la via di Ocean4Rec) porterebbe informazione *nuova*: questo
  prototipo non lo refuta — ma nemmeno lo incoraggia, perché il collo di bottiglia misurato è il
  **numero di dimensioni**, non la provenienza dei valori.
- **Non prova che nessuno spazio denso serva.** Prova che uno spazio denso di **5 dimensioni derivato
  dai dati esistenti** non batte il vettore sparso. Un denso che vincesse dovrebbe portare informazione
  che le keyword non hanno (co-visione, embeddings addestrati, annotazione semantica) **e** avere
  abbastanza dimensioni per discriminare.
- La cronologia reale è di ~20 titoli per profilo: i numeri sono rumorosi. Ma la direzione è la stessa a
  tutti e quattro i livelli di segnale, e il test 4 la mostra a occhio.

## Decisioni

| # | Decisione | Alternativa scartata, perché |
|---|---|---|
| D1 | **Nessuna integrazione di un OCEAN derivato dai dati esistenti** | Perde su recall a ogni livello di freddo (test 3) e distrugge la discriminazione (test 2, 4): è una proiezione lossy di informazione che il profilo ha già intera |
| D2 | **Un denso può entrare solo se porta informazione nuova** (co-visione, embedding addestrati, annotazione LLM) **e** con ranghi adeguati | Riproiettare le stesse keyword su 5 assi è lavoro che peggiora il risultato |
| D3 | **Gli assi servono per SPIEGARE, non per ordinare** | Test 1: gli assi sono leggibili e a faccia valida («Hereditary: N 0,83, A −0,50») mentre la classifica è piatta. È il complemento della scoperta `ui_name` (131 L3 + 70 L4 già nominati e mai letti): il valore è nel racconto |
| D4 | **Il prototipo resta fuori da `src/`** e non viene promosso | Era una domanda, non una funzionalità: la risposta sta nel report, il codice serve a rifare le misure |

## Fuori ambito

- Annotazione OCEAN dei titoli con un LLM e misura della *sua* capacità di ordinare (l'unico test che
  potrebbe ancora dare ragione a OCEAN — costa un giro sull'intero catalogo).
- Altre dimensioni (10, 20, 50 assi) e altri spazi densi (embedding item-side): qui si è misurato il
  caso da 5, che è quello proposto.
- Il racconto del profilo a partire da L3/L4 (`ui_name`): è presentazione, ha una sua mappa.
