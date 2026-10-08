# 22 — Le raccomandazioni TMDB: il segnale comportamentale che copre anche le serie

**Status**: `ready-for-agent` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Da dove nasce

Dubbio dell'utente: «Leiden nel grafo originale usa anche le raccomandazioni di TMDB?». Verificato:
**no.** Il builder (`build_graph.py:20-26`) fonde **40% PPMI** (co-occorrenza delle keyword nel nostro
catalogo) e **60% semantica** delle *parole* secondo `BAAI/bge-small-en-v1.5`, con soglia 0,75 e Leiden
a res 150. Il grafo è quindi in gran parte un oggetto **linguistico**, non comportamentale: ecco perché
i suoi pesi ordinano la co-visione reale per ρ = +0,087.

Ma il catalogo ha la colonna **`recommendations`** (10 simili per titolo, id nudi) ed è **popolata al
100%** — `src/` non la usa.

| | titoli | con raccomandazioni |
|---|---|---|
| film | 97.613 | 100% |
| **serie** | 19.585 | **100%** |

## Perché conta (e non è superfluo)

Il teacher MovieLens copre le serie **allo 0%** e sono l'**80% delle cronologie reali** (ticket 12, il
rischio più grosso del filone). Le raccomandazioni TMDB sono l'**unico segnale comportamentale
disponibile per le serie** — e coprono anche film e uscite recenti.

## Il protocollo (validare sui film, poi fidarsi sulle serie)

1. **Audit sui film**: le raccomandazioni TMDB predicono la co-visione reale? Per ogni film, i suoi 10
   "simili" TMDB contro i vicini collaborativi del teacher → precision@10 e AUC. **Controllo di
   popolarità obbligatorio** (le raccomandazioni TMDB sono probabilmente popolarità-biased).
2. **Se valida** (batte nettamente il caso): costruire una **terza adiacenza** aggregando le coppie
   TMDB a livello di micro-cluster (stesso principio del builder) e **auditarla** contro la PPMI
   (0,631) e contro l'[adiacenza appresa](18-adiacenza-appresa.md) (0,699). In più: aggiungerla come
   **feature** al modello appreso.
3. **Sulle serie**: se il punto 1 valida, le raccomandazioni diventano il segnale comportamentale per
   le serie — l'unica strada disponibile per il [ticket 12](12-trasferimento-serie.md).

## Cautele dichiarate

- **Opacità**: le raccomandazioni TMDB sono l'output di un algoritmo proprietario, già fuso (non
  co-visione grezza). Il punto 1 esiste proprio per *guadagnarsi il diritto* di usarle dove non
  possiamo verificarle.
- **Circolarità**: se sono in parte guidate dai metadati, usarle per costruire un grafo di metadati è
  in parte auto-referenziale. L'audit contro il teacher misura esattamente questo.
- **Cap a 10**: segnale sparso (1,17M coppie su 117k titoli), ma sufficiente per un'adiacenza top-50.
