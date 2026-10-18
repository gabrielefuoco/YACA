"""probe_metro.py — Il Metro della Qualità (Ticket 45) sul corpus Trakt (Piano B).

Misura la riga 'nicchia_di_qualita' del grafo contro l'oro (holdout 70/30) su:
- Coorte standard di 60 utenti (seme 404)
- Intero corpus di 400 utenti
Fornisce media, deviazione standard e distribuzione (min, p25, mediana, p75, max).
Filtra l'oro AMMISSIBILE con le regole di nicchia (popolarita <= 20, voto medio >= 7.0).
Valuta il criterio vincolante non vacuo dichiarato a priori.
"""
import argparse
import json
import os
import pathlib
import sys
import time

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import motore as MO
from graph import canon as K
from graph import parametri as P

CRITERIO_SOGLIA_MEDIA_ORO_AMM = 0.02      # Almeno 2.0% di oro ammissibile preso in media
CRITERIO_SOGLIA_QUOTA_UTENTI_HIT = 0.25   # Almeno 25% degli utenti con >= 1 titolo oro preso
CRITERIO_SOGLIA_RIEMPIMENTO_MED = 8       # Mediana riempimento >= 8 su cap 10

def valuta_coorte(motore, utenti, medium="series", max_utenti=60):
    usati = 0
    tot_oro = []
    tot_oro_amm = []
    preso_oro = []
    preso_amm = []
    riempimenti = []
    utenti_con_amm = 0
    utenti_con_hit = 0

    for u in utenti:
        if usati >= max_utenti:
            break
        chiavi, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
        mask = B.IS_TV[righe] if medium == "series" else ~B.IS_TV[righe]
        med_righe = righe[mask]
        med_plays = plays[mask]

        if len(med_righe) < 10:
            continue

        taglio = int(len(med_righe) * 0.70)
        semi = med_righe[:taglio]
        oro = med_righe[taglio:]
        if len(oro) < 3:
            continue

        storia = [(B.KEYS[r], float(p)) for r, p in zip(semi, med_plays[:taglio])]
        res = motore.lista(storia, medium=medium, cap=10)
        liste = res.get("liste", [])
        nicchia = next((l for l in liste if l["tipo"] == "nicchia_di_qualita"), None)
        if not nicchia:
            continue

        rec_rows = set([B.ROW_OF[ch] for ch, _ in nicchia["titoli"] if ch in B.ROW_OF])
        oro_rows = set(oro.tolist())

        # Oro ammissibile secondo le regole del catalogo nicchia
        oro_amm_rows = set([
            r for r in oro_rows
            if motore.POP[r] <= P.NICCHIA_POPOLARITA_MAX and motore.VAVE[r] >= P.NICCHIA_VOTO_MIN
        ])

        n_oro = len(oro_rows)
        n_amm = len(oro_amm_rows)
        n_preso = len(rec_rows & oro_rows)
        n_preso_amm = len(rec_rows & oro_amm_rows)

        tot_oro.append(n_oro)
        tot_oro_amm.append(n_amm)
        preso_oro.append(n_preso / n_oro if n_oro > 0 else 0.0)
        preso_amm.append(n_preso_amm / n_amm if n_amm > 0 else 0.0)
        riempimenti.append(len(rec_rows))

        if n_amm > 0:
            utenti_con_amm += 1
        if n_preso > 0:
            utenti_con_hit += 1

        usati += 1

    stats = {
        "usati": usati,
        "riempimento": {
            "media": float(np.mean(riempimenti)) if riempimenti else 0.0,
            "mediana": float(np.median(riempimenti)) if riempimenti else 0.0,
            "min": int(np.min(riempimenti)) if riempimenti else 0,
            "max": int(np.max(riempimenti)) if riempimenti else 0,
        },
        "oro_totale": {
            "media": float(np.mean(tot_oro)) if tot_oro else 0.0,
            "mediana": float(np.median(tot_oro)) if tot_oro else 0.0
        },
        "oro_ammissibile": {
            "media": float(np.mean(tot_oro_amm)) if tot_oro_amm else 0.0,
            "mediana": float(np.median(tot_oro_amm)) if tot_oro_amm else 0.0,
            "utenti_con_amm": utenti_con_amm,
            "quota_con_amm": float(utenti_con_amm / usati) if usati > 0 else 0.0
        },
        "oro_preso_totale": {
            "media": float(np.mean(preso_oro)) if preso_oro else 0.0,
            "mediana": float(np.median(preso_oro)) if preso_oro else 0.0,
            "p25": float(np.percentile(preso_oro, 25)) if preso_oro else 0.0,
            "p75": float(np.percentile(preso_oro, 75)) if preso_oro else 0.0,
            "max": float(np.max(preso_oro)) if preso_oro else 0.0
        },
        "oro_preso_ammissibile": {
            "media": float(np.mean(preso_amm)) if preso_amm else 0.0,
            "mediana": float(np.median(preso_amm)) if preso_amm else 0.0,
            "p25": float(np.percentile(preso_amm, 25)) if preso_amm else 0.0,
            "p75": float(np.percentile(preso_amm, 75)) if preso_amm else 0.0,
            "max": float(np.max(preso_amm)) if preso_amm else 0.0
        },
        "utenti_con_hit": utenti_con_hit,
        "quota_con_hit": float(utenti_con_hit / usati) if usati > 0 else 0.0
    }

    # Valutazione criterio
    c1 = stats["oro_preso_ammissibile"]["media"] >= CRITERIO_SOGLIA_MEDIA_ORO_AMM
    c2 = stats["quota_con_hit"] >= CRITERIO_SOGLIA_QUOTA_UTENTI_HIT
    c3 = stats["riempimento"]["mediana"] >= CRITERIO_SOGLIA_RIEMPIMENTO_MED
    stats["criterio_accettato"] = bool(c1 and c2 and c3)
    stats["criterio_dettaglio"] = {
        "media_oro_amm_ge_2pct": bool(c1),
        "quota_hit_ge_25pct": bool(c2),
        "riempimento_med_ge_8": bool(c3)
    }

    return stats

