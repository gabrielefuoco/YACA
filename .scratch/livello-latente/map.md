# Mappa: il livello latente del DNA e la decisione su un modello denso

**Aperta**: 08/10/2026 · **Tracker**: markdown locale, `.scratch/livello-latente/issues/` · **Stato**: aperta

## Destination

**Il DNA di un profilo è lo stesso qualunque sia lo stato del processo che lo costruisce** — e la scelta se
introdurre un modello denso item-side (OCEAN, embedding) è presa su numeri, non su gusto.

Stato al 08/10/2026:

1. ✅ **Fatto** — a parità di dati, freddo e caldo producono gli **stessi** vettori: `Jaccard top-50 = 100%`,
   0 posizioni cambiate su 50, 64 preset su 64 identici ([misura](ricerche/01-misura-id-nome.md)).
2. ⏳ **Da fare** — il banco esistente deve dire se il livello gerarchico, ora acceso, migliora pertinenza e
   coerenza su un profilo nuovo: la misura di questa mappa è un *proxy*, non il giudizio editoriale.
3. ⏳ **Da fare** — la decisione OCEAN/embedding, con il costo a fianco e il risultato del punto 2 come premessa.

## Il fatto centrale (verificato 08/10/2026)

Il motore riconosce una keyword in due modi: per **numero** (`k:10364`) o per **nome** (`k:mission`), e solo dal
nome raggiunge la gerarchia (`L1:c_492`, `L2:t_193`, …) — perché `kw_to_L1` è indicizzato per nome.

`HierarchicalGraph.vectorizeKeywords` aveva una cache (`singleKwCache`) con chiave `id:<numero>` — **la stessa sia
che l'input fosse l'oggetto `{id,name}` sia che fosse il solo numero**. Chi passava il solo numero ereditava nome e
livelli **solo dalla prima chiamata in cui quel numero era stato visto con il nome**, dentro lo stesso processo.

**Quindi**: la ricchezza del DNA era un **effetto collaterale della cache e dell'ordine delle richieste**, non una
decisione. Nel server di produzione lo scoring degli item (che passa gli oggetti del parquet) scalda la cache prima
che il profilo venga ricostruito: è per questo che i profili reali *avevano* `L1:c_456` e `k:halloween`. Un profilo
ricostruito a server appena riavviato, o su keyword mai passate con il nome, otteneva la versione piatta.

**Fix applicato** (vedi [misura](ricerche/01-misura-id-nome.md)): mappa id↔nome costruita dal dump nella query che
già legge tutte le keyword, chiavi di cache che descrivono la forma dell'input, `computeTopKeywords` che continua a
restituire ID. A processo freddo il catalogo servito era **diverso per metà**; ora freddo e caldo coincidono al 100%.

### Perché conta per lo scoring

`ProfileScorer._computeThematicScoreForVector` (`ProfileScorer.js:144-159`) fa il join **per chiave esatta** fra le
chiavi del profilo e quelle dell'item. Nella versione **fredda** il profilo portava `k:10364` e l'item
`k:mission` + `L*`: nessuna chiave poteva incontrarsi, e il punteggio tematico si riduceva ai generi (6% degli item
con almeno un match). Con la mappa iniettata: **91%**.

## Fatti verificati (08/10/2026)

| # | Fatto | Come è stato verificato |
|---|---|---|
| V1 | `hierarchical_graph.json` è indicizzato **per nome**: `kw_to_L1` ha 6125 chiavi, **0 numeriche** | filtraggio delle chiavi |
| V2 | Il parquet serve le keyword come oggetti `[{"id":10364,"name":"mission"}]` | `.cache/tmdb/movies.parquet` |
| V3 | I preset usano **id numerici** (`with_keywords`): 311 keyword in 79 preset, **0 mappate per nome** | `getPresets()` × `kw_to_L1` |
| V4 | **La cache `singleKwCache` era la causa**: stesso input (soli id), 14 chiavi a freddo e 74 a caldo | `probe-cache.js`, tre stati |
| V5 | La diffusione orizzontale fra L1 non parte mai: `L1_adjacency` è scritto da `build_graph.py:512` ma **assente** dal JSON di produzione | chiavi top-level del JSON |
| V6 | `ui_name`/`ui_emoji` popolati (L3 131/131, L4 70/70) e **letti da nessuno** in `src/` e `frontend/src` | `grep -rn` |
| V7 | Una radice su cinque è spazzatura: `r_4` ha medoid `mazzaropi` (nodo con una keyword) | `hierarchical_graph.json` |
| V8 | `getKeywordsForNodes` (classe) espande anche L3/L4/L5; `getKeywordsForNodeIds` (catalogStrategies) si ferma a L1/L2 | lettura dei due moduli |

