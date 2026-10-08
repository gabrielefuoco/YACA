# 01 — La cache decideva il DNA: misura del difetto e del fix

**Data**: 08/10/2026 · **Ticket**: [01](../issues/01-cache-decide-il-dna.md) (chiuso) · **Mappa**: [livello-latente](../map.md)
**Banco**: `.scratch/livello-latente/measure.js` + `compare.js` + `probe-cache.js` · **Dump grezzi**: `runs/` (gitignorato)

---

## 1. Il difetto, in una riga

Il grafo gerarchico è indicizzato **per nome** (`kw_to_L1['mission']`); preset, parquet e `ProfileBuilder`
consegnano **ID numerici** (`10364`). Chi colmava il vuoto era `singleKwCache`, che usava la chiave `id:<id>`
sia per l'oggetto `{id,name}` sia per il solo id: **una chiamata con l'id ereditava nome e livelli solo se
quel numero era già stato visto con il nome nello stesso processo**. Il contenuto del DNA era quindi una
funzione dell'**ordine delle richieste**, non dei segnali dell'utente.

Dimostrazione minima (`probe-cache.js`, stesse keyword del film 27205, solo id):

```
prima del fix                         dopo il fix
FREDDO | 14 chiavi | 0 livelli        FREDDO | 14 chiavi | 0 livelli
CALDO  | 74 chiavi | 28 livelli       CALDO  | 14 chiavi | 0 livelli   <- contaminazione eliminata
                                      MAPPA  | 74 chiavi | 28 livelli  <- ricchezza per tutti
```

## 2. Misura del danno (prima del fix)

64 preset con keyword, 400 item ciascuno dal parquet (i più popolari del genere del preset), punteggio tematico
calcolato con lo **stesso codice dello scorer** (`ProfileScorer._computeThematicScoreForVector`). Due ordini di
esecuzione, stessi dati: il DNA prima degli item (**freddo**) e gli item prima del DNA (**caldo**).

| | freddo | caldo |
|---|---|---|
| Chiavi DNA a parole | **0** | 181 |
| Chiavi DNA gerarchiche (L1–L5) | **0** | 558 |
| Item con almeno un contributo da keyword/gerarchia | **1.352 / 21.084 (6%)** | 17.765 / 21.084 (84%) |

E l'effetto sulla lista servita (Jaccard sui primi 50, `freddo` vs `caldo`):

- **sovrapposizione mediana 50%** — metà del catalogo cambia a parità di profilo e di dati;
- **48 posizioni su 50 cambiate** (mediana);
- **39 preset su 64** sotto il 60% di sovrapposizione; sui preset anime si scende al **5-8%** (liste quasi
  completamente diverse);
- 14 preset su 64 non erano toccati (quelli in cui nessun item incontrava comunque le keyword).

## 3. Il fix

| # | Punto | Cosa cambia |
|---|---|---|
| 1 | `src/data/keywordIds.js` | mappa id↔nome iniettata dall'esterno (`setKeywordNameMaps`, `keywordNameForId`, `keywordIdForName`). Modulo foglia: niente I/O |
| 2 | `src/db/duckDbStore.js` (`buildDfCache`) | la **stessa** query che già leggeva tutte le keyword per la rarità ora ne prende anche il nome e costruisce le due mappe; il df viene indicizzato **su entrambe le forme** (`k:10364` e `k:mission`), così la rarità dolce pesa uguale |
| 3 | `src/engines/graph/HierarchicalGraph.js` | un id da solo risolve il nome dalla mappa; la chiave di cache ora **descrive la forma dell'input** (`id:10364\|kw:mission` vs `id:10364\|noname`) a livello di singola keyword **e** di array; nuovo `invalidateKeywordCaches()` chiamato all'iniezione |
| 4 | `src/engines/hybrid/scoringEngine.js` (`computeTopElements`) | `computeTopKeywords` resta una lista di **ID**: i nomi vengono risolti, i non risolvibili scartati, i duplicati deduplicati tenendo il peso maggiore |

Test che lo difendono: [`tests/dnaKeywordIdentity.test.js`](../../../tests/dnaKeywordIdentity.test.js) — 13 casi,
fra cui **l'ordine delle chiamate non cambia il vettore**, l'id senza mappa non eredita il nome, e l'intersezione
profilo/item non è più vuota. Se qualcuno torna alla chiave `id:<id>` "per semplicità", prende un rosso.

## 4. Misura del fix

