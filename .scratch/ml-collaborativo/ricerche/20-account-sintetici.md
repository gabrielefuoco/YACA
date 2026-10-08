
# 20 — Gli account sintetici: il quadro realistico (e le conclusioni che cambiano)

**Data**: 08/10/2026 · `build-testset-synth.py` → `testset-synth.json` (300 account) · `export-synth-candidates.py` → 80 trial · banco in parallelo

## L'instrumento (costruito perché non ci sono utenti veri)

| | |
|---|---|
| account | **300** da MovieLens (≥60 titoli piaciuti nel catalogo **e** nel grafo) |
| **split** | **temporale** — i titoli *vecchi* = cronologia, i *nuovi* = verità (prima volta che usiamo i timestamp) |
| cronologia | **mediana 76 titoli** (min 36, max 120) — non 3 |
| verità | mediana 52 titoli |
| stratificazione | 150 dal *fondo* (popolarità mediana 402) + 150 dal *resto* (7.540) |
| **limite dichiarato** | MovieLens è **solo film**: gli account sintetici non coprono le serie |

## I numeri (80 trial: 40 fondo + 40 resto)

| sorgente | candidati | @50 | @200 | popolarità | **posizione collab.** |
|---|---|---|---|---|---|
| **graph 1 hop** | 993 | **5,1%** | **14,8%** | 6,4% | 4,0% |
| graph 2 hop | 1.174 | 3,9% | 12,5% | 5,2% | 3,3% |
| cluster+vicini | 2.963 | 3,3% | 10,1% | 4,4% | **4,3%** |
| **POOL VERO (fetchSmartAndPool)** | 2.567 | 2,7% | 8,8% | 3,9% | 3,6% |
| caso = \|2 hop\| dal pool | 1.200 | 2,5% | 7,4% | 3,4% | 3,1% |
| pool proxy | 31.758 | 1,8% | 7,2% | 4,3% | 3,7% |

| strato | sorgente | candidati | @50 | @200 | popolarità |
|---|---|---|---|---|---|
| **fondo** | graph 2 hop | 1.187 | **1,8%** | 5,9% | 1,9% |
| fondo | caso | 1.200 | 1,2% | 3,9% | 0,5% |
| fondo | POOL VERO | 3.469 | 1,1% | 4,4% | 0,5% |
| **resto** | graph 2 hop | 1.152 | **6,0%** | **19,2%** | **8,5%** |
| resto | caso | 1.200 | 3,7% | 10,9% | 6,2% |
| resto | POOL VERO | 1.438 | 4,4% | 13,2% | 7,4% |

## Le conclusioni che cambiano (con profili realistici)

1. **Il vantaggio del grafo sul pool si riduce molto**: da 2,4× @50 (caso freddo) a **1,4-1,9×**. E il
   *caso* (campione dal pool vero) sale a 2,5% — **con profili ricchi il pool di produzione è già
   ben mirato**: l'imbuto attuale non è rotto come sembrava col profilo a 3 semi.
2. **Il 1 hop diventa il braccio migliore** (5,1% / 14,8%), non il 2 hop. Con 76 titoli in cronologia,
   il vicinato immediato è già ampio (993 candidati) e preciso: il 2 hop allarga e peggiora.
3. **La popolarità batte ancora lo scorer** (6,4% contro 5,1% sul 1 hop; 8,5% contro 6,0% sul *resto*)
   e **pareggia sulla nicchia** (1,9% contro 1,8%). Il difetto del ranker **si conferma su uno strumento
   realistico**, non è un artefatto del caso freddo.
4. **Il matcher collaborativo non è morto**: con profili da 76 titoli passa da 0,0% a **3,3-4,3%** (e sul
   braccio cluster **batte lo scorer**: 4,3% contro 3,3%). Resta sotto lo scorer sul 1-2 hop. La sua
   sconfitta precedente era **della povertà del profilo**, non dell'idea.
5. **La nicchia è debole per tutti**: 1,1-1,8% @50 su qualunque sorgente. Il "fondo" resta il problema
   aperto — coerente con la stabilità del bersaglio (0,270) e con la copertura del teacher.

## L'errore di questo giro (per il catalogo)

`run-bench.sh` ha il test set congelato come **default** e io ho passato la variabile d'ambiente invece
dell'argomento: il primo run ha misurato il test set congelato credendo di misurare gli account sintetici.
**Numero identico al decimale** al run precedente → ha validato la riproducibilità del banco (bene) e mi
ha fatto capire l'errore (l'invocazione giusta è `run-bench.sh 6 graph-candidates-synth.json`).

## Cosa significa per il progetto

**Le misure di prodotto precedenti erano artefatti dello strumento.** Il "2,4× sul pool" valeva per
profili a 3 semi (utente nuovo); con profili realistici vale 1,4-1,9×. E il ranker — il difetto che
tocca l'utente — **si conferma** su 300 account costruiti con split temporale: la popolarità batte il
nostro ordinamento, e sulla fascia mainstream lo batte di 1,4×.

**Da qui in avanti**: gli account sintetici sono lo strumento di prodotto (film). Le serie restano
scoperte da entrambi gli strumenti (MovieLens è film-only; l'account reale ha 20 titoli per contesto).
