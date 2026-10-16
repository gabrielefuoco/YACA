Status: resolved
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
---

RISOLTO il 16/10/2026. `tests/bolleParity.test.js` + `tests/fixtures/parita.json` (21 KB, 5 storie fisse
scelte dal canone con regola deterministica: nessuna dipendenza dalla cache di Trakt). Il comando che
rigenera il golden e' `python -m graph.pipeline parita`, ed e' il primo test della suite che misura DUE
motori invece di uno.

QUATTRO CONTROLLI, e il primo e' la trappola piu' comune:
 1. l'artefatto e' quello con cui il golden e' stato generato (se salta, NON e' un bug: e' che
    `bolle.json` e' stato riesportato e si rigenera il fixture);
 2. **i pesi dei semi coincidono esattamente** — la stessa formula scritta due volte, una in Python e
    una in JavaScript;
 3. **la bolla pura, calcolata due volte**: in Python con scipy (una matrice) e in JavaScript coi cicli.
    Due implementazioni indipendenti: i primi dieci mondi escono **nello stesso ordine** e l'errore
    normalizzato sta sotto 1e-3 — **misurato fino a 4,2e-5**, e la causa di quel residuo NON e' stata
    isolata (dichiarato nel test invece di incolpare il floating point: i pesi sono bit-identici e la
    diffusione e' una contrazione, quindi non dovrebbe bastare);
 4. **il costo della semplificazione dichiarata**, stampato a ogni `npm test`: la diffusione sulle bolle
    e quella sui titoli condividono **metà dei primi dieci mondi** (jaccard 0,25 la fredda, 0,43 la
    lunga, 0,54 le altre), e il primo mondo del motore vero **cade sempre** nei primi dieci di quello
    del prodotto. Soglie: jaccard > 0,20 e quel "sempre" verificato — non sono traguardi, sono il
    prezzo della scelta bolle-invece-di-titoli, e servono a protestare se cresce.

NOTA SULLA SUITE: `npm test` ha 178 suite e ne passano 173; le **4 rosse sono preesistenti** e non
c'entrano nulla con questo lavoro (per esempio `staticPosters.test.js`, un test sulle locandine in
cache). Non le ho toccate, ma vanno guardate: una suite con dentro 6 test rossi da chissa' quanto
insegna a ignorare le suite rosse.
