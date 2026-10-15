Status: resolved
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

## Esito — il processo e' valido, la metrica no

FATTO (15/10/2026, con la GPU accesa ma inutile: torch e' la build +cpu). Gli embedding delle trame
si fanno con **lo stesso embedder delle keyword** (`BAAI/bge-small-en-v1.5`), si **conservano** e si
**riprendono**: **35.529 trame in 16,5 minuti** a 28 ms l'una, 52 MB in `04-trama-emb.npy` +
`04-trama-idx.npy`. La ripresa ha funzionato al primo colpo.

IL MIO GIUDIZIO NEGATIVO PRECEDENTE ERA UN ARTEFATTO: `trova()` cercava i titoli per sottostringa,
quindi `"Toy Story"` dava *Toy Story 5* e *Gone Girl* / *Fight Club* potevano essere *Umjolo: The Gone
Girl* e *Knuckledust*. Con i film giusti il modello **separa**: simili 0,723, diverse 0,617, caso
peggiore 0,718 contro 0,661.

IL RERANKER E' INUTILIZZABILE: tutti gli score fra 0,000 e 0,004, separazione +0,000. Un cross-encoder
vuole una coppia asimmetrica (domanda/documento), non due trame simmetriche. L'utente era scettico ed
era giusto.

LA METRICA NON DISCRIMINA: Sim_trama V1 0,7437 · V3 0,7480, differenza +0,004 positiva nel 48,5% dei
casi, testa a testa 107 a 100. E i casi che il banco da' SBAGLIATI hanno trame PIU' simili (0,7477)
di quelli giusti (0,7419). Causa geometrica: `bge-small-en` comprime le trame italiane in 0,74 ±
0,01. Servirebbe una similarita' centrata o un modello multilingue, e nessuna delle due e' provata.

VERDETTO SU V3: banco 63,0% contro 35,3%, promozioni 87,3% contro 69,3%, trama pari. **V3 non porta
niente su nessuna misura che generalizzi**: il miglioramento visto sui vicini di *Verity* e' reale ma
LOCALE — un selection effect, l'errore piu' istruttivo della sessione. V1 per la bolla. Per i dieci
titoli resta V3, dichiarato come scelta basata sull'occhio e non sulla media: l'unico punto di questa
sessione senza un numero dietro. Vedi `ricerche/04-trama.md`.

## Storia — rinviato al 15/10/2026, con la GPU

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
