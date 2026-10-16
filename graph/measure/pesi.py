"""pesi.py — cosa pesa un titolo della storia, e quanto costa il tetto dei 15.

DUE DOMANDE, una misura.

1. IL PESO. Il meccanismo prende la storia dell'utente e la usa come seme. Ma un titolo visto tre anni
   fa vale come uno visto ieri? Uno rivisto tre volte vale come uno abbandonato? Oggi la scelta e'
   dell'autore (recenza x ri-visioni) e **non e' mai stata misurata**.

2. IL TETTO DEI 15 (`todo/8`). Il prodotto prende i **15 titoli piu' recenti** e butta il resto
   (`SEED_SIGNAL_LIMITS.watched = 15`). Il report 05 l'aveva misurato sulla *cronologia*: 50 e 100
   visti danno liste identiche. Qui si misura sul MECCANISMO NUOVO: quanti titoli futuri si perdono
   con 15 semi invece che con tutti? E il `todo/8` proponeva un decadimento logaritmico o inverso del
   rango: quale dei due, misurato.

IL TAGLIO E' TEMPORALE, e non e' un dettaglio: i semi sono il PASSATO, il bersaglio e' il FUTURO. E' la
situazione del prodotto, ed e' l'unica in cui la recenza puo' essere giudicata sul suo terreno. Con due
meta' a caso, un peso che privilegia i recenti sarebbe testato contro un oro che contiene anche i
vecchi — cortesia che il prodotto non fa.

    python graph/measure/pesi.py            # ~5 minuti su 100 utenti
"""
import json
import os
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import camminata as _cam
from graph import canon as K
from graph import parametri as P

T0 = time.time()
ALPHA = float(os.environ.get("ALPHA", P.ALPHA))
QUANTI_UTENTI = P.BANCO_UTENTI
ITER = int(os.environ.get("ITER", P.ITER))
FRAZIONE = P.TAGLIO_TEMPORALE      # il 70% piu' VECCHIO semina, il 30% piu' NUOVO e' l'oro
K_POTA = P.POTA_PER_RIGA
MIN_TITOLI = P.BANCO_MIN_TITOLI
EMIVITA = 365.0


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def storia(u):
    """(righe, eta' in giorni, plays) in ordine di recenza decrescente."""
    import pandas as pd
    righe, eta, plays = [], [], []
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
            eta.append(max(int(g), 0))
            plays.append(int(voce.get("plays") or 1))
    o = np.argsort(eta)                      # il piu' recente per primo
    return np.array(righe)[o], np.array(eta)[o], np.array(plays)[o]


def ppr(P, seme, pesi, iters=ITER):
    """Il ciclo sta in `camminata.ppr`. `alpha=ALPHA` perche' qui si puo' sovrascrivere da ambiente."""
    return _cam.ppr(P, seme, pesi, alpha=ALPHA, iters=iters)


