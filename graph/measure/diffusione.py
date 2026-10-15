"""diffusione.py — la diffusione dell'influenza: seleziona, o allaga?

ARBITRO NUOVO, 15/10/2026. Nasce da una domanda del proprietario: «un meccanismo di diffusione
dell'influenza con decadimento in base al peso degli archi e al numero di hop: certe bolle verranno
accese con un certo peso». Prima di decidere il decadimento, gli hop e la normalizzazione, questo
arbitro misura se la diffusione **distingue** o se accende tutto.

Quattro misure, e ognuna puo' uccidere l'idea:

1. **I gradi**: se la mediana e' alta, il grafo e' denso e ogni nodo tocca tutto in pochi passi.
2. **La raggiungibilita'** a 1, 2, 3, 4 hop da un nodo mediano: se a due hop si e' gia' toccato
   mezzo catalogo, allora «il numero di hop» non e' un parametro, e' una formalita'.
3. **La concentrazione della massa**: dopo una diffusione con restart da uno storico realistico,
   quanta massa sta nei primi 100 titoli? Quanta sul resto? Una diffusione che finisce piatta
   restituisce lo stesso ordine per tutti.
4. **L'attivazione per bolla, e la taglia**: la massa per bolla e' una somma sui membri, quindi le
   bolle grandi assorbono di piu' per costruzione. Qui si misura quanto, e si confronta la massa
   grezza con la massa per membro — perche' e' la differenza che decide come normalizzare.

Il grafo non cambia: si legge il triangolo e la partizione, non si scrive niente.
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K
from graph import parametri as P

T0 = time.time()
ALPHA = P.ALPHA        # il restart: la quota di massa che torna ai semi ad ogni giro
ITER = P.ITER
TOP = 100


def carica():
    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()                      # il triangolo e' meta' grafo: si ricompone
    mem = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    return Ws, mem, N


def gradi(Ws, N):
    deg = np.asarray((Ws > 0).sum(1)).ravel().astype(float)
    q = np.percentile(deg, [50, 90, 99, 99.9])
    print("=" * 100)
    print("1. I GRADI — quanto e' denso il grafo su cui si cammina")
    print("=" * 100)
    print(f"   titoli {N:,} · archi {Ws.nnz:,} · densita' {100*Ws.nnz/(N*(N-1)):.3f}%")
    print(f"   grado: mediano {q[0]:.0f} · p90 {q[1]:.0f} · p99 {q[2]:.0f} · p99.9 {q[3]:.0f} "
          f"· massimo {deg.max():.0f}")
    print(f"   nodi con grado 0: {(deg == 0).sum():,} · con grado > 1000: {(deg > 1000).sum():,}")
    print(f"   meta' degli archi sta nei nodi col grado sopra: "
          f"{np.sort(deg)[::-1][:int(N*0.01)].sum()/deg.sum()*100:.0f}% (l'1% piu' connesso)")
    return deg


def raggiungibilita(Ws, N, reins):
    from scipy.sparse import csgraph
    A = (Ws > 0).astype(np.int8)
    print("\n" + "=" * 100)
    print("2. LA RAGGIUNGIBILITA' — il numero di hop e' un parametro o una formalita'?")
    print("=" * 100)
    for etichetta, r in reins:
        d = csgraph.dijkstra(A, indices=r, unweighted=True, directed=False)
        riga = " · ".join(f"{h} hop {int((d <= h).sum()):>7,} ({100*(d <= h).mean():>5.1f}%)"
                          for h in (1, 2, 3, 4) if True)
        print(f"   {etichetta:<26} {riga}")
    print(f"   (su {N:,} titoli: se a 2 hop si tocca mezzo catalogo, l'ordine degli hop non "
          f"distingue niente)")


def diffondi(Ws, seme, alpha=ALPHA, iters=ITER):
    """PageRank personalizzato: r = alpha*e + (1-alpha)*r*P, con P riga-stocastica."""
    deg = np.asarray(Ws.sum(1)).ravel().astype(np.float64)
    deg[deg <= 0] = 1.0
    P = sp.diags(1.0 / deg) @ Ws
    e = np.zeros(Ws.shape[0], np.float64)
    e[seme] = 1.0 / len(seme)
    r = e.copy()
    for _ in range(iters):
        r = alpha * e + (1 - alpha) * (r @ P)
    return r


def concentrazione(r, seme, mem, sz):
    ordine = np.argsort(-r)
    tot = r.sum()
    fuori = np.setdiff1d(ordine, seme, assume_unique=False)[:TOP]
    su_semi = r[seme].sum() / tot
    print(f"   massa che resta sui semi       {100*su_semi:>6.1f}%")
    print(f"   massa nei primi {TOP} titoli nuovi  {100*r[fuori].sum()/tot:>6.1f}%")
    print(f"   titoli che prendono >0,1%      {int((r > 0.001*tot).sum()):>7,}")
    print(f"   titoli che prendono >0,01%     {int((r > 0.0001*tot).sum()):>7,}")
    nb = np.bincount(mem, weights=r, minlength=len(sz))
    att = nb / tot
    vb = np.argsort(-att)[:8]
    print(f"   bolle con attivazione >0,5%    {int((att > 0.005).sum()):>7,} su {len(sz):,}")
    print(f"   {'bolla':>6} {'attiv.':>8} {'per membro':>11} {'titoli':>7}   x taglia")
    for b in vb:
        per = att[b] / max(sz[b], 1)
        print(f"   {b:>6} {100*att[b]:>7.2f}% {per*1e5:>10.2f}e-5 {int(sz[b]):>7}   "
              f"{'GRANDE' if sz[b] > 100 else ''}")
    return att


def quanto_storico(Ws, mem, sz, quanti_utenti=12):
    """Quante visioni servono perche' il portafoglio si stabilizzi?

    E' il `todo/8` misurato DENTRO il meccanismo nuovo: il prodotto prende i 15 titoli piu' recenti e
    butta il resto (`SEED_SIGNAL_LIMITS.watched = 15`). Con la sonda della cronologia quel tetto
    rendeva identiche le liste di chi ha visto 50 e 100 titoli. Qui la domanda e' un'altra e piu'
    concreta: **se il seme sono i 15 piu' recenti invece di tutta la storia, il portafoglio di mondi
    cambia?** Se non cambia, il tetto non costa niente a questo meccanismo e la sua urgenza scende.

    Utenti veri da MovieLens (>= 100 film), mappati sulle righe del grafo come fa `canon.banco_prodotto`.
    """
    import pandas as pd
    links = pd.read_csv(K.ML / "ml-32m" / "links.csv")
    m2r = {}
    for mid, tid in zip(links["movieId"], links["tmdbId"]):
        if pd.isna(tid):
            continue
        r = B.ROW_OF.get(f"movie:{int(tid)}")
        if r is not None:
            m2r[int(mid)] = r

    # DAL GREZZO, NON DA `ratings-puliti.parquet`. Il file pulito ha DUE colonne sole
    # (`userId`, `movieId`): niente `rating`, niente `timestamp`. Quindi da lui non si puo' sapere
    # quali sono «i 15 piu' recenti» — e la ricetta del senior, che lo descriveva come
    # `ratings.csv` filtrato con la colonna `timestamp`, era una ricostruzione parziale. Il grezzo
    # (836 MB) ha tutto, e si legge una volta sola.
    rr = pd.read_csv(K.ML / "ml-32m" / "ratings.csv",
                     usecols=["userId", "movieId", "rating", "timestamp"])
    n0, u0 = len(rr), rr.userId.nunique()
    rr = rr[rr.rating >= 3.5]
    cnt = rr.groupby("userId").size()
    rr = rr[rr.userId.isin(cnt[cnt >= 20].index)]
    print(f"\n   LA RICETTA, verificata contro il file che esiste (31.652.632 righe · 200.948 utenti):")
    print(f"     grezzo {n0:,} righe · {u0:,} utenti")
    print(f"     voti >= 3.5 e utenti con >= 20 film: {len(rr):,} righe · {rr.userId.nunique():,} "
          f"utenti — {'COINCIDE' if abs(len(rr)-31652632) < 200000 else 'NON COINCIDE'}")
    rr["row"] = rr.movieId.map(m2r)
    rr = rr[rr.row.notna()]
    rr["row"] = rr["row"].astype(np.int64)
    cnt = rr.groupby("userId").size()
    buoni = cnt[cnt >= 100].index.values
    utenti = np.random.default_rng(5).choice(buoni, size=quanti_utenti, replace=False)

    K_SEMI = (15, 30, 50, 10**9)
    jac = {k: [] for k in K_SEMI if k != 10**9}
    testa = {k: [] for k in K_SEMI}
    mondi = []
    sopra = []
    jac_controllo = []
    jac_50 = []
    for u in utenti:
        g = rr[rr.userId == u].sort_values("timestamp")
        storia = g["row"].values[::-1]                  # i piu' recenti per primi
        mondi.append(len(set(mem[storia].tolist())))
        portafogli = {}
        for k in K_SEMI:
            seme = storia[:k]
            if len(seme) < 3:
                continue
            r = diffondi(Ws, seme)
            nb = np.bincount(mem, weights=r, minlength=len(sz))
            nb = nb / nb.sum()
            testa[k].append(float(nb.max()))
            if k == 10**9:
                sopra.append(int((nb > 0.005).sum()))
            portafogli[k] = set(np.argsort(-nb)[:10].tolist())
            portafogli[k + 1000000] = set(np.argsort(-nb)[:50].tolist())

        # IL CONTROLLO: due meta' a caso della STESSA storia. Se il Jaccard fra loro e' basso quanto
        # quello fra i 15 e la storia intera, allora l'instabilita' e' intrinseca — il vertice della
        # classifica e' piatto — e il tetto non c'entra niente.
        if len(storia) >= 40:
            m = np.random.default_rng(3).permutation(len(storia))
            meta = (storia[m[:len(storia)//2]], storia[m[len(storia)//2:]])
            top = []
            for h in meta:
                r = diffondi(Ws, h)
                nb = np.bincount(mem, weights=r, minlength=len(sz))
                top.append(set(np.argsort(-(nb/nb.sum()))[:10].tolist()))
            jac_controllo.append(len(top[0] & top[1]) / len(top[0] | top[1]))
        base = portafogli.get(10**9)
        base50 = portafogli.get(10**9 + 1000000)
        if base:
            for k in jac:
                if k in portafogli:
                    jac[k].append(len(base & portafogli[k]) / len(base | portafogli[k]))
                    jac_50.append(len(base50 & portafogli[k + 1000000]) /
                                  len(base50 | portafogli[k + 1000000]))

    print("\n" + "=" * 100)
    print("5. QUANTO STORICO SERVE — e quanto costa il tetto dei 15 (`todo/8`)")
    print("=" * 100)
    print(f"   {len(utenti)} utenti MovieLens con >= 100 film · mappati sulle righe del grafo")
    print(f"   mondi toccati dalla storia intera: mediana {int(np.median(mondi))} "
          f"(min {min(mondi)}, max {max(mondi)})")
    print(f"   bolle sopra lo 0,5% con la storia intera: mediana {int(np.median(sopra))}")
    print(f"\n   {'semi':>6} {'bolla di testa':>15} {'Jaccard 10 mondi':>18} {'Jaccard 50 mondi':>18}")
    for k in K_SEMI:
        et = "tutta" if k == 10**9 else str(k)
        j = f"{np.median(jac[k]):.2f}" if k in jac and jac[k] else "—"
        jb = "—"
        print(f"   {et:>6} {100*np.median(testa[k]):>14.1f}% {j:>18} {jb:>18}")
    print(f"\n   CONTROLLO — meta' contro meta' della stessa storia: Jaccard dei 10 mondi di testa "
          f"{np.median(jac_controllo):.2f}" if jac_controllo else "")
    print("\n   lettura: il Jaccard dei 15 va confrontato col CONTROLLO, non con 1,00. Un vertice piatto")
    print("   e' instabile per natura: se le due meta' di una storia vera si accordano quanto i 15")
    print("   con la storia intera, allora il tetto non e' la causa dell'instabilita'.")


def main():
    Ws, mem, N = carica()
    sz = np.bincount(mem)
    deg = gradi(Ws, N)

    ordine = np.argsort(deg)
    mediano = int(ordine[int(N * 0.5)])
    hub = int(np.argmax(deg))
    raggiungibilita(Ws, N, [("un nodo mediano", mediano), ("il nodo piu' connesso", hub)])

    # due storici realistici: uno COERENTE (10 titoli dalla stessa bolla) e uno DISPERSO
    print("\n" + "=" * 100)
    print("3-4. LA DIFFUSIONE — da uno storico coerente e da uno disperso")
    print("=" * 100)
    # la bolla che contiene Gone Girl (il canone del thriller psicologico, 12 titoli)
    TIT = {}
    import pandas as pd
    for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
        for i, t in zip(d["id"], d[col]):
            r = B.ROW_OF.get(f"{typ}:{int(i)}")
            if r is not None:
                TIT[r] = str(t)
    gol = next((r for r, t in TIT.items() if t.startswith("L'amore bugiardo")), None)
    b_thriller = int(mem[gol]) if gol is not None else None
    print(f"   bolla di riferimento (Gone Girl): {b_thriller} · {int(sz[b_thriller])} titoli")

    rng = np.random.default_rng(7)
    m_thr = np.where(mem == b_thriller)[0]
    seme_coerente = rng.choice(m_thr, size=min(10, len(m_thr)), replace=False)
    seme_disperso = rng.choice(N, size=10, replace=False)
    print(f"   seme coerente : {[TIT.get(int(x), '?')[:22] for x in seme_coerente[:4]]}...")
    print(f"   seme disperso : {[TIT.get(int(x), '?')[:22] for x in seme_disperso[:4]]}...")

    quanto_storico(Ws, mem, sz)

    for nome, seme in (("COERENTE (10 dalla stessa bolla)", seme_coerente),
                       ("DISPERSO (10 a caso)", seme_disperso)):
        r = diffondi(Ws, seme)
        print(f"\n   --- {nome}")
        concentrazione(r, seme, mem, sz)

    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()