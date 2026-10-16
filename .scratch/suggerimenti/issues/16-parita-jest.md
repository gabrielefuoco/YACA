Status: ready-for-agent
Type: task
Blocked by: 04

# Test di parita' Python <-> JavaScript
**Perche'**: ci sono due motori che devono dire la stessa cosa — `graph/motore.py` (che misura e decide
i parametri) e `src/engines/bolle/Bolle.js` (che serve il prodotto). Il rischio fra sei mesi: si
cambia la formula in Python, si misura che migliora, e **non si aggiorna il JS** (o viceversa). Le due
parti divergono in silenzio, e il numero misurato non e' piu' quello servito.
**Fix**: `tests/bolleParity.test.js` (Jest c'e' gia': `npm test`): 5 storie fisse (solo film, solo
serie, mista con loved+library, fredda con 2 titoli, una lunga), un golden generato da
`python -m graph.pipeline parita --fuori tests/fixtures/parita.json`, e il confronto su: pesi dei semi,
bolle attivate e **loro ordine**. Da agganciare a `npm test`.
**Dipende dal ticket 04**: senza i pesi degli archi e i ponti cross, la parita' numerica non puo'
essere migliore della differenza fra transizione uniforme e pesata (misurata: le bolle di testa
cambiano).
