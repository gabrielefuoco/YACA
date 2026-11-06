"""Recupera la sinossi in inglese (en-US) per TUTTI i titoli del canone.

Il grafo usa una sola lingua (l'inglese); la lingua originale resta in DuckDB. Salva
`data/overview-en.parquet` a blocchi, riprende da dove era arrivato. Nessun fallback: se TMDB
non ha l'en-US, il titolo resta fuori e `embed_trama` usa l'overview del Parquet.

Uso: py -m services.graph_dense.fetch_en [--workers 20]
"""
from __future__ import annotations

import argparse
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

from . import config as C
from . import data as D
from .fetch_overview import _get, _key

LANG = "en-US"
SALVA_OGNI = 2000


def _uno(args):
    key, kind, tid = args
    ov, usata = _get(key, kind, tid, LANG)
    return tid, ov, usata


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=20)
    a = ap.parse_args(argv)
    key = _key()
    B = D.basic()
    out = C.DATA / "overview-en.parquet"
    fatto = set()
    if out.exists():
        fatto = set(str(x) for x in pd.read_parquet(out, columns=["chiave"])["chiave"])
        print(f"riprendo: {len(fatto):,} gia' fatti", flush=True)

    todo = []
    for tipo, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(C.TMDB / f, columns=["id", col])
        d = d[d["id"].map(lambda i: f"{tipo}:{int(i)}" in B["row_of"])]
        for i, t in zip(d["id"], d[col]):
            k = f"{tipo}:{int(i)}"
            if k not in fatto:
                todo.append(((key, tipo, int(i)), tipo, int(i), str(t)))
    print(f"da fare: {len(todo):,} · lingua {LANG}", flush=True)

    righe = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        fut = {ex.submit(_uno, arg): (tipo, i, t) for arg, tipo, i, t in todo}
        for k, f in enumerate(as_completed(fut), 1):
            tipo, i, t = fut[f]
            try:
                tid, ov, lang = f.result()
            except Exception:
                continue
            if ov:
                righe.append({"chiave": f"{tipo}:{i}", "id": i, "tipo": tipo, "titolo": t,
                              "overview": ov, "lang": lang})
            if k % SALVA_OGNI == 0:
                parte = pd.DataFrame(righe)
                if out.exists():
                    parte = pd.concat([pd.read_parquet(out), parte], ignore_index=True)
                parte = parte.drop_duplicates("chiave", keep="first")
                parte.to_parquet(out, index=False)
                print(f"  {k:,}/{len(todo):,} · con sinossi {len(parte):,} · t {time.time()-t0:.0f}s",
                      flush=True)
    parte = pd.DataFrame(righe)
    if out.exists():
        parte = pd.concat([pd.read_parquet(out), parte], ignore_index=True)
    parte = parte.drop_duplicates("chiave", keep="first")
    parte.to_parquet(out, index=False)
    print(f"FINE · {len(parte):,} sinossi · t {time.time()-t0:.0f}s · "
          f"lingue {parte['lang'].value_counts().to_dict()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
