Status: resolved
Type: grilling

# 01 — Il contratto del motore: cosa chiede il prodotto, cosa risponde il motore

**Risolto il 17/10/2026.** Il contratto è scritto in `.scratch/confini/contratto-motore.md` (il ticket 06 lo
sposta accanto al codice). Le tre decisioni e il perché stanno in `## Esito`, in fondo.

## Perché

Il 17/10/2026 (charting, decisione 2 della mappa) il motore delle raccomandazioni è diventato **un servizio**
con l'artefatto interno al modulo. Ma un servizio senza contratto scritto non è un servizio: è un processo
che qualcuno chiama a naso. Questo ticket **scrive il contratto** e lo congela — è il documento da cui
dipendono 07, 08, 09 e, più tardi, gli slider del ticket 39.

## La domanda

Qual è, **per esteso**, il contratto del motore? Richiesta, risposta, errori, versione, e i casi di bordo.

## Cosa deve uscire

Un documento (`.scratch/confini/contratto-motore.md`, poi spostato accanto al codice dal ticket 06) che
fissi almeno:

- **richiesta**: `semi` (lista di `{tmdbId, type, peso}`), `medium`, `opzioni` (i quattro slider `largo`,
  `lontano`, `cozy`, `canone` — quali sono obbligatori, quali hanno un default e **chi lo sceglie**),
  `liste` (quante), `cap` (quanti titoli per lista);
- **risposta**: per ogni lista il `ruolo`, il `mondo`, la `descrizione`, l'`attivazione`, la `mediana_voti`,
  i `semi` che l'hanno accesa, e i titoli con il loro `perché`;
