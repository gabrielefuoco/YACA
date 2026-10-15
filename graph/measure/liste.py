"""liste.py — le liste candidate, con dentro i titoli veri.

PERCHE' ESISTE. La voce 5 della mappa («i tipi di lista») e' una decisione di prodotto, e non si prende
alla cieca: qui si stampa, per utenti veri, **cosa conterrebbe ogni lista candidata**. Il proprietario
guarda e sceglie. Non si misura niente: si legge.

LE CANDIDATE, tutte costruite dallo stesso portafoglio (nessuna richiede di ri-costruire il grafo):

  1. IL TUO MONDO        i membri della bolla piu' accesa, non ancora visti, per attivazione
  2. UN PASSO FUORI      i membri dei mondi vicini sulla mappa
  3. I CAPOLAVORI        dal mondo + quartiere, quelli sopra la mediana dei voti del mondo
  4. LA NICCHIA          gli stessi, sotto la mediana
  5. LE SAGHE            i fratelli TMDB dei titoli accesi — anche se quella bolla non e' accesa
  6. LE USCITE NUOVE     le uscite 2025-2026 che la PORTA D'INGRESSO colloca nei mondi accesi

    python graph/measure/liste.py
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import camminata as _cam
from graph import canon as K
from graph import parametri as P

T0 = time.time()
ALPHA = P.ALPHA
K_POTA = P.POTA_PER_RIGA
EMIVITA = 365.0
QUANTI = 6


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def storia(u):
    righe, plays, eta = [], [], []
    for tipo in ("movie", "show"):
        p = K.TK / f"{tipo}-{u}.json"
        if not p.exists():
            continue
        j = json.load(open(p, encoding="utf-8"))
        for voce in (j["list"] if isinstance(j, dict) else j):
            ids = (voce.get(tipo) or {}).get("ids") or {}
            tmdb = ids.get("tmdb")
            if tmdb is None:
                continue
            r = B.ROW_OF.get(f"{'tv' if tipo == 'show' else 'movie'}:{int(tmdb)}")
            if r is None:
                continue
            try:
                g = (pd.Timestamp.now(tz="UTC") - pd.Timestamp(voce.get("last_watched_at"))).days
            except Exception:
                g = 3650
            righe.append(r)
            plays.append(int(voce.get("plays") or 1))
            eta.append(g)
    return np.array(righe, np.int64), np.array(plays, np.float64), np.array(eta, float)


def main():
    print("=" * 108)
    print("LE LISTE CANDIDATE, CON DENTRO I TITOLI VERI — α = 0,60")
    print("=" * 108, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Wp = pota((W + W.T).tocsr(), K_POTA)
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    SZ = np.bincount(MEM)
    deg = np.asarray(Wp.sum(1)).ravel()
    deg[deg <= 0] = 1
    Pp = sp.diags(1.0 / deg) @ Wp
    M = np.load(K.A("mappa-finale-6-2.npz"), allow_pickle=True)
    INTRA = M["intra"]
    TIT = np.array([""] * N, dtype=object)
    VOT = np.zeros(N)          # vote_count
    VAVE = np.zeros(N)         # vote_average: i VOTI ALTI della nicchia di qualita'
    POP = np.zeros(N)          # popularity: la soglia del prodotto e' su questa
    ANNO = np.zeros(N)
    COLL = {}
    for tipo, f, col, dcol in (("movie", "movies.parquet", "title", "release_date"),
                               ("tv", "tv.parquet", "name", "first_air_date")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f)
        for k in range(len(d)):
            riga = d.iloc[k]
            r = B.ROW_OF.get(f"{tipo}:{int(riga['id'])}")
            if r is None:
                continue
            TIT[r] = str(riga[col])
            v = riga.get("vote_count")
            VOT[r] = float(v) if v is not None and not pd.isna(v) else 0.0
            a2 = riga.get("vote_average")
            VAVE[r] = float(a2) if a2 is not None and not pd.isna(a2) else 0.0
            p2 = riga.get("popularity")
            POP[r] = float(p2) if p2 is not None and not pd.isna(p2) else 0.0
            a = str(riga.get(dcol) or "")[:4]
            ANNO[r] = float(a) if a.isdigit() else 0.0
            if tipo == "movie" and "collection_id" in d.columns:
                cid = riga.get("collection_id")
                if cid is not None and not pd.isna(cid):
                    COLL.setdefault(int(cid), []).append(int(r))
        print(f"  {tipo}: letto ({time.time()-T0:.0f}s)", flush=True)
    COLL = {k: v for k, v in COLL.items() if len(v) >= 2}
    # IL SEGNALE «ALTRI UTENTI»: la componente di Trakt-liste. Copre il 15% del catalogo (grado
    # mediano 0): serve come CORROBORAZIONE, e la sua assenza NON e' un difetto da imputare.
    _z = np.load(K.A("nuovo-LIST.npz"))
    _n = len(_z["indptr"]) - 1
    LISTDEG = np.asarray((sp.csr_matrix((_z["data"], _z["indices"], _z["indptr"]),
                                       shape=(_n, _n)) > 0).sum(1)).ravel().astype(float)
    POP_CAP = P.NICCHIA_POPOLARITA_MAX      # la soglia e' quella del PRODOTTO, non una nostra
    VOTO_BUONO = P.NICCHIA_VOTO_MIN
    VOTMED = np.array([np.median(VOT[MEM == b]) if (MEM == b).any() else 0 for b in range(NB)])

    def ppr(seme, pesi, iters=20):
        e = np.zeros(N, np.float64)
        e[seme] = pesi / pesi.sum()
        r = e.copy()
        for _ in range(iters):
            r = ALPHA * e + (1 - ALPHA) * (r @ Pp)
        return r

    def top(b, r, quanti=QUANTI, escludi=None):
        m = np.where(MEM == b)[0]
        if escludi is not None:
            m = np.setdiff1d(m, escludi)
        return m[np.argsort(-r[m])][:quanti]

    def mostra(nome, membri, nota=""):
        if len(membri) == 0:
            print(f"    {nome:<22} —  (vuota)")
            return
        righe = " · ".join(f"{TIT[x][:26]} ({int(ANNO[x])}, {int(VOT[x]):,})" for x in membri)
        print(f"    {nome:<22} {riga if False else righe}\n{' ' * 26}{nota}")

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(5).choice(pool, size=40, replace=False)
    scelti = []
    for u in utenti:
        rr, pp, _ = storia(u)
        if len(rr) >= 40:
            scelti.append(u)
        if len(scelti) == 2:
            break

    for u in scelti:
        rr, plays, eta = storia(u)
        pesi = np.minimum(plays, 3.0)          # il peso dei FILM (le serie hanno la spec, qui basta)
        r = ppr(rr, pesi)
        tot = r.sum()
        att = np.bincount(MEM, weights=r, minlength=NB) / tot
        o = np.argsort(-att)
        b1 = int(o[0])
        vicini = [int(x) for x in INTRA[b1] if x >= 0][:3]
        print("\n" + "=" * 108)
        print(f"UTENTE {u} — {len(rr)} titoli · mondo di testa {b1} ({int(SZ[b1])} titoli, "
              f"acceso {100*att[b1]:.1f}%, voti mediani {VOTMED[b1]:,.0f})")
        print("=" * 108)
        print("  storia (i 8 visti piu' pesanti):")
        for i in np.argsort(-pesi)[:8]:
            print(f"    {TIT[rr[i]][:40]:<42} mondo {int(MEM[rr[i]]):>4}")
        print("\n  LE LISTE CANDIDATE:")
        w1 = top(b1, r, escludi=rr)
        print(f"    1. IL TUO MONDO       ({len(w1)} di {int(SZ[b1])} titoli, i non visti)")
        print("       " + " · ".join(f"{TIT[x][:26]} ({int(ANNO[x])})" for x in w1))
        quart = np.concatenate([top(b, r, 5, escludi=rr) for b in vicini]) if len(vicini) else np.array([])
        print(f"    2. UN PASSO FUORI     (dai mondi {vicini})")
        print("       " + " · ".join(f"{TIT[x][:26]}" for x in quart[:10]))
        tutti = np.concatenate([[x for x in w1], quart])
        sopra = [x for x in tutti if VOT[x] >= VOTMED[b1]]
        sotto = [x for x in tutti if 0 < VOT[x] < VOTMED[b1]]
        print(f"    3. I CAPOLAVORI       (voti sopra la mediana del mondo, {int(VOTMED[b1]):,})")
        print("       " + " · ".join(f"{TIT[x][:26]} ({int(VOT[x]):,})" for x in sopra[:8]))
        print(f"    4. LA NICCHIA         (sotto la mediana)")
        print("       " + " · ".join(f"{TIT[x][:26]} ({int(VOT[x]):,})" for x in sotto[:8]))
        saghe = []
        for x in tutti[:20]:
            for cid, membri in COLL.items():
                if int(x) in membri:
                    saghe.extend([y for y in membri if y not in tutti and y not in rr])
        if saghe:
            print(f"    5. LE SAGHE           (i fratelli TMDB dei titoli accesi)")
            print("       " + " · ".join(f"{TIT[x][:26]} ({int(ANNO[x])})" for x in sorted(set(saghe))[:8]))
        else:
            print(f"    5. LE SAGHE           —  (nessun titolo acceso ha una saga)")
        nuove = [x for x in range(N) if ANNO[x] >= P.USCITE_NUOVE_DAL and x not in rr and int(MEM[x]) in
                 set([b1] + vicini)]
        if nuove:
            print(f"    6. LE USCITE NUOVE    (2025-2026 gia' dentro i mondi accesi)")
            print("       " + " · ".join(f"{TIT[x][:26]} ({int(ANNO[x])})" for x in nuove[:8]))
        else:
            print(f"    6. LE USCITE NUOVE    —  (nessuna uscita 2025+ in questi mondi: servirebbe")
            print(f"                            la porta d'ingresso per collocarle)")
        # 7. LA NICCHIA DI QUALITA' (aggiunta del proprietario): NON iper-popolare ma ben votata, e
        # meglio se corroborata dalle liste di altri utenti. La soglia di popolarita' e' QUELLA DEL
        # PRODOTTO, cosi' non se ne inventa una seconda.
        cand = [x for x in tutti if x not in set(rr.tolist())]
        nic = sorted([x for x in cand if POP[x] <= POP_CAP and VAVE[x] >= VOTO_BUONO],
                     key=lambda x: -(VAVE[x] + (P.NICCHIA_BONUS_LISTE if LISTDEG[x] > 0 else 0.0)))
        print(f"    7. LA NICCHIA DI QUALITA' (popolarita' <= {POP_CAP:g} · voto >= {VOTO_BUONO:g}"
              f" · '+liste' = vista nelle liste di altri utenti)")
        if nic:
            print("       " + " · ".join(
                f"{TIT[x][:24]} ({VAVE[x]:.1f}, {int(VOT[x]):,} voti{', +liste' if LISTDEG[x] > 0 else ''})"
                for x in nic[:8]))
        else:
            print("       —  (nessuna: in questo mondo tutto e' popolare, o ben votato ma senza liste)")
        # 8. UN CATALOGO PER OGNI MONDO DIVERSO. La distanza in HOP sulla mappa non serve (mediana 3,
        # massimo 5: misurato). La diversita' si prende dove c'e' davvero: la FASCIA DI VOTI del mondo e
        # il MEDIUM.
        scelti = []
        for cb in o[:12]:
            cb = int(cb)
            meio = B.IS_TV[MEM == cb].mean() > 0.5
            if all(abs(np.log(max(VOTMED[cb], 1) / max(VOTMED[bb], 1))) > P.MONDI_DIVERSI_SOGLIA_FASCIA
                   or meio != (B.IS_TV[MEM == bb].mean() > 0.5) for bb in scelti):
                scelti.append(cb)
            if len(scelti) == P.MONDI_DIVERSI_QUANTI:
                break
        print(f"    8. MONDI DIVERSI, UN CATALOGO CIASCUNO (diversi per fascia di voti o per medium)")
        for bb in scelti:
            vs = "serie" if B.IS_TV[MEM == bb].mean() > 0.5 else "film"
            print(f"       mondo {bb:>5} · {int(SZ[bb]):>3} titoli · {vs} · voti mediani "
                  f"{VOTMED[bb]:,.0f} · acceso {100*att[bb]:.1f}%")
            print(f"         " + " · ".join(f"{TIT[x][:24]}" for x in top(bb, r, 8, escludi=rr)))
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
