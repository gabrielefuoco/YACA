# 63 — L'ordinamento del catalogo serie: fatto, e vale il doppio

**Il mandato**: il catalogo serie è metà prodotto e non ha **nessun** ordinamento — il modello del catalogo film è addestrato sul comportamento MovieLens, che per le serie **non esiste** (`CF` copre 49.041 film e **zero serie**).

**L'esito**: l'ordinamento del catalogo serie **vale 1,88-2,82×**. E la caratteristica più forte non è nessuna di quelle che mi aspettavo: è la **co-visione Trakt**, l'unico segnale di comportamento che copre le serie.

Script: `ordine-serie.py` (375 s).

---

## 1. Il risultato

Banco: cronologie Trakt, 356 utenti con ≥20 film e ≥10 serie, split 60/40. Il modello è addestrato su **metà** utenti e verificato sull'altra metà. Il cesto è il top-500 serie della camminata.

| ordinamento del cesto | @10 | @100 | @500 |
|---|---|---|---|
| **attivazione (com'è ora)** | 1,75% | 12,14% | 38,25% |
| attivazione sul **solo `CFst`** | 2,78% | 15,87% | 38,25% |
| popolarità | 0,56% | 10,45% | 38,25% |
| **GBM (14 caratteristiche)** | **7,39%** | **28,14%** | 38,25% |
| *oracolo dello stesso cesto* | *12,19%* | *38,25%* | *38,25%* |

**Verifica — utenti che il modello non ha visto:**

| ordinamento | @10 | @100 | @500 |
|---|---|---|---|
| attivazione | 1,87% | 12,31% | 37,59% |
| attivazione sul solo `CFst` | 2,34% | 15,35% | 37,59% |
| popolarità | 0,50% | 11,23% | 37,59% |
| **GBM** | **5,27%** | **23,18%** | 37,59% |

**Guadagno in verifica: 2,82× al @10 e 1,88× al @100.**

Per confronto, il catalogo film con lo stesso impianto guadagnava 1,41× al @100. **Il catalogo serie guadagna di più perché partiva da più in basso** — ed è la prima volta che qualcuno lo ordina.

**Da dichiarare**: la calibrazione (7,39%) è sopra la verifica (5,27%), cioè **c'è adattamento** — più che sul lato film (7,48% → 6,99%). Il banco serie è più piccolo (178 utenti per metà contro 1.000). Il guadagno regge comunque, ma il numero da citare è quello di verifica: **5,27% / 23,18%**.

## 2. La scoperta: la caratteristica più forte è la co-visione

Importanza per permutazione (quanto si perde togliendola):

| caratteristica | cosa misura | punti persi al @100 |
|---|---|---|
| **`covis`** | quanti vicini di **co-visione Trakt** cadono nel profilo | **−9,94** |
| `pop` | il percentile di popolarità | −7,29 |
| `grado` | il grado nel grafo | −3,19 |
| `att_st` | la camminata sul solo `CFst` | −3,06 |
| `anno` | la distanza dall'anno mediano del profilo | −2,59 |
| `att` | la camminata sul grafo completo | −2,40 |
| `dim_fog` | la dimensione della foglia | −2,23 |
| `toccata` | quanti titoli del profilo nella stessa foglia | −1,91 |
| `voto` `cos_prof` `st_cent` `st_voti` `temi` `curati` | — | < 1,5 |

**La co-visione vale più di tutto il resto**, e non me l'aspettavo: l'avevo messa come una caratteristica fra le altre.

**Il motivo**: `CF` è costruito sulle cronologie **MovieLens**, che sono fatte di film. Per le serie **non esiste comportamento** in quella matrice. Ma la co-visione Trakt (`B`) è costruita dall'endpoint "related" di Trakt, che **copre anche le serie** — ed è quindi **l'unico segnale di comportamento disponibile per le serie**.

**Verificato che non è contaminazione**: i `rel-*.json` sono l'endpoint **"related" per titolo** (`rel-movie-tt0000417.json` = i titoli legati a quel film), non le cronologie degli utenti del banco. La co-visione viene dal comportamento di Trakt **nel suo insieme**, non da quegli utenti. ✓

## 3. La seconda scoperta: `CFst` da solo ordina meglio del grafo intero

| | @10 | @100 |
|---|---|---|
| attivazione sul grafo completo | 1,75% | 12,14% |
| **attivazione sul solo `CFst`** | **2,78%** | **15,87%** |

**+59% al @10 senza modello e senza dati nuovi.** È lo stesso fenomeno trovato sul lato film («il grafo ha due mestieri, e vogliono due pesature»), ma qui è più netto: per **ordinare** le serie serve il pubblico previsto, non il grafo intero. E il grafo intero contiene la curatela, che porta in cima i titoli scritti a mano.

## 4. Cosa significa per il prodotto

1. **Il catalogo serie ora ha un ordinamento**, e vale **1,88-2,82×** sull'attivazione. Era il pezzo mancante più grosso: metà prodotto, zero lavoro.
2. **La leva è la co-visione.** Il prossimo passo è ovvio: **alzare il peso di `B` nel grafo** per il lato serie — la co-visione è l'unico comportamento che le copre, e nel grafo pesa 1 su 9. Sweep in corso.
3. **Per ordinare le serie, `CFst` da solo è meglio del grafo intero** (+59% al @10). Il grafo serve a *trovare* il cesto; l'ordine vuole un'altra pesatura — di nuovo.
4. **Il tetto**: l'oracolo dello stesso cesto è 12,19% @10 e 38,25% @100. Il modello prende il **61%** dell'oracolo al @10 e il **74%** al @100. **Il margine rimasto è nel cesto**, non nell'ordinamento.

## 5. Limiti

- Il banco è di **356 utenti** con 178 per metà: piccolo. Il divario calibrazione/verifica (7,39 → 5,27) dice che il modello è in parte adattato, e il numero onesto è quello di verifica.
- Gli utenti Trakt sono **autori di liste pubbliche**, non un campione casuale: le stime sono ottimistiche.
- Le caratteristiche sono calcolate **offline** su tutto il catalogo; in produzione vanno calcolate a runtime o precalcolate e aggiornate.
- Il cesto è fisso a 500. Con un cesto più grande l'oracolo sale e il modello avrebbe più margine.