- **versione**: come si legge (oggi `versione` viaggia nell'artefatto), cosa succede quando cambia, e se il
  campo `versione` della risposta deve servire a *rifiutare* una risposta vecchia o solo a tracciarla;
- **errori**: motore giù, artefatto assente, storia vuota, id sconosciuto. Cosa risponde il servizio e cosa fa
  il prodotto: la regola già in vigore è *una riga vuota è meglio di un feed rotto*
  (`src/engines/bolle/raccomanda.js`, il `catch` con `console.error('[Mondi] …')`);
- **tempo**: quanto può metterci il motore (è chiamato al cache-build, non per richiesta — ma un tetto serve),
  e cosa fa il prodotto se sfora;
- **i quattro `da_comporre`**: `uscite_nuove` e `nicchia_di_qualita` hanno bisogno di anni, popolarità e voto
  medio, che stanno nel catalogo del prodotto e non nel grafo (`src/api/bolle.js`, intestazione). Il contratto
  deve dire se restano **posti riservati nell'ordine** o se il motore li riempie con ciò che ha.

## Il confine da non superare

Il motore **non** tocca TMDB, **non** risolve i poster, **non** compone la lingua o il filtro ita, **non**
deduplica con la libreria: quello è del prodotto (decisione 3). Se una cosa sembra servire a entrambi, la
domanda giusta è *chi la possiede*, non *dove metterla per comodità*.

## Come si verifica

Il contratto è pronto quando: (a) un esempio di richiesta e uno di risposta si possono **eseguire** — la
risposta d'esempio è quella che il motore restituisce **davvero** per una storia vera (`docker exec yaca-app
node -e …` per il lato prodotto, `python -m graph.pipeline …` per il lato motore); (b) ogni campo ha un
consumatore dichiarato (chi lo legge, e per fare cosa); (c) nessun campo del contratto cita una struttura
interna dell'artefatto (bolle, membri, pesi) senza che quella struttura sia un tipo dichiarato.

---

## Esito

**Tre decisioni prese il 17/10/2026 in grilling, più una scoperta che le ha rese necessarie.**

### La scoperta: liste e righe non sono la stessa cosa

Il motore Python restituisce **una lista per mondo** (`graph/motore.py:275-297`): `il_tuo_mondo`,
`un_passo_fuori`, `uscite_nuove`, `nicchia_di_qualita`, più `mondo_<bolla>` per ogni altro mondo acceso — e
`largo` significa *quante liste*. Il ponte JS attuale fa l'opposto: schiaccia `MONDI_PER_RIGA=8` mondi in
**due righe**. Chi decideva la mappatura era il JS, senza che nessuno l'avesse deciso.

### 1. Liste dal motore, righe dal prodotto

Il motore restituisce le liste coi loro **ruoli**; il prodotto decide quali diventano righe del feed e con
che nome (`yaca_mondi_*` ← `il_tuo_mondo`, `yaca_passo_fuori_*` ← `un_passo_fuori`). Il motore non impara i
nomi dei cataloghi — che vivono in `src/catalog/registry.js` e in altri **nove** posti, e cambiano col
prodotto.

**Conseguenza obbligata**: la risposta deve portare, per ogni titolo, il **punteggio di attivazione**. Senza,
il prodotto non può fondere due liste rispettando l'ordine — ed è l'errore misurato del 16/10/2026 (tre bolle
concatenate: le prime dieci posizioni erano tutte del primo vicino).

### 2. Vocabolario strutturato, e l'anime resta al prodotto

Un titolo è `{ tmdbId: <int>, medium: "movie"|"series" }`: niente stringhe con prefisso (`tmdb:655`,
`tv:655`) e **un nome solo** per le serie. Motivo: il 17/10/2026 le serie sono sparite dalle righe per la
forma dell'id, e nel prodotto convivono `tmdb:<id>` (forma breve, senza medium), `tv` e `series`,
`film`/`serie`.

**L'anime non entra nel contratto**: il modulo Python non ha la tabella anime (una occorrenza in
`collocator.py`, zero nel ponte JS), il prodotto sì (`animeMappingStore`, `animeAiringState`, `catalogKind`,
provider). Se un giorno il motore userà l'anime come segnale, il campo entra **in ingresso** sui semi, non in
uscita: il prodotto sa già quali dei suoi titoli sono anime.

### 3. Risposta parziale con motivo; il ripiego popolare resta escluso

Il caso normale non è mai un errore: `200` con `liste` **e** `motivi[]`; non-200 solo per guasti veri
(processo giù, richiesta malformata). Il prodotto non mostra mai una riga vuota — la regola che c'è già
(«una riga vuota è meglio di un feed rotto»). Tetro al cache-build: **10 s**, oltre i quali la riga non
compare e il resto del feed si costruisce lo stesso.

**Il ripiego popolare è escluso** con la motivazione già scritta nel prodotto: *mostra di nuovo il catalogo
generico, cioè esattamente il sintomo che si stava cercando di togliere*.

### Ciò che il ticket chiedeva e che l'esito ha risolto diversamente

- **«i quattro `da_comporre`»**: il `da_comporre: true` di `src/api/bolle.js` esisteva perché il **JS** non ha
  anni né popolarità. Il **motore** li ha (`ANNO`, `POP`, `VAVE`): `uscite_nuove` e `nicchia_di_qualita` le
  riempie lui, marcate `parziale: true`. Il `da_comporre` **sparisce con il ponte**. E il «posto riservato
  nell'ordine» non serve più: con le liste per ruolo, l'ordine è quello che il prodotto decide.
- **«il `perché` per titolo»**: il motore **non** sa da quale seme è arrivato un titolo — non lo calcola. La
  spiegazione sta dove il motore ce l'ha: **a livello di lista** (mondo, descrizione, attivazione, mediana dei
  voti, semi del mondo). Un `perché` per titolo è una capacità nuova, dichiarata fra i punti aperti del
  contratto, non un campo che si finge di avere.
- **«quanto può metterci il motore»**: il costo è il **caricamento** (~20 s, una volta, all'avvio del
  processo — `graph/motore.py:60`), non la risposta. È la ragione per cui il servizio persistente (decisione
  2 della mappa) batte l'avvio di un processo a ogni costruzione, e per cui il tetto di 10 s lato prodotto è
generoso.
- **`nicchia_di_qualita` è esente dal contratto di monotonia** (`graph/motore.py:299`): è ordinata per
  qualità, non per attivazione. Il contratto lo dichiara, se no il prodotto assume una cosa falsa.

### Cosa resta da fare, e dove

Il contratto è un documento: nel codice non esiste finché **07** (il motore risponde) e **08** (il prodotto
chiama) non lo realizzano. Il ticket 06 deciderà dove vive il file (accanto al modulo è l'ipotesi).