def pesi_per(nome, eta, plays, quante, righe=None):
    """I pesi del seme secondo lo schema. `quante` limita ai piu' recenti.

    Per gli schemi per-medium servono le righe del seme (per sapere film o serie) e `NEP` (il numero di
    episodi, 1 per un film): cosi' `plays / NEP` diventa **quante volte hai visto tutto intero** — la
    stessa grandezza per un film visto tre volte e per una serie di 100 episodi vista 100 volte.
    """
    i = np.arange(quante)
    rec = 0.5 ** (eta[:quante] / EMIVITA)
    pl = 1.0 + np.log(plays[:quante].astype(float))
    if nome == "uniforme":
        return np.ones(quante)
    if nome == "recenza":
        return rec
    if nome == "ri-visioni":
        return pl
    if nome == "recenza x ri-visioni":
        return rec * pl
    if nome == "ri-visioni LINEARI":
        return plays[:quante].astype(float)
    if nome == "ri-visioni RADICE":
        return np.sqrt(plays[:quante].astype(float))
    if nome == "log TOPPATO 20":
        return np.log1p(np.minimum(plays[:quante], 20).astype(float))
    if nome == "lineare TOPPATO 20":
        return np.minimum(plays[:quante], 20).astype(float)
    if nome == "lineare TOPPATO 5":
        return np.minimum(plays[:quante], 5).astype(float)
    if nome == "intero x log (disegno utente)":
        nep = NEP[righe[:quante]] if righe is not None else np.ones(quante)
        intero = np.minimum(plays[:quante].astype(float) / nep, 1.0)      # quante volte TUTTO INTERO
        return intero * np.log1p(np.minimum(plays[:quante], 50).astype(float))
    if nome == "intero x log, intero fino a 2":
        nep = NEP[righe[:quante]] if righe is not None else np.ones(quante)
        intero = np.minimum(plays[:quante].astype(float) / nep, 2.0)
        return intero * np.log1p(np.minimum(plays[:quante], 50).astype(float))
    if nome == "SPEC utente (film 1-3, serie 1-3)":
        # LA SPECIFICHE DEL PROPRIETARIO, coi valori in `graph/parametri.py`: una serie di 100 episodi
        # deve valere come 2/3 film, non 100. Le puntate non contano mai come play.
        nep = NEP[righe[:quante]] if righe is not None else np.ones(quante)
        pl = plays[:quante].astype(float)
        return np.where(nep > 1.0, P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                        np.minimum(pl, P.PESO_FILM_MAX))
    if nome == "intero secco (no log)":
        nep = NEP[righe[:quante]] if righe is not None else np.ones(quante)
        return np.minimum(plays[:quante].astype(float) / nep, 2.0)
    if nome == "ultimi 15 (il prodotto)":
        return (rec * pl)[:15]
    if nome == "ultimi 30":
        return (rec * pl)[:30]
    # IL BOOST AI PIU' RECENTI: i primi dell'array sono i visti piu' di recente (A e' ordinato per
    # recenza). Nel benchmark l'ultimo in assoluto sta nell'oro nascosto, quindi si spingono i piu'
    # recenti DEL PASSATO — che in produzione, dove il seme e' tutta la storia, sono gli ultimi visti.
    if (nome.startswith("intero x log + boost") or nome.startswith("log TOPPATO 20 + boost")):
        base = ("intero x log (disegno utente)" if nome.startswith("intero")
                else "log TOPPATO 20")
        p = pesi_per(base, eta, plays, quante, righe).copy()
        import re as _re
        m = _re.search(r"boost (\d+)% ultimi (\d+)", nome)
        perc, k = int(m.group(1)), int(m.group(2))
        p[:k] *= 1.0 + perc / 100.0
        return p
    raise ValueError(nome)


SCHEMI = ("uniforme", "ri-visioni", "lineare TOPPATO 20",
          "SPEC utente (film 1-3, serie 1-3)",
          "15 a caso, peso pieno")


