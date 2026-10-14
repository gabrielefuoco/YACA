"""03-contratti.py — TICKET 03: i contratti, e il retro-test sui sei artefatti.

Un contratto che non fallisce su un bug VERO non e' un contratto. Qui i sei artefatti del progetto
vengono riprodotti in piccolo, e per ciascuno si guarda quale `assert` lo ferma. Dove nessuno lo
ferma, il contratto e' incompleto e va detto — non aggirato.

I sei (dalla lista di §4 dell'esperto):
  1. il teacher nullo del report 58        -> `Cf` con le 16.550 serie a zero, argsort su tutti pari
  2. il riferimento del report 41          -> modello addestrato sulla matrice sbagliata
  3. l'inversione di `verifica-popolare.py`-> `argsort(argsort(voti))` e' ASCENDENTE
  4. `row < col` su matrice asimmetrica    -> il difetto D2 di `07-componenti.py:309`
  5. la maschera `Pn = 0.0` sulle serie    -> le righe delle serie a zero, rango sui pareggi
  6. il tasso base del 79,4%               -> adiacenza fra bolle letta come risultato

L'esito onesto ha due parti: quanti ne fermano i contratti, e **cosa manca** per gli altri.
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

T0 = time.time()
ESITI = []


def prova(nome, contratto, azione, atteso=True):
    """Esegue `azione` e guarda se solleva. `atteso=True` significa: il contratto DEVE fermarlo."""
    try:
        azione()
        esito = "NON FERMATO"
    except AssertionError as e:
        esito = f"fermato ({str(e).splitlines()[0][:70]}...)" if len(str(e)) > 70 else f"fermato ({e})"
    fermato = esito != "NON FERMATO"
    ok = "OK " if fermato == atteso else "!! "
    print(f"\n  {ok}[{nome}]\n     contratto: {contratto}\n     {esito}")
    ESITI.append((nome, contratto, fermato, atteso))
    return fermato


print("=" * 100)
print("RETRO-TEST — I SEI ARTEFATTI DEL PROGETTO CONTRO I CONTRATTI")
print("=" * 100, flush=True)

# ================================================================ 1. il teacher nullo (report 58)
print("\n1. IL TEACHER NULLO (report 58)")
print("   `Cf` aveva le 16.550 serie tutte a zero, e le 249 sorgenti del gold sono tutte serie.")
print("   La fusione per ranghi con quella matrice produceva il 22,65% @10 celebrato dal report.")
rng = np.random.default_rng(7)
S_nullo = np.zeros((500, 3), np.float32)
prova("teacher nullo", "anti-pareggio (colonne)", lambda: K.ranghi(S_nullo))

S_quasi = rng.random((500, 3), dtype=np.float32)
S_quasi[100:, :] = 1.0            # 400 righe con lo stesso punteggio: il top-50 e' tutto 1.0
prova("classifica a meta' pareggiata", "anti-pareggio (pareggi in testa)", lambda: K.ranghi(S_quasi))
S_sparsa = np.zeros((500, 3), np.float32)
S_sparsa[:3, :] = rng.random((3, 3))
print("\n   CONTROPROVA, e va detta: una classifica SPARSA ma legittima (solo 3 titoli con un")
print("   punteggio, 497 a zero) NON viene fermata. Non e' un difetto del contratto: solo il")
print("   chiamante sa quanti candidati dovrebbero avere un punteggio. Per questo la copertura")
print("   si STAMPA invece di imporla, e l'assert guarda i pareggi IN TESTA.")
try:
    K.ranghi(S_sparsa)
    print("   confermato: non fermata (e' giusto cosi')")
except AssertionError as e:
    print(f"   fermata: {e}")

# ================================================================ 5. la maschera sulle serie
print("\n5. LA MASCHERA `Pn = 0.0` SULLE SERIE (effort `inserimento`)")
print("   Il ranking cadeva sui pareggi a -9, cioe' sull'ordine degli indici di catalogo.")
S_mask = rng.random((400, 500), dtype=np.float32) + 1.0
S_mask[300:, :] = 0.0           # 100 sorgenti serie mascherate: righe costanti
prova("maschera Pn=0.0", "anti-pareggio (righe)", lambda: K.ranghi(S_mask))

# ================================================================ 3. l'inversione di verifica-popolare
print("\n3. L'INVERSIONE DI `verifica-popolare.py`")
print("   `np.argsort(np.argsort(v))` da' il rango ASCENDENTE: rango 0 al valore piu' piccolo.")
print("   Il rango crescente e' una funzione CRESCENTE dei voti: e' l'ORDINE DI PRESENTAZIONE")
print("   che si rovescia, non la correlazione del rango. Il primo tentativo di contratto misurava")
print("   la cosa sbagliata e dava il via libera al bug: e' scritto nella sua docstring.")
voti = np.array([100, 50, 10, 5, 1, 900, 300], float)
prova("popolarita' invertita", "contratto di verso",
      lambda: K.assert_ordine(np.argsort(voti), voti, "popolarita'"))
prova("popolarita' giusta", "contratto di verso",
      lambda: K.assert_ordine(np.argsort(-voti), voti, "popolarita'"), atteso=False)

# ================================================================ 4. row < col su matrice asimmetrica
print("\n4. `row < col` SU MATRICE ASIMMETRICA (difetto D2, `07-componenti.py:309`)")
n = 300
r = rng.integers(0, n, 4000)
c = rng.integers(0, n, 4000)
w = rng.random(4000).astype(np.float32)
A = sp.csr_matrix((w, (r, c)), shape=(n, n)).tocsr()
prova("matrice asimmetrica", "contratto di simmetria", lambda: K.assert_simmetrica(A, "M grezza"))
As = ((A + A.T) * 0.5).tocsr()
prova("matrice simmetrizzata, triangolo", "contratto di simmetria",
      lambda: K.assert_simmetrica(As, "M simmetrica"), atteso=False)
# il danno vero di D2: leggere il triangolo di una matrice asimmetrica cambia i pesi
msk = A.tocoo()
sup = A.tocoo()
m1 = (msk.row < msk.col)
m2 = (sup.row < sup.col)
print(f"     il danno: archi nel triangolo superiore da A {int(m1.sum()):,} · "
      f"archi che esistono SOLO sotto la diagonale {int((~m1).sum()):,}")
print(f"     quei {int((~m1).sum()):,} archi, letti dal triangolo, spariscono: e' il difetto D2.")

# ================================================================ 2. il riferimento del report 41
print("\n2. IL RIFERIMENTO DEL REPORT 41")
print("   Una correlazione di 0,24 letta come «lo spazio CFst e' rumore». Ma un modello con")
print("   ||coef|| = 11,39 su ingressi in [0,1] non trasforma 1e-7 in 0,58.")
X = rng.random((2000, 40))
vero = X[:, 0] * 2.0 - X[:, 1] + 0.3 * rng.random(2000)
sbagliato = rng.random(2000) * 0.5 + vero.mean()      # addestrato sulla matrice sbagliata
prova("modello sbagliato", "contratto di scala",
      lambda: K.assert_modello(vero, sbagliato, "CFst", coef_norma=11.39))
giusto = vero + 0.05 * rng.random(2000)
prova("modello giusto", "contratto di scala",
      lambda: K.assert_modello(vero, giusto, "CFst", coef_norma=11.39), atteso=False)

# ================================================================ 6. il tasso base del 79,4%
print("\n6. IL TASSO BASE DEL 79,4% (mappa delle bolle)")
print("   «Il 100% nel quartiere giusto» su un grafo con il 79,4% di coppie adiacenti.")
n_bolle = 1617
giochi = 160
adj = np.zeros(giochi, bool)
adj[:int(0.794 * giochi)] = True        # 127 su 160 coppie adiacenti: il tasso base
K.stampa_tasso("adiacenza, come l'abbiamo letta", adj)
h, hc, lift, kap = K.tasso_base(adj)
print(f"     -> lift {lift:.2f}x: quel «100%» valeva 1,2 volte il caso. Lo dice `stampa_tasso`,")
print(f"        non un assert: il contratto qui e' la CONVENZIONE di non stampare mai una")
print(f"        percentuale senza il suo caso.")
print(f"     i 1.037.438 archi su {n_bolle*(n_bolle-1)//2:,} coppie possibili sono il {100*0.794:.1f}%")

# ================================================================ verdetto
print("\n" + "=" * 100)
print("VERDETTO")
print("=" * 100)
fermati = [e for e in ESITI if e[2] and e[3]]
mancati = [e for e in ESITI if not e[2] and e[3]]
falsi = [e for e in ESITI if e[2] and not e[3]]
print(f"  casi che il contratto DEVE fermare: {len([e for e in ESITI if e[3]])}")
print(f"  fermati: {len(fermati)} · mancati: {len(mancati)} · falsi allarmi: {len(falsi)}")
for nome, contratto, fermato, atteso in ESITI:
    if not atteso:
        stato = "nessun allarme (giusto)" if not fermato else "ALLARME INDEBITO"
    else:
        stato = "fermato" if fermato else "NON FERMATO"
    print(f"    {nome:<38} {contratto:<26} {stato}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
