"""03-archi.py — TICKET 03: gli archi strutturali di un titolo nuovo, e il gating.

Un titolo senza comportamento collegato con gli archi strutturali a pieni pesi inquina: il ticket 16
di `grafo-servibile` ha misurato che i metadati ovunque costano **-7,34 al @500**, e il rimedio e' il
gating `lambda(i) = tau0/(tau0 + d_behav(i))` — l'arco strutturale sopravvive se **almeno un estremo
e' freddo**.

Qui si guarda:
  1. quali archi strutturali avrebbe Verity (e con che forza)
  2. la verifica del difetto D4: un arco solitario forte non deve decidere la bolla
  3. quanti archi sopravvivono col gating, e verso chi
"""
import pathlib
import sys

import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import colloca as C

TIT = C.carica()["TIT"]
VOT = C.carica()["VOT"]
mem = C.carica()["mem"]
sz = C.carica()["sz"]
print("=" * 100)
print("TICKET 03 — gli archi strutturali e il gating")
print("=" * 100, flush=True)

dv = pd.read_parquet(C.F.PQ / "movies.parquet")
for id_, etichetta in ((1283515, "VERITY (2026)"), ):
    d = dv[dv["id"] == id_].iloc[0].to_dict()
    riga = C.riga_da_tmdb(d)
    p = C.proietta(riga)
    vicini, bolla, voti, conta = C.colloca(p)
    archi, sim = C.archi_strutturali(riga, k=30)

    print(f"\n### {etichetta} — {d['title']} ###")
    print(f"\n  1. LA PROIEZIONE: bolla {bolla} ({voti}/30 voti, {int(sz[bolla])} titoli)")
    for x in vicini[:8]:
        print(f"       {str(TIT[x])[:52]:<54} bolla {int(mem[x]):>5}")

    print(f"\n  2. GLI ARCHI STRUTTURALI: {len(archi)} con similarita' > 0,05")
    for r, s in archi[:20]:
        print(f"       {s:.4f}  {str(TIT[r])[:52]:<54} bolla {int(mem[r]):>5}")

    print(f"\n  3. LE DUE VIE CONCORDANO?")
    bolle_proiezione = set(int(mem[x]) for x in vicini[:10])
    bolle_struttura = set(int(mem[r]) for r, _ in archi[:10])
    comuni = bolle_proiezione & bolle_struttura
    print(f"       bolle dai vicini proiettati:  {sorted(bolle_proiezione)}")
    print(f"       bolle dagli archi strutturali: {sorted(bolle_struttura)}")
    print(f"       ** in comune: {sorted(comuni) if comuni else 'NESSUNA'} **")

    # 4. il difetto D4: quanto pesa il SINGOLO arco piu' forte?
    print(f"\n  4. IL DIFETTO D4 — l'arco solitario decide?")
    forte = archi[0]
    sua_bolla = int(mem[forte[0]])
    print(f"       l'arco piu' forte e' con {str(TIT[forte[0]])[:44]!r} (bolla {sua_bolla}, "
          f"similarita' {forte[1]:.4f})")
    print(f"       la bolla votata dalla proiezione e' {bolla}: "
          f"{'COINCIDE' if bolla == sua_bolla else 'NO'}")

    # 5. il gating
    print(f"\n  5. IL GATING (tau0 = {C.TAU0})")
    dbehav_nuovo = 0                       # un titolo nuovo non ha archi di comportamento
    lam = C.gating(dbehav_nuovo)
    print(f"       d_behav del titolo nuovo: {dbehav_nuovo} -> lambda = {lam:.3f} (passa tutto)")
    print(f"       d_behav di ciascun vicino strutturale (archi CF+B+TV):")
    for r, s in archi[:8]:
        d_b = int((C.carica()["ha"][r]))
        print(f"         {str(TIT[r])[:44]:<46} {'caldo (ha comportamento)' if d_b else 'freddo'} "
              f"-> l'arco sopravvive: {max(lam, 0.0) > 0 or True}")
    print(f"\n       Nota: siccome l'estremo NUOVO e' freddo per definizione, il gating lascia")
    print(f"       passare tutti i suoi archi. E' il caso limite che il ticket 16 prevedeva, e")
    print(f"       significa che il titolo nuovo entra con TUTTI i suoi archi strutturali: il")
    print(f"       rischio non e' l'arco singolo, e' il loro numero.")

print(f"\nFINE")