def main():
    print("=" * 104)
    print(f"COSA PESA UN TITOLO — e quanto costa il tetto dei 15 · α={ALPHA} · taglio TEMPORALE")
    print("=" * 104, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    Wp = pota(Ws, K_POTA)
    deg = np.asarray(Wp.sum(1)).ravel()
    deg[deg <= 0] = 1
    P = sp.diags(1.0 / deg) @ Wp
    print(f"  grafo potato top-{K_POTA}: {Wp.nnz:,} archi ({time.time()-T0:.0f}s)", flush=True)

    # NEP: quanti episodi ha una voce. 1 per un film, il numero di episodi per una serie (TMDB). Cosi'
    # `plays / NEP` = quante volte hai visto TUTTO INTERO, la stessa grandezza per i due medium.
    global NEP
    NEP = np.ones(N, np.float32)
    import pandas as _pd
    _tv = _pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "tv.parquet",
                           columns=["id", "number_of_episodes"])
    _mancanti = 0
    for i, e in zip(_tv["id"], _tv["number_of_episodes"]):
        r = B.ROW_OF.get(f"tv:{int(i)}")
        if r is None:
            continue
        e = _pd.to_numeric(e, errors="coerce")
        if e is None or _pd.isna(e) or e <= 0:
            _mancanti += 1
            continue
        NEP[r] = float(e)
    print(f"  NEP: episodi per serie caricati · serie senza numero di episodi: {_mancanti} "
          f"(restano a 1) ({time.time()-T0:.0f}s)", flush=True)
    _ser = B.IS_TV.astype(bool)
    print(f"  sui titoli: {int(_ser.sum()):,} serie · {int((~_ser).sum()):,} film", flush=True)

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(41).choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)),
                                              replace=False)

    acc = {s: {"lift_t": [], "lift_b": [], "hit10": [], "semi": []} for s in SCHEMI}
    # I GRUPPI: le domande del proprietario — chi non ha ri-visioni, chi ha storie corte o lunghissime.
    gruppo = {"frazione_rewatch": [], "n_semi": [], "quota_serie": [], "usati": []}
    dist = {"film": [], "serie": []}
    base = {"lift_t": [], "hit10": []}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, eta, plays = storia(u)                    # dal piu' recente al piu' vecchio
        if len(righe) < MIN_TITOLI:
            continue
        # LO SPLIT E' NEL TEMPO, ED E' ESPLICITO. Prima si tagliava `righe[:taglio]` credendo che fosse
        # il passato — ma l'ordine di `storia()` e' di RECENZA, quindi si seminava dal PRESENTE per
        # misurare sul PASSATO remoto. Ora le posizioni si ricavano da `eta` (grande = vecchio), quindi
        # il verso di `storia()` non conta piu'. I semi restano dati dal piu' recente al piu' vecchio
        # perche' gli schemi parlano di «ultimi 15/30» e `pesi_per` legge un PREFISSO degli array che
        # riceve: cosi' «ultimi 15» vuol dire «i 15 piu' recenti fra i semi», che e' la spec di prodotto.
        o = np.argsort(-np.asarray(eta))                 # dal passato al futuro
        taglio = int(len(righe) * FRAZIONE)
        pos_p, pos_f = o[:taglio], o[taglio:]
        # IL CONTRATTO, dove il bug e' nato due volte: semina dal passato, non dal futuro.
        K.assert_split_temporale(eta[pos_p], eta[pos_f], nome=f"utente {u}")
        A, Bt = righe[pos_p][::-1], righe[pos_f]         # A: i semi, i piu' recenti del passato
        eta_A, plays_A = eta[pos_p][::-1], plays[pos_p][::-1]
        if len(A) < 10 or len(Bt) < 5:
            continue
        bolle_B = set(MEM[Bt].tolist())
        idx_caso = np.random.default_rng(9).choice(N, size=len(Bt), replace=False)
        for s in SCHEMI:
            if "a caso" in s:                      # LA CONTROPROVA: stesso conteggio, titoli pescati
                quanti = 15 if s.startswith("15") else 30
                sel = np.random.default_rng(5).choice(len(A), size=min(quanti, len(A)),
                                                       replace=False)
                seme = A[sel]
                pesi = (pesi_per("recenza x ri-visioni", eta_A, plays_A, len(A))[sel]
                        if "peso pieno" in s else np.ones(len(sel)))
            else:
                pesi = pesi_per(s, eta_A, plays_A, len(A), righe=A)
                seme = A[:len(pesi)]
            r = ppr(P, seme, pesi)
            tot = r.sum()
            acc[s]["lift_t"].append(float(r[Bt].sum() / max(r[idx_caso].sum(), 1e-12)))
            nb = np.bincount(MEM, weights=r, minlength=NB)
            att = nb / tot
            acc[s]["lift_b"].append(float(att[list(bolle_B)].sum() /
                                          max(len(bolle_B) / NB, 1e-12)))
            primi = np.argsort(-att)[:10]
            acc[s]["hit10"].append(sum(1 for b in primi if b in bolle_B) / 10)
            acc[s]["semi"].append(int(len(seme)))
        # chi sono questi utenti: quante ri-visioni ha il suo passato, quanti semi, che media
        pl_A = plays_A.astype(float)
        gruppo["frazione_rewatch"].append(float((pl_A > 1).mean()))
        gruppo["n_semi"].append(len(A))
        is_tv = B.IS_TV[A]
        gruppo["quota_serie"].append(float(is_tv.mean()))
        gruppo["usati"].append((usati,))
        dist["film"].extend(pl_A[~is_tv].tolist())
        dist["serie"].extend(pl_A[is_tv].tolist())
        ran = np.random.default_rng(77).choice(N, size=len(A), replace=False)
        rn = ppr(P, ran, np.ones(len(A)))
        base["lift_t"].append(float(rn[Bt].sum() / max(rn[idx_caso].sum(), 1e-12)))
        nbn = np.bincount(MEM, weights=rn, minlength=NB)
        base["hit10"].append(sum(1 for b in np.argsort(-nbn)[:10] if b in bolle_B) / 10)
        usati += 1
        if usati % 25 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)

    print(f"\n  utenti: {usati} · semi: {int(np.median(acc[SCHEMI[0]]['semi']))} "
          f"(il 70% piu' vecchio) · oro: il 30% piu' recente\n")
    print(f"  {'schema':>22} {'lift titoli':>12} {'lift bolle':>11} {'primi 10 mondi':>15}")
    for s in SCHEMI:
        print(f"  {s:>22} {np.median(acc[s]['lift_t']):>11.2f}x {np.median(acc[s]['lift_b']):>10.2f}x "
              f"{100*np.median(acc[s]['hit10']):>14.0f}%")
    print(f"  {'SEMI A CASO (nullo)':>22} {np.median(base['lift_t']):>11.2f}x {'—':>10} "
          f"{100*np.median(base['hit10']):>14.0f}%")
    print(f"\n  lift titoli = quante volte piu' massa cade sui titoli del FUTURO che su titoli a caso")
    print(f"  primi 10 mondi = quanti dei 10 mondi accesi contengono un titolo del futuro")

    print(f"\n  ── COSA VUOL DIRE `plays` — film contro serie (sui semi di tutti gli utenti)")
    for chiave in ("film", "serie"):
        v = np.array(dist[chiave])
        print(f"    {chiave:<6} {len(v):>7,} voci · mediana {np.median(v):>5.1f} · p90 "
              f"{np.percentile(v, 90):>5.1f} · p99 {np.percentile(v, 99):>6.1f} · "
              f"massimo {v.max():>6.0f} · quota con plays>1: {100*(v > 1).mean():.0f}%")
    print(f"    -> se le serie hanno plays molto piu' alti, `plays` NON e' confrontabile fra i due")

    print(f"\n  ── I GRUPPI, e la scelta conta per tutti?")
    fr = np.array(gruppo["frazione_rewatch"])
    ns = np.array(gruppo["n_semi"])
    for etichetta, maschera in (("senza ri-visioni (<10% dei titoli)", fr < 0.10),
                                ("con ri-visioni (>=10%)", fr >= 0.10),
                                ("storia corta (< 150 semi)", ns < 150),
                                ("storia lunga (>= 150 semi)", ns >= 150)):
        if maschera.sum() < 5:
            print(f"    {etichetta:<36} —  utenti {int(maschera.sum())} (troppo pochi)")
            continue
        riga = [f"{etichetta:<36} utenti {int(maschera.sum()):>3}"]
        for s in SCHEMI:
            lt = np.array(acc[s]["lift_t"])[maschera]
            riga.append(f"{s.split()[0][:10]}: {np.median(lt):>5.1f}x")
        print("    " + " · ".join(riga))
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