> **Correzione rispetto alla prima stesura di questa mappa.** La versione iniziale diceva «la gerarchia non arriva
> mai al DNA» e citava come prova una demo in cui le due liste risultavano identiche. Era **sbagliata**: quella demo
> girava a cache calda, senza che lo sapessi. La gerarchia a volte arrivava, a volte no — dipendeva dalla cache. Il
> difetto era il **non determinismo**, non l'assenza. Il fix lo ha eliminato: vedi [misura](ricerche/01-misura-id-nome.md).

| V9 | Dopo il fix, freddo e caldo producono la stessa lista: `Jaccard top-50 = 100%`, 64/64 preset identici | `compare.js freddo-fix.json caldo-fix.json` |

## Nebbia (da sciogliere mentre si lavora)

- **Il tono connette ma non conta** (ticket 02): la gerarchia ora si connette per il 91% degli item, ma i nodi
  alti (L3–L5) pesano 0,1 / 0,05 / 0,01 nella vettorizzazione, quindi la loro quota del punteggio tematico è
  ~0,1%. Il livello «tono» esiste ed è muto: è il concorrente onesto di OCEAN.
- **Quanto del «i suggerimenti sono inutili sui profili nuovi» era questo** e quanto il pool costruito da poche
  chiavi (top-3 generi + cluster di keyword; il commento nel codice prevede già il degrado a coppie di keyword,
  «es. profilo nuovo»). Il fix cambia metà del catalogo a freddo: da qui in poi si misura con i giudici.
- **Quale denso, se serve**: gerarchia (già calcolata, costo zero) vs annotazione OCEAN item-side su tutto
  il catalogo (costo alto, da rigenerare a ogni cambio di modello) vs embedding item-side.
- **I 201 assi nominati che esistono e non si vedono**: `ui_name`/`ui_emoji` su L3/L4 sono già nomi italiani.
  Decidere se diventano il racconto del profilo (risposta al dolore «tanti assi, nessun nome»).
- **Igiene del grafo**: `r_4 = mazzaropi`, L1 con una sola keyword, L2/L5 senza `ui_name`.

## Decisioni

| # | Decisione | Alternativa scartata, perché |
|---|---|---|
| D1 | **OCEAN non entra come asse di profilo dedotto dal DNA** | È una proiezione a basso rango di un vettore che già esiste: ricodifica, non aggiunge segnale. Vale solo se anche gli item vivono in quello spazio |
| D2 | **Se OCEAN entra, entra item-side** — e il suo termine di paragone è la gerarchia L1–L5 | Confrontare un denso nuovo con un concorrente non deterministico non è una misura |
| D3 | **Prima il determinismo, poi la misura, poi la spesa** | Il giudizio cieco ha Δ fino a 34 punti: un guadagno non dimostrato sta sotto il rumore del banco che abbiamo |
| D4 | **Nessun questionario di personalità**: se serve più segnale su un profilo nuovo si chiede **gusto** (tessere, dislike), non psicometria | Il questionario è l'unica variante di OCEAN che non è funzione del DNA, ma è anche l'unica che un utente di addon non compila |
| D5 | **La cache non deve decidere il contenuto del DNA**: il passaggio id→nome va reso esplicito nel percorso DNA | «Tanto a caldo funziona» è il motivo per cui il difetto è sopravvissuto: la produzione è quasi sempre calda, quindi non si vede |

| D6 | **La ricchezza del DNA non può dipendere dall'ordine delle richieste**: la forma dell'input entra nella chiave di cache, e la mappa id↔nome la inietta il dump | «Tanto in produzione è quasi sempre caldo» è il motivo per cui il difetto è sopravvissuto; e a freddo metà catalogo era diversa |

## Fuori ambito

- Etichettatura OCEAN dell'intero catalogo tramite LLM (decisione del punto 3 della Destination).
- Rifattorizzazione delle tre convenzioni di normalizzazione (`sanitizeDnaVector` / `normalizeVector` /
  `sparseUnitNormalize`): sono distinte di proposito, c'è un test che lo difende.
- Il rifacimento del grafo con `offline_graph_builder`: qui si usa quello che c'è.
- Pool, fallback e `fallbackUsed` dei hero (mappa `qc-cataloghi`).
- Le 3 suite rosse pre-esistenti (`tier2Index`, `learnedNames`, `metaHandlerEpisodeIds`): non toccate da questa mappa.

## Ticket

- [01 — La cache decideva il DNA: misurare il non determinismo](issues/01-cache-decide-il-dna.md) · `resolved` 08/10/2026 →
  [misura e fix](ricerche/01-misura-id-nome.md)
- [02 — Il tono connette ma non conta: il peso dei livelli alti](issues/02-peso-livelli-alti.md) · `ready-for-agent`, `research`
