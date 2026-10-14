Status: resolved
Type: task

# 05 — Il peso dei token, e perché Verity sbaglia

Nato da un'obiezione dell'utente (14/10/2026) mentre l'effort era già chiuso: *«Verity non c'entra
niente con Fight Club, Inception. Magari con Gone Girl sì, ma non è nella bolla giusta: è un thriller
psicologico con qualche jump scare e tensione costante.»*

Il collocatore l'aveva messa nella bolla 820 (Inception, Fight Club, Gone Girl, Shutter Island, Seven,
The Truman Show, Eiffel) con coseno **0,069** — sotto la soglia di 0,08 che la mia stessa taratura
definiva «ipotesi, non risposta». Due errori: il metodo ha sbagliato, e io ho letto il punteggio come
se fosse un voto.

Da fare:
1. capire **dove** sta il difetto: nel vettore, nel centroide, o nella bolla;
2. misurare le varianti sul banco dei 600, **non** a intuito;
3. decidere cosa va in produzione, e dirlo anche se contraddice i numeri precedenti.

## Esito

**Il difetto è doppio e nessuno dei due è nel centroide.** Il vettore di Verity era dominato (a) dal
**cast** — i vicini erano *Cinquanta sfumature di grigio* (Dakota Johnson) e *WeCrashed* (Anne
Hathaway) — e (b) dalle **keyword rare** (`baffled`, `dreary`, `tragic`, df 1-3, idf quasi massimo,
che battevano `psychological thriller`). I 25 vicini stavano in **24 bolle diverse**: il segnale
puntava in ventiquattro direzioni.

Sei varianti misurate sul banco (LOO esatto): V0 35,3% · V1 (df≥3) 35,2% · V2 (+tetto idf) 35,2% ·
**V3 (+pesi per tipo) 32,0%** · V4 (V3 senza cast) 32,0% · V5 (generi ×2,5) 30,5%.

Due letture: **V4 = V3**, quindi togliere il cast non cambia nulla e la mia diagnosi «Dakota Johnson»
spiegava un caso, non il metodo; e **le correzioni che guariscono Verity peggiorano il banco di 3,3
punti**, quindi fermarsi al numero avrebbe scartato la variante giusta.

All'occhio V3 è **chiaramente meglio**: *Gone Girl* passa da *The Leftovers* e un game show con Neil
Patrick Harris a *Due tombe*, *Lacrime di sangue*, *Disappearance*; *Shutter Island* da *The Wolf of
Wall Street* a *Il collezionista*, *Stonehearst Asylum*, *Verónica*.

**I due numeri misurano due domande diverse**: il banco chiede «atterra dove la co-visione l'aveva
messo?», che per un titolo **fuori dal grafo** non esiste; l'occhio chiede «sono lo stesso genere di
film?», ed è l'unica domanda che si possa fare su un film del 2026. **Per il prodotto V3 è giusta, e
il 35,3% non era la misura del suo lavoro.**

E **Verity resta in bolla 820 anche con V3** (coseno 0,107, sopra soglia): la bolla 820 è un
«prestigio contorto», e i thriller psicologici della stessa famiglia sono **sparsi** in venti bolle
(*Body of Evidence* in 551, *Due tombe* in 930, *Disappearance* in 776, *Il collezionista* in 505).
**Quella bolla non esiste**, e il difetto è nella **partizione**, non nel vettore né nel centroide.
RB 200 «frantuma» parlava del numero complessivo di bolle, non della coerenza dei singoli mondi.

**Conseguenza:** il collocatore deve restituire **due livelli** — la bolla per navigare (macro) e i
10 titoli più vicini per mostrare (micro). Fonderli in una scelta sola è l'errore che ha prodotto
l'obiezione.
