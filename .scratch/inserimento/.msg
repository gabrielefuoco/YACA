fix(inserimento): ticket 06 — lo studente per le serie non migliora la collocazione, e due miei numeri erano sbagliati

Fatto: SVD(128) di B (co-visione Trakt, 14.723 serie, 4.031.968 archi) come target denso, Ridge
FX -> B_svd addestrata in 3 secondi. Modello in inserimento-modello-serie.npz.

IL RISULTATO, coi tassi base (la mappa ha il 79,4% di coppie adiacenti):
  studente dei FILM applicato alle serie: propria bolla 2,2% (35x il caso) - non collegata 1,8%
  studente delle SERIE (nuovo):           propria bolla 1,3% (22x) - non collegata 0,2% (124x)
  per confronto, i FILM (ticket 04):      propria bolla 27,7%
Il nuovo studente PEGGIORA la bolla esatta e migliora molto il caso peggiore: trade-off, non vittoria.

DUE MIEI ERRORI, SMONTATI QUI
1. Il criterio 'adiacente' non discrimina. La mappa delle bolle ha 1.037.438 adiacenze su 1.306.536
   coppie possibili, il 79,4%: 'cade in una bolla adiacente' accade per caso quattro volte su
   cinque, e il 96-98% misurato e' 1,2 volte il tasso base. Il '100% nel quartiere giusto' del
   ticket 04 era GONFIATO dal grafo denso. I criteri forti sono la propria bolla (0,062% di caso) e
   la bolla non collegata (20,6% di caso).
2. Il fallimento delle serie nel ticket 04 era un ARTEFATTO. Nella Parte B la matrice dei vicini era
   mascherata con Pn = np.where(ha[:, None], Pn, 0.0): le righe delle serie diventavano ZERO, il
   ranking cadeva sui pareggi a -9, cioe' sull'ordine degli indici di catalogo. Per questo le tre
   serie ricevevano gli stessi vicini (Resident Evil, Endgame, Interstellar). Non era lo studente a
   sbagliare: era la mia maschera. La misura vera dice che lo studente dei film applicato alle serie
   NON e' rotto - 35 volte il caso.

CONSEGUENZA, che conferma l'intuizione dell'utente
Le serie sono deboli con ENTRAMBI gli studenti (2%) contro il 27,7% dei film. Quindi la strada
migliore rimasta e' l'appoggio film del ticket 03-bis: la serie atterra presso i film del suo mondo
e da li' si passa alle serie adiacenti. L'impalcatura esiste nel 58,7% dei casi. L'obiezione
dell'utente non solo regge: e' la strada che resta.

Corretto anche il ticket 04, in coda al suo file, con la nota sui due numeri sbagliati.