def main():
    parser = argparse.ArgumentParser(description="Probe Metro della Qualità (Ticket 45)")
    parser.add_argument("--users", type=int, default=60, help="Numero utenti da misurare (default: 60)")
    parser.add_argument("--all", action="store_true", help="Misura sull'intero corpus (400 utenti)")
    parser.add_argument("--seed", type=int, default=404, help="Seed RNG (default: 404)")
    args = parser.parse_args()

    t0 = time.time()
    print("=" * 100)
    print("  YACA QA PROBE — Il Metro della Qualità, Seconda Iterazione (Ticket 45)")
    print("  Piano B: 'nicchia_di_qualita' (Grafo) sul Corpus Trakt riscaricato")
    print(f"  Criterio non vacuo: media(oro_amm) >= {CRITERIO_SOGLIA_MEDIA_ORO_AMM*100:.1f}%, "
          f"quota_hit >= {CRITERIO_SOGLIA_QUOTA_UTENTI_HIT*100:.1f}%, "
          f"riempimento_med >= {CRITERIO_SOGLIA_RIEMPIMENTO_MED}")
    print("=" * 100 + "\n", flush=True)

    motore = MO.Motore(silenzioso=True)
    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    print(f"Utenti totali nel corpus Trakt con movie + show: {len(pool)}")

    quanti = len(pool) if args.all else args.users
    rng = np.random.default_rng(args.seed)
    utenti = rng.choice(pool, size=len(pool), replace=False)

    report = {}
    for med in ["series", "movie"]:
        med_label = "Serie TV" if med == "series" else "Film"
        print(f"\n--- Valutazione {med_label} ({med}) su n={quanti} utenti (seed {args.seed}) ---", flush=True)
        st = valuta_coorte(motore, utenti, medium=med, max_utenti=quanti)
        report[med] = st

        print(f"  Utenti analizzati effettivamente: {st['usati']}")
        print(f"  Riempimento: media {st['riempimento']['media']:.1f}, mediana {st['riempimento']['mediana']:.0f} "
              f"[{st['riempimento']['min']}-{st['riempimento']['max']}]")
        print(f"  Oro medio per utente: totale {st['oro_totale']['media']:.1f} (med: {st['oro_totale']['mediana']:.0f}) | "
              f"ammissibile {st['oro_ammissibile']['media']:.1f} (med: {st['oro_ammissibile']['mediana']:.0f})")
        print(f"  Utenti con almeno 1 titolo ammissibile: {st['oro_ammissibile']['utenti_con_amm']}/{st['usati']} "
              f"({st['oro_ammissibile']['quota_con_amm']*100:.1f}%)")
        print(f"  Oro preso (su tutto l'oro): media {st['oro_preso_totale']['media']*100:.2f}% | "
              f"mediana {st['oro_preso_totale']['mediana']*100:.2f}% (p25: {st['oro_preso_totale']['p25']*100:.2f}%, "
              f"p75: {st['oro_preso_totale']['p75']*100:.2f}%, max: {st['oro_preso_totale']['max']*100:.2f}%)")
        print(f"  Oro preso (su ORO AMMISSIBILE): media {st['oro_preso_ammissibile']['media']*100:.2f}% | "
              f"mediana {st['oro_preso_ammissibile']['mediana']*100:.2f}% (p25: {st['oro_preso_ammissibile']['p25']*100:.2f}%, "
              f"p75: {st['oro_preso_ammissibile']['p75']*100:.2f}%, max: {st['oro_preso_ammissibile']['max']*100:.2f}%)")
        print(f"  Utenti con almeno 1 titolo preso: {st['utenti_con_hit']}/{st['usati']} "
              f"({st['quota_con_hit']*100:.1f}%)")
        print(f"  VERDETTO CRITERIO: {'ACCETTATO ✓' if st['criterio_accettato'] else 'RESPINTO ✗'} "
              f"({st['criterio_dettaglio']})\n")

    print(f"Completato in {time.time()-t0:.1f}s.")

if __name__ == "__main__":
    main()
