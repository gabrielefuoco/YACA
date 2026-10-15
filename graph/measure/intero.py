"""intero.py — IL MOTORE INTERO, misurato: le liste complete, nell'ordine in cui escono.

IL BUCO CHE CHIUDE. Finora sono stati misurati i PEZZI — i mondi, i pesi dei semi, α, la potatura — e
l'output e' stato *letto* a occhio su dieci utenti. Il prodotto finito (le liste, nell'ordine in cui
escono) non era mai stato messo alla prova su cento utenti. Ed e' la domanda secca: **le liste che
leggono bene sono anche quelle giuste?**

METODO, lo stesso del resto del modulo: taglio TEMPORALE. Il 70% piu' vecchio della storia e' il seme,
il 30% piu' nuovo e' l'oro — ed e' esattamente cio' che il motore NON ha visto, perche' esclude dal
portafoglio solo la storia che gli si passa.

COSA SI MISURA
  · **precisione** — quanti dei titoli mostrati sono nel futuro dell'utente (il numero leggibile)
  · **copertura**  — quanto del suo futuro sta nelle liste (il numero del banco)
  · **per tipo di lista** — dove sta il futuro: nel tuo mondo, nel quartiere, nella nicchia?
  · **il rango** — a che posizione dentro la lista compaiono i titoli del futuro: e' il test di
    «oltre il quarto titolo e' rumore», che finora era un'affermazione non verificata
  · **il tempo** — quanto costa una chiamata (finora STIMATO a 50-150 ms, mai misurato)

E il pavimento: 40 titoli pescati a caso coprirebbero lo 0,06% del futuro.

    python graph/measure/intero.py
"""
import os
import pathlib
import sys
import time

import numpy as np


sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K
from graph import motore as MO
from graph import parametri as P

QUANTI_UTENTI = int(os.environ.get("UTENTI", 100))
T0 = time.time()


def main():
    M = MO.Motore()
    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(77).choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)),
                                              replace=False)
    prec, cop, temp = [], [], []
    per_tipo = {}
    ranghi = []
    n_mostrati = []
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        storia = MO.da_trakt(u)                      # in ordine di recenza
        if len(storia) < 2 * P.BANCO_MIN_TITOLI:
            continue
        taglio = int(len(storia) * P.TAGLIO_TEMPORALE)
        semi, oro = storia[:taglio], {k for k, _ in storia[taglio:]}
        t = time.time()
        esito = M.lista(semi)
        temp.append((time.time() - t) * 1000)
        mostrati = []
        for li in esito["liste"]:
            for pos, (kk, _) in enumerate(li["titoli"]):
                mostrati.append(kk)
                if kk in oro:
                    per_tipo[li["tipo"]] = per_tipo.get(li["tipo"], 0) + 1
                    ranghi.append(pos)
        mostrati = list(dict.fromkeys(mostrati))      # dedup, tenendo l'ordine
        n_mostrati.append(len(mostrati))
        if not mostrati or not oro:
            continue
        presi = len(set(mostrati) & oro)
        prec.append(presi / len(mostrati))
        cop.append(presi / len(oro))
        usati += 1
        if usati % 25 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)

    print(f"\n  utenti: {usati} · titoli mostrati per utente: mediana "
          f"{int(np.median(n_mostrati))} · oro: mediana {int(np.median([len(oro)]))}")
    print(f"\n  {'precisione':>12} {'copertura':>11} {'pavimento (a caso)':>20}")
    print(f"  {100*np.median(prec):>11.1f}% {100*np.median(cop):>10.1f}% "
          f"{100*np.median(n_mostrati)/M.N:>19.2f}%")
    print(f"\n  lift sulla precisione: {np.median(prec) / (np.median(n_mostrati)/M.N):.0f}x")
    print(f"\n  DOVE STA IL FUTURO — titoli dell'oro trovati, per tipo di lista:")
    tot = sum(per_tipo.values()) or 1
    for nome, c in sorted(per_tipo.items(), key=lambda z: -z[1])[:8]:
        print(f"    {nome:<20} {c:>5} ({100*c/tot:>4.0f}%)")
    if ranghi:
        r = np.array(ranghi)
        print(f"\n  IL RANGO DENTRO LA LISTA (0 = primo): mediana {int(np.median(r))} · "
              f"p25 {int(np.percentile(r,25))} · p75 {int(np.percentile(r,75))}")
        print(f"    quota dell'oro trovato entro le prime 4 posizioni: {100*(r < 4).mean():.0f}%")
    print(f"\n  IL TEMPO: per chiamata, mediana {np.median(temp):.0f} ms · "
          f"p90 {np.percentile(temp, 90):.0f} ms  (finora era STIMATO a 50-150 ms)")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
