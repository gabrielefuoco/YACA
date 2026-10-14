# Ticket 06 — lo studente per le serie

Nasce dal ticket 04, che aveva diagnosticato: «lo studente è `metadati -> Cf`, e `Cf` viene da MovieLens che non ha serie, quindi 0 serie hanno un target e tutte finiscono negli stessi vicini». Script: `06-studente-serie.py`.

## Cosa è stato fatto

1. Il target che mancava: **SVD(128) di `B`** (la co-visione Trakt, 14.723 serie, 4.031.968 archi), con la stessa ricetta di `Cf` (peso `1/log1p(grado)`).
2. La Ridge `FX -> B_svd` sulle sole 14.723 serie: **3 secondi**. Modello salvato in `inserimento-modello-serie.npz`.
3. Lo stesso controllo del ticket 04, su 600 serie col comportamento nascosto e il modello riaddestrato senza di loro.

## Il risultato, coi tassi base

| | propria bolla (base 0,062%) | non collegata (base 20,6%) |
|---|---|---|
| studente dei **film** applicato alle serie | **2,2%** (35x) | 1,8% (11x meglio) |
| studente delle **serie** (nuovo) | **1,3%** (22x) | **0,2%** (124x meglio) |
| *(confronto: i film, ticket 04)* | **27,7%** | 0,0% |

**Il nuovo studente non migliora la collocazione** (1,3% contro 2,2%, differenza dentro il rumore su 600 campioni) e **migliora molto il caso peggiore** (non collegata: 124x meglio del caso contro 11x). Trade-off, non vittoria.

## I due errori che questo ticket ha smontato

**1. Il criterio «adiacente» non discrimina.** La mappa delle bolle ha **1.037.438 adiacenze su 1.306.536 coppie possibili: il 79,4%**. Quindi «cade in una bolla adiacente» accade per caso quattro volte su cinque, e il 96-98% misurato è **1,2 volte il tasso base**. Il ticket 04 ha riportato «100% nel quartiere giusto» per i film: **quel numero era gonfiato dal grafo denso.** Il criterio forte è **la propria bolla** (27,7% contro 0,062%), il criterio di allarme è **la bolla non collegata** (0% contro 20,6%).

**2. Il fallimento delle serie nel ticket 04 era un artefatto mio.** Nella Parte B di `04-banco.py` la matrice dei vicini era mascherata con `Pn = np.where(ha[:, None], Pn, 0.0)`: le righe delle serie diventavano **zero**, il ranking cadeva sui pareggi a -9, e l'ordine era quello degli indici di catalogo. Per questo le tre serie ricevevano **gli stessi vicini** (*Resident Evil*, *Endgame*, *Interstellar*): non era lo studente a sbagliare, era la mia maschera. La misura vera dice che lo studente dei film applicato alle serie **non è rotto**: 35 volte il caso.

## Cosa resta vero

- **La collocazione delle serie è debole** (2%), con entrambi gli studenti: contro il 27,7% dei film. Le serie hanno metadati più poveri e bolle più grandi.
- **Nessuno dei due studenti finisce in una bolla non collegata** (0,2% e 1,8% contro il 20,6% di caso): il quartiere è sempre quello giusto, la bolla esatta quasi mai.
- **Il secondo studente non è la soluzione** per la collocazione. Va tenuto come opzione, non adottato: il suo valore è altrove (la co-visione serve al recupero delle serie, ticket 17 di `grafo-servibile`).

## La conseguenza, che conferma l'intuizione dell'utente

Se le serie sono deboli con **tutti e due** gli studenti, e i film sono forti (27,7%), allora il modo giusto di collocare una serie nuova è **passare dai film**: la serie atterra presso i film del suo mondo, e da lì si passa alle serie adiacenti. È il passo in due tempi del ticket 03-bis, e l'impalcatura esiste nel **58,7%** dei casi.

L'obiezione dell'utente non solo regge: è la strada migliore rimasta.
