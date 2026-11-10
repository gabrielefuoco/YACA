"""Misura peso e velocita' del sistema di raccomandazione completo.

Ogni scenario gira in un processo figlio isolato: la RSS di un test non sporca
quella del successivo. Uso: PYTHONPATH=services py .scratch/misura-sistema.py
"""
from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def rss_mb() -> float:
    import psutil

    return psutil.Process().memory_info().rss / 1e6


def scenario(nome: str) -> None:
    from graph import canon as K
    from graph.runtime import Engine
    import graph.servizio as S

    t0 = time.perf_counter()
    base = rss_mb()
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    t_load = time.perf_counter() - t0
    dopo_motore = rss_mb()

    chiavi, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
    semi = [{"key": k, "plays": float(p), "eta_giorni": float(e)} for k, p, e in zip(chiavi, plays, eta)]

    # caldo: una chiamata prima di misurare
    S.esegui_richiesta({"semi": semi[:1], "cap": 60}, engine)
    S.esegui_scaffali({"semi": semi[:20]}, engine)

    out = {
        "rss_base": round(base, 1),
        "rss_dopo_motore": round(dopo_motore, 1),
        "carica_s": round(t_load, 2),
    }

    for etichetta, fn in (
        ("raccomanda_1_seme", lambda: S.esegui_richiesta({"semi": semi[:1], "cap": 60}, engine)),
        ("raccomanda_476_semi", lambda: S.esegui_richiesta({"semi": semi, "cap": 60}, engine)),
        ("scaffali_476_semi", lambda: S.esegui_scaffali({"semi": semi}, engine)),
    ):
        tempi = []
        for _ in range(5):
            t = time.perf_counter()
            fn()
            tempi.append((time.perf_counter() - t) * 1000)
        out[etichetta + "_ms"] = round(statistics.median(tempi), 1)
        out[etichetta + "_max_ms"] = round(max(tempi), 1)

    out["rss_picco"] = round(rss_mb(), 1)
    print(json.dumps({"scenario": nome, **out}))


def main() -> None:
    if len(sys.argv) > 1:
        scenario(sys.argv[1])
        return
    # disco
    art = {
        "transizione": ROOT / "services/graph/data/v45-transizione/transizione-pota16.npz",
        "vicini-top100": ROOT / "services/graph/data/v45-vicini100/vicini-top100.npz",
        "assi-canone": ROOT / "services/graph/data/assi-canone.npz",
        "canon.npz": ROOT / "services/graph/data/canon.npz",
    }
    print("=== DISCO")
    tot = 0.0
    for nome, p in art.items():
        mb = p.stat().st_size / 1e6 if p.exists() else -1
        if mb > 0:
            tot += mb
        print(f"  {nome:16s} {mb:8.2f} MB  {p}")
    print(f"  {'TOTALE runtime':16s} {tot:8.2f} MB")
    print(f"  {'(V45 triangolo)':16s} {(ROOT / 'services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz').stat().st_size/1e6:8.2f} MB  NON usato a runtime")

    print("=== PROCESSO")
    r = subprocess.run([sys.executable, __file__, "warnok"], capture_output=True, text=True,
                       cwd=str(ROOT), env={**os.environ, "PYTHONPATH": "services"})
    if r.returncode != 0:
        print(r.stderr[-2000:])
        return
    d = json.loads(r.stdout.strip().splitlines()[-1])
    print(f"  RSS a vuoto                     {d['rss_base']:8.1f} MB")
    print(f"  RSS con gli artefatti caricati  {d['rss_dopo_motore']:8.1f} MB")
    print(f"  RSS di picco (dopo le chiamate) {d['rss_picco']:8.1f} MB")
    print(f"  tempo di caricamento            {d['carica_s']:8.2f} s")
    print("=== LATENZA (mediana / massimo su 5 chiamate, processo caldo)")
    for k in ("raccomanda_1_seme", "raccomanda_476_semi", "scaffali_476_semi"):
        print(f"  {k:22s} {d[k+'_ms']:8.1f} ms / {d[k+'_max_ms']:8.1f} ms")


if __name__ == "__main__":
    main()
