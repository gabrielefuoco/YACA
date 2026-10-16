Status: resolved
Type: bug
Blocked by: 01

# In `pesi.py` il tempo e' invertito: semina dal presente per predire il passato
**Prova** (`graph/measure/pesi.py:74`): `o = np.argsort(eta)` con `eta = adesso - ultima_visione`.
`eta` grande = visto tanto fa = **passato**. Quindi `argsort(eta)` mette **i piu' recenti per primi**,
e `A, Bt = righe[:taglio], righe[taglio:]` (commentato «il passato semina, il futuro e' l'oro») semina
col **presente** e misura sul **passato remoto**. Gli altri arbitri fanno il contrario e giusto:
`cache.py:67`, `freddo.py:71`, `ricetta.py:72` usano `np.argsort(-np.array(eta))`.
**Fix**: `argsort(-eta)`, come gli altri — o meglio, usare `K.storia_trakt(u, ordine="cronologico")`
del ticket 01 e non ordinare piu' a mano.
**Chiuso quando**: `pesi.py` ristampato, e la tabella dei pesi/ha il verso giusto in tutti gli arbitri
(un solo posto decide l'ordine).

---

IL FIX C'E', manca la ristampa. `pesi.py` ora ricava lo split da `eta` (ordine esplicito nel tempo) invece di fidarsi dell'ordine della lista, e i semi restano i piu' recenti DEL PASSATO cosi' «ultimi 15» continua a voler dire quello che dice. NOTA: girare l'ordinamento di `storia()` — come proponeva la revisione — avrebbe rotto `pesi_per`, che legge un PREFISSO. Da ristampare (~3 min).

---

RISTAMPATO il 16/10/2026, ~2 min. Con lo split temporale VERO la tabella cambia e **conferma meglio di prima perche' la SPEC utente non nasce dal lift**: uniforme 14,7x · ri-visioni 18,1x · lineare toppato 20 21,2x · **SPEC utente 16,8x** · 15 a caso peso pieno 68,5x · nullo 1,4x. I pesi che sembrano migliori sono quelli che sovrappesano le serie lunghe, cioe' il LEAKAGE delle serie in corso: la decisione era stata presa su `equilibrio.py` (il seme: dal 67% al 31% di peso alle serie per un cinefilo), non sul lift — e adesso si vede perche' era la strada giusta. Le serie hanno mediana plays 12 contro 1 dei film (p99 320 contro 5): `plays` non e' confrontabile fra i medium, che e' esattamente il motivo della formula a frazione di episodi.
