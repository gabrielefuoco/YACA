"""anime.py — la maschera di retrieval per gli anime (ticket 11), lato prodotto.

PERCHE' ESISTE. Sulla matrice di transizione i nodi cross-medium servono: sono i ponti che portano da
una serie anime al cinema d'animazione, e senza di loro la diffusione resta chiusa nel recinto. Ma
quando l'utente sta esplorando anime, i **film-appendice** (riassunti, recap, compilation) occupano i
primi posti e sono inutili: chi ha visto la serie non ha bisogno del film riassuntivo.

Il ticket 11 aveva due metà:
  · **mixer** — `--damp-anime-saga` smorza ×0,15 gli archi di saga dentro gli anime. Fatto, misurato:
    nei top-20 dei 30 casi misti le appendici passano da **1,8 a 0,2** per lista.
  · **retrieval** — questa maschera, che agisce DOPO la diffusione, solo quando i semi sono anime.

La regola non tocca il grafo: filtra l'ordine dei candidati e lascia in fondo (non cancella) ciò che
scarta, così una lista magra non collassa.
"""
from __future__ import annotations

import numpy as np

QUOTA_MIN = 0.60      # sotto questa quota di anime nei semi, la maschera non si accende
VOTI_MIN = 50         # un film anime con meno voti e' un'appendice, non un'opera


def quota_anime(semi, anime) -> float:
    """Frazione dei semi che sono anime (0 se non ci sono semi)."""
    semi = np.asarray(list(semi), np.int64)
    if len(semi) == 0:
        return 0.0
    return float(np.asarray(anime, bool)[semi].mean())


def ha_serie_madre(film, visti, coll, is_tv, anime, coll_of_cand):
    """True se `film` condivide la collezione con una serie anime che l'utente NON ha visto.

    E' l'euristica per «film cinematografico di una serie»: stessa collezione TMDB di una serie, e la
    serie non e' nella storia. Se la serie e' stata vista, il film e' un seguito legittimo e resta.
    """
    c = int(coll[film])
    if c <= 0:
        return False
    membri = coll_of_cand.get(c, ())
    for m in membri:
        if m == film:
            continue
        if is_tv[m] and anime[m] and int(m) not in visti:
            return True
    return False


def maschera(cand, semi, *, anime, voti, coll, is_tv, visti, coll_of_cand,
             quota_min=QUOTA_MIN, voti_min=VOTI_MIN):
    """Riordina i candidati: prima gli anime utili, in fondo le appendici.

    Non filtra in modo distruttivo: se restassero meno di 5 titoli, si tiene l'ordine originale con le
    appendici in coda. Ritorna (lista, attiva).
    """
    cand = [int(x) for x in cand]
    if quota_anime(semi, anime) < quota_min:
        return cand, False
    buoni, appendici = [], []
    for x in cand:
        if not anime[x]:
            appendici.append(x)                      # non e' un anime: fuori lista quando si esplora
        elif voti[x] < voti_min:
            appendici.append(x)
        elif ha_serie_madre(x, set(visti), coll, is_tv, anime, coll_of_cand):
            appendici.append(x)
        else:
            buoni.append(x)
    if len(buoni) < 5:
        return cand, True                            # troppo pochi: non si smonta la lista
    return buoni + appendici, True
