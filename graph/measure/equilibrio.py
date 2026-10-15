"""equilibrio.py — le due specifiche del proprietario, misurate come EQUILIBRIO e non come accuratezza.

PERCHE' ESISTE, e perche' NON e' un banco di qualita'. Il proprietario ha bocciato il cap a 20 con
queste parole: «praticamente un utente che guarda solo film si vede le sue raccomandazioni tarate su
una singola serie da 20 episodi che ha visto» e «ti stai basando troppo su dati freddi e poco sulla
soggettivita'». Ha ragione due volte:

  1. il banco a taglio temporale misura il COMPORTAMENTO (cosa guardera'), non il gusto. Con `plays`
     lineare il modello vince perche' riconosce le serie a meta' e predice la puntata successiva —
     che l'utente guarderebbe comunque. E' leakage, non qualita'.
  2. una specifica di prodotto non si arbitra con quel metro. Si arbitra con l'EQUILIBRIO.

QUINDI qui non si misura quanto e' "giusto" un peso: si misura **chi tiene il seme**. Due numeri:
  · la quota di PESO che va alle serie contro la loro quota di TITOLI (asimmetria fra medium);
  · la quota di peso del TITOLO PIU' PESANTE (una singola voce che decide tutto).
Il secondo e' esattamente la paura del proprietario: una serie da 20 episodi che tara da sola un
utente di soli film.

    python graph/measure/equilibrio.py      # secondi: nessuna diffusione, solo i pesi
"""
import json
import pathlib
import sys
import time

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
QUANTI_UTENTI = 300
MIN_TITOLI = 20


def storia(u):
    righe, plays = [], []
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
            righe.append(r)
            plays.append(int(voce.get("plays") or 1))
    return np.array(righe, np.int64), np.array(plays, np.float64)


def pesi_schema(nome, righe, plays):
    nep = NEP[righe]
    pl = plays.copy()
    if nome == "1 + log(plays)":
        return 1.0 + np.log(pl)
    if nome == "min(plays, 20)":
        return np.minimum(pl, 20.0)
    if nome == "min(plays, 3)  [film]":
        return np.minimum(pl, 3.0)
    if nome == "SPEC utente":
        film = np.minimum(pl, 3.0)
        serie = 1.0 + 2.0 * np.minimum(pl / nep, 1.0)
        return np.where(nep > 1.0, serie, film)
    raise ValueError(nome)


SCHEMI = ("1 + log(plays)", "min(plays, 20)", "min(plays, 3)  [film]", "SPEC utente")


def main():
    global NEP
    N = B.N
    NEP = np.ones(N, np.float32)
    import pandas as pd
    tv = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "tv.parquet",
                         columns=["id", "number_of_episodes"])
    for i, e in zip(tv["id"], tv["number_of_episodes"]):
        r = B.ROW_OF.get(f"tv:{int(i)}")
        if r is None:
            continue
        e = pd.to_numeric(e, errors="coerce")
        if e is not None and not pd.isna(e) and e > 0:
            NEP[r] = float(e)
    print("=" * 104)
    print("CHI TIENE IL SEME — equilibrio fra medium e concentrazione, non accuratezza")
    print("=" * 104, flush=True)

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(77).choice(pool, size=QUANTI_UTENTI, replace=False)

    dati = {s: {"quota_serie": [], "quota_serie_storia": [], "top1": [], "top1_serie": []}
            for s in SCHEMI}
    film_heavy = {s: [] for s in SCHEMI}
    corti = {}
    usati = 0
    for u in utenti:
        righe, plays = storia(u)
        if len(righe) < MIN_TITOLI:
            continue
        is_tv = B.IS_TV[righe].astype(bool)
        qs_storia = float(is_tv.mean())
        for s in SCHEMI:
            w = pesi_schema(s, righe, plays)
            tot = w.sum()
            dati[s]["quota_serie"].append(float(w[is_tv].sum() / tot))
            dati[s]["quota_serie_storia"].append(qs_storia)
            quali = np.where(is_tv, 1.0 + np.minimum(plays / NEP[righe], 1.0), 0.0)
            dati[s]["top1"].append(float(w.max() / tot))
            dati[s]["top1_serie"].append(float(quali.max()))
            if qs_storia < 0.30:                      # L'UTENTE DI SOLI FILM della sua paura
                film_heavy[s].append(float(w[is_tv].sum() / tot))
            if len(righe) < 60:                       # STORIA CORTA: una sola serie puo' tarare tutto
                corti.setdefault(s, []).append(float(w.max() / tot))
        usati += 1

    print(f"\n  utenti: {usati} · serie nella storia: mediana "
          f"{100*np.median(dati[SCHEMI[0]]['quota_serie_storia']):.0f}% dei titoli\n")
    print(f"  {'schema':>22} {'PESO alle serie':>17} {'(titoli: %)':>13} {'titolo piu pesante':>20}")
    for s in SCHEMI:
        d = dati[s]
        print(f"  {s:>22} {100*np.median(d['quota_serie']):>16.0f}% "
              f"{100*np.median(d['quota_serie_storia']):>12.0f}% {100*np.median(d['top1']):>19.0f}%")
    print(f"\n  ── L'UTENTE DI SOLI FILM (< 30% di serie nella storia): quanto peso prendono le sue serie?")
    for s in SCHEMI:
        v = np.array(film_heavy[s])
        if len(v) < 5:
            print(f"  {s:>22} — utenti {len(v)} (troppo pochi)")
            continue
        print(f"  {s:>22} mediana {100*np.median(v):>5.1f}% · p90 {100*np.percentile(v, 90):>5.1f}% "
              f"· massimo {100*v.max():>5.1f}%   su {len(v)} utenti")
    print(f"\n  ── STORIA CORTA (< 60 titoli): quanto pesa IL SINGOLO titolo piu' pesante?")
    for s in SCHEMI:
        v = np.array(corti.get(s, []))
        if len(v) < 5:
            print(f"  {s:>22} — utenti {len(v)} (troppo pochi)")
            continue
        print(f"  {s:>22} mediana {100*np.median(v):>5.1f}% · p90 {100*np.percentile(v, 90):>5.1f}% "
              f"· massimo {100*v.max():>5.1f}%   su {len(v)} utenti")
    print(f"\n  lettura: se la quota di peso alle serie supera di molto la loro quota di titoli, il seme")
    print(f"  e' sbilanciato sul medium; se il titolo piu' pesante prende molto, una voce decide tutto.")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
