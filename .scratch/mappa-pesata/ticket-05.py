"""ticket-05.py — crea e chiude il ticket 05, e aggiorna la mappa col cambio di rotta.

Il ticket 05 non era in elenco: e' nato da un'obiezione dell'utente su Verity mentre l'effort era
gia' chiuso. Va scritto come ticket perche' e' un lavoro a se', con il suo esito.
"""
import pathlib

D = pathlib.Path(__file__).resolve().parent
ISSUES = D / "issues"

(D / "issues" / "05-il-peso-dei-token-e-perche-verity-sbaglia.md").write_text("""Status: resolved
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
""", encoding="utf-8")
print("  creato e chiuso: 05-il-peso-dei-token-e-perche-verity-sbaglia.md")

m = D / "map.md"
t = m.read_text(encoding="utf-8")
t = t.replace("## Not yet specified", """## Correzione di rotta, 14/10/2026 — il ticket 05

Un'obiezione dell'utente su *Verity* ha aperto un ticket che non era in elenco, e ha cambiato le
conclusioni in tre punti:

1. **Il vettore sbagliava**, e non per colpa del centroide: dominavano il **cast** (Dakota Johnson,
   Anne Hathaway) e le **keyword rare** (`baffled`, `dreary`) con idf quasi massimo. La variante V3
   (df≥3, tetto idf, generi ×1,5, cast ×0,4) è **salvata** in `05-*.npz` e va in produzione.
2. **Il banco non è l'arbitro.** V3 peggiora il banco (32,0% contro 35,3%) e migliora l'occhio: le due
   misure rispondono a domande diverse, e per un titolo **fuori dal grafo** esiste solo la seconda.
3. **La partizione è il limite.** *Verity* resta in bolla 820 anche con V3: i thriller psicologici
   sono **sparsi** in venti bolle. **Quella bolla non esiste**, e RB 200 «frantuma» parlava del numero
   di bolle, non della coerenza dei mondi.

**Il collocatore deve restituire due livelli**: la bolla (macro, per navigare nel grafo) e i 10 titoli
più vicini (micro, per mostrare). Il micro con V3 è già giusto.

## Not yet specified""")
m.write_text(t, encoding="utf-8")
print("  map.md aggiornato")
