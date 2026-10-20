# Mappa: le righe vive — come navighiamo il grafo e cosa diamo all'utente

**Aperta**: 19/10/2026 · **Natura**: progetto — si tocca il **motore che produce le liste** e il **prodotto che
le serve**; **non** si ricostruisce il grafo
**Origine**: la sessione di analisi del 19/10/2026 (piano in
`C:\Users\gabri\AppData\Local\Temp\yaca-grafo-handoff\Piano d'Azione per il Sistema di Raccomandazione.md`,
handoff e due digest nella stessa cartella). Il cantiere precedente (`.scratch/confini/`, 59/59 chiusi) ha
sistemato i **confini**; questo sistema la **sostanza**.

## Destination

Le righe hero smettono di essere quattro scatole fisse e diventano un **portafoglio di righe** fondato su:

1. un **bacino appiattito** — le bolle accese e i loro vicini, unite, con un **pavimento di qualità**;
2. una **nicchia relativa al profilo** — non più soglie uguali per tutti;
3. i **micro-cluster degli interessi** — ogni filone dell'utente ha la sua riga, e non si fa schiacciare dagli altri;
4. la **recenza come selezione**, non come peso;
5. il **ritorno**: le impressioni smettono di essere scritte e mai lette.

E un invariante che vale per tutte: **la qualità non scende mai sotto un pavimento** — né per pochi voti, né per la
pressione di un franchise, né per un filtro applicato a valle che svuota la riga.

Il grafo resta il **substrato**: `66.259 nodi, la matrice `Tr`, le bolle. Cambia ciò che ci facciamo sopra.

## Decisioni prese (19/10/2026)

1. **I nomi e gli ID dei cataloghi si possono cambiare.** Con più righe (micro-cluster) lo schema fisso non regge.
   **Conseguenza deliberata**: i due hash del manifest (`dc4af35c…` / `91bf96d3…`) **cambiano**, e il nuovo valore
   atteso si aggiorna **nello stesso ticket che cambia il registro** — non si scopre dopo.
2. **Lo spazio vettoriale denso si rimanda.** Prima si mette in produzione questo e si guarda come va; quando sarà
   troppo limitante, si converte. Gli embedding (NetMF/SVD o contrastivi) sono **fuori ambito** qui.
3. **Il grafo non si ricostruisce**: `Tr`, `canon`, le bolle di Leiden, l'artefatto — invariati. Si toccano
   `parametri.py`, `motore.py` (la produzione delle liste), `servizio.py` (il contratto) e il lato Node.
4. **Il frontend non si tocca** (regola dell'utente, 19/10/2026).
5. **Il server non compila**: immagini da ghcr, il mate tira (dottrina di `docs/DEPLOYMENT_HOME_SERVER.md`).

## Not yet specified

- **Che cosa vuol dire "qualità alta"**: più pertinente? più vario? meno ripetitivo fra le righe? Le tre tirano in
  direzioni diverse. Fino a che non è scritto, ogni misura è arbitraria. Il ticket 45 usò "oro ammissibile".
- **A che livello agisce il ritorno**: riordino del pool (dopo il grafo) o filtro prima dell'idratazione? Il piano
  propone il **soft-decay sul punteggio** in `pool/index.js`, senza invalidare la cache del grafo.
- **Quanti micro-cluster esporre** (2 o 3) e con quale soglia minima (3 semi / 10% del peso).
- **Se `uscite_nuove` si rinomina** o resta lo slug riparato.

## Out of scope

- **Embedding densi del grafo** (NetMF, SVD su PPR/PMI, dual-encoder contrastivo): direzione approvata come
  "futuro", esplicitamente **non ora**.
- **Ricostruire il grafo** (matrice, bolle, canon, pipeline).
- **Il frontend**: si cambia ciò che il client **nomina**, non il client.
- **La misura comparativa "grafo contro vecchio stack"** (era il fuori-ambito della mappa `confini`): resta di
  un'altra mappa; qui si misura **la perdita ai sei stadi**, che è un'altra domanda.

## Il primo passo

`01` — la sonda end-to-end. Senza sapere **dove** si perde l'oro, ogni intervento è una scommessa.

## Un prerequisito scoperto eseguendo (19/10/2026)

- **`18`** — *la collezione e il regista non esistono a runtime*: il ticket `04` chiede max 1 per `collection_id` e
  max 2 per regista, ma `metadati-canone.npz` **non li esporta** (`COLL`/`DIR` vivono solo come archi della matrice
  dei pesi, non come attributi per titolo). Il `04` è scritto e inerte: si sblocca quando il canone porta i due
  attributi. **Insegnamento**: un ticket può essere eseguito correttamente e comunque non produrre effetto, se
  sotto manca il dato — ed è la review a doverlo dire, non il silenzio.

## I debiti dichiarati dalle review

- **`17`** — *il tipo dedotto dal peso*: `convertiSemiPerGrafo` indovina `loved`/`liked`/`watched` da soglie
  numeriche (`w >= 4`, `w >= 3`, `w === 1`). È la **causa strutturale** di ciò che il `02` ha curato per sintomo
  (il peso esplicito che scavalca `PESO_TIPO`), più lo score gonfiato del titolo ripescato.

## L'ultimo passo (deciso il 19/10/2026)

`16` — **la seconda passata dei documenti**. Il ticket `15` corregge ciò che oggi è falso e lascia le righe nuove
dichiarate ma non descritte, perché non esistono ancora. A fine cantiere si rilancia: le righe vere, i loro slug
presi dal registro, e la tabella dei sei stadi con i numeri misurati prima/dopo. Descrivere righe non ancora
costruite è il modo esatto in cui un documento diventa una bugia.
