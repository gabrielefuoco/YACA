# gli archi strutturali e il gating

**Status**: `ready-for-agent`
**Type**: `task`
**Blocked by**: 02

Gli archi del titolo nuovo, e il gating del ticket 16.

Un titolo senza comportamento collegato con gli archi strutturali a pieni pesi inquina: il ticket 16
di `grafo-servibile` ha misurato che i metadati ovunque costano **-7,34 al @500**, e il rimedio e'
il gating `lambda(i) = tau0 / (tau0 + d_behav(i))`: l'arco strutturale sopravvive se **almeno un
estremo e' freddo**. Il plateau e' `tau0` in [1, 20], con `tau0 = 5` a +0,25 al @100.

**Cosa fare**
1. Costruire gli archi KW, CAST, DIR, PROD del titolo nuovo (gli stessi componenti, stessa soglia).
2. Applicare il gating e misurare **quanti** archi sopravvivono e verso chi.
3. Verificare che il titolo nuovo non finisca in una bolla per un solo arco forte (il caso
   J.J. Abrams / Star Trek nella bolla Star Wars: la normalizzazione di riga gonfiava l'arco
   solitario, ed e' il difetto D4 corretto in `bolle.py`).

**Criterio di chiusura**
- Gli archi del titolo nuovo sono elencati e leggibili (i primi 20, con il titolo dall'altra parte).
- Il gating e' applicato, e l'effetto misurato sul banco di Verity: la collocazione cambia o no?
