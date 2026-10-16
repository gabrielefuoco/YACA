Status: ready-for-agent
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
