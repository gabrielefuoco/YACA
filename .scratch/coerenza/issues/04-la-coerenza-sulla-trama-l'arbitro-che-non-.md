Status: ready-for-agent
Type: task

# 04 — La coerenza sulla trama: l'arbitro che non usa la co-visione

Il §3.1: `V3` usa generi, keyword, cast, registi, reti, case, paesi — **mai il testo della trama**.
Quindi la similarità fra le trame è una misura **indipendente** di qualità semantica, l'unica che
valga anche per un'uscita del 2026.

Da fare, tenendo conto di due ostacoli **misurati** (non ipotizzati):
- l'`overview` manca per il **58,8%** dei film e il **51,5%** delle serie → il campione va dichiarato,
  e il bias (i film senza trama sono i meno noti) va scritto;
- le trame presenti sono **in italiano** e `bge-small-en-v1.5` è un modello **inglese** → prima si
  **misura** se su un testo italiano dà comunque un segnale relativo utile (due trame simili contro
  due a caso), e solo dopo si costruisce la metrica. Se non lo dà, si dice e si propone il modello
  multilingue, invece di produrre numeri che non significano niente.

Poi: `Sim_trama` media fra ogni titolo del banco e i suoi 10 vicini micro, e fra il titolo e il
centroide di trama della bolla predetta — per V1 e per V3, così il disaccordo col banco diventa una
misura e non un sospetto.

Esito: `04-trama.py` (con l'embedding salvato) + `ricerche/04-trama.md`.

## Rinviato al 15/10/2026, con la GPU

Decisione dell'utente: l'embedding delle trame si fa domani, con la GPU accesa, e **per vedere se
serve**. Qui c'e' il disegno e ci sono i due ostacoli gia' misurati:

- l'`overview` manca per il **58,8%** dei film e il **51,5%** delle serie (42,3% di copertura);
- le trame presenti sono **in italiano**, e `bge-small-en-v1.5` — il modello in casa — e' **inglese**:
  sulle sei coppie a risposta nota mette *Gone Girl* a **+0,542** da *Toy Story* e a **+0,487** da
  *Fight Club*. **Non separa**, e l'embedding comprime tutto fra 0,48 e 0,70.

E l'alternativa a costo zero esiste ed e' gia' stata eseguita: il ticket 05 risponde alla stessa
domanda (la bolla scelta assomiglia di piu' al titolo di quella che il banco chiama giusta?) coi soli
**generi e keyword**, senza modelli. Quel risultato c'e' ed e' netto.

Domani, in ordine di costo: (a) il **reranker a coppie** `bge-reranker-v2-m3`, gia' in cache e
multilingue, su ~6.000 coppie e solo CPU — l'arbitro vero, senza embedding del catalogo; (b) l'embedding
completo con la GPU, se il reranker non basta.