| Confronto | Jaccard top-50 (mediana) | Posizioni cambiate | Preset identici |
|---|---|---|---|
| **freddo vs caldo, dopo il fix** | **100%** | **0 / 50** | **64 / 64** |
| freddo vs caldo, prima del fix | 50% | 48 / 50 | 14 / 64 |
| freddo prima vs freddo dopo | 47% | 48 / 50 | 10 / 64 |
| caldo prima vs caldo dopo | 100% | 17 / 50 | 40 / 64 |

Tre letture:

1. **Il non determinismo è eliminato**: a parità di dati, i due ordini danno la stessa lista, 64 preset su 64.
2. **Su un profilo freddo il fix cambia metà del catalogo** (47% di sovrapposizione): è la misura di quanto
   contava, non un dettaglio di implementazione.
3. **A processo caldo il fix non riscrive la storia**: la mediana resta 100% (riproduce ciò che la cache
   faceva per caso), ma 24 preset su 64 migliorano ancora, perché il DNA ora ha 11,5 chiavi a nome+gerarchia
   invece delle 8 che la cache aveva per fortuna. Il fix *estende* il comportamento buono, non lo sostituisce.

Copertura dopo il fix: **19.172 / 21.084 item (91%)** ricevono almeno un contributo da keyword/gerarchia, sia
a freddo sia a caldo.

## 5. Cosa questa misura NON dice

- **Non dice che i cataloghi sono migliori.** Misura un proxy: punteggio tematico grezzo, profilo costruito dal
  solo preset (utente freddo), pool dei 400 titoli più popolari del genere. Il giudizio editoriale — pertinenza,
  qualità, coerenza della top-50 — richiede i giudici della campagna `qc-cataloghi`, non questo banco.
- **Non copre la pipeline intera**: niente cluster (`V_clusters`), niente cap di diversità, niente impression
  penalty, niente fusione sotto-profilo/globale.
- **Il pool è mainstream**, quindi gli item incontrano soprattutto i nodi **alti** della gerarchia (L3–L5), che
  nella vettorizzazione pesano 0,1 / 0,05 / 0,01. Su un pool di nicchia l'incontro sarebbe più spesso su L1/L2.

## 6. Scoperta collaterale: il tono connette, ma non conta

A un caso pulito (1 genere + 2 keyword) la quota keyword+gerarchia del punteggio tematico è **90,9%**. Sul
banco reale la mediana è **0,1%**: gli item del pool condividono quasi solo i nodi **alti**, e quei nodi valgono
0,1 / 0,05 / 0,01 — un arrotondamento. Cioè: **la gerarchia ora si connette (91% degli item) ma il livello
"tono" non ha peso per spostare la classifica.** È il ticket 02, ed è il concorrente onesto di qualunque modello
denso nuovo (OCEAN compreso): il livello c'è già, è solo muto.

## 7. Come si riproduce

```bash
# la prova minima (tre stati del processo)
node .scratch/livello-latente/probe-cache.js freddo   # 14 chiavi, 0 livelli
node .scratch/livello-latente/probe-cache.js caldo    # 14 chiavi (prima del fix: 74)
node .scratch/livello-latente/probe-cache.js mappa    # 74 chiavi, 28 livelli

# la campagna (64 preset x 400 item) sul codice CORRENTE, con la mappa dal dump
WITH_MAP=1 node .scratch/livello-latente/measure.js freddo .scratch/livello-latente/runs/freddo-fix.json
WITH_MAP=1 node .scratch/livello-latente/measure.js caldo  .scratch/livello-latente/runs/caldo-fix.json
node .scratch/livello-latente/compare.js freddo-fix.json caldo-fix.json    # -> 100%

# i dump PRE-fix (per rifare il confronto «prima/dopo»)
git checkout a20add6~1 -- src/
node .scratch/livello-latente/measure.js freddo .scratch/livello-latente/runs/freddo-prima.json
node .scratch/livello-latente/measure.js caldo  .scratch/livello-latente/runs/caldo-prima.json
git checkout a20add6 -- src/
node .scratch/livello-latente/compare.js freddo-prima.json caldo-prima.json   # -> 50%
```

`WITH_MAP=1` costruisce la mappa con il **codice di produzione** (`DuckDbStore.buildDfCache`), senza l'init
completo del database (viste sui parquet al posto delle tabelle + indice FTS). La mappa risultante copre
**38.201 keyword** del catalogo.

Suite completa: **173/176 suite verdi, 1.743 test passati**. Le 3 suite rosse (`tier2Index`, `learnedNames`,
`metaHandlerEpisodeIds`, 20 test) **falliscono identiche sul codice non toccato** — verificate con `git stash`.
Lint: 0 errori.
