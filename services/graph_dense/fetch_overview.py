"""Recupera da TMDB le sinossi mancanti nei Parquet (fallback en-US -> it-IT).

I Parquet del canone hanno `overview` vuota per ~30k titoli, ma TMDB la ha quasi sempre: il fetch
originale non ha fatto fallback di lingua. Qui si scarica la sinossi vera (nessun testo generato),
si salva in `data/overview-extra.parquet` a blocchi di 500 e si riprende da dove era arrivato.

Uso: py -m services.graph_dense.fetch_overview [--workers 16]
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

from . import config as C
from . import data as D

API = "https://api.themoviedb.org/3/{kind}/{tid}"
LINGUE = ("en-US", "it-IT")
SALVA_OGNI = 500


def _key():
    k = os.environ.get("TMDB_API_KEY")
    if k:
        return k
    for f in (".env", "secrets.env"):
        p = C.ROOT / f
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.strip().startswith("TMDB_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("TMDB_API_KEY assente")


def _get(key, kind, tid, lang, tentativi=3):
    url = API.format(kind=kind, tid=tid) + f"?api_key={key}&language={lang}"
    for t in range(tentativi):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=12) as r:
                j = json.load(r)
            ov = (j.get("overview") or "").strip()
            return ov, lang
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 + 2 * t)
                continue
            if e.code in (401, 404):
                return "", ""
            time.sleep(0.5 + t)
        except Exception:
            time.sleep(0.5 + t)
    return "", ""


def _uno(args):
    key, kind, tid = args
    for lang in LINGUE:
        ov, usata = _get(key, kind, tid, lang)
        if ov:
            return tid, ov, usata
    return tid, "", ""


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=16)
    a = ap.parse_args(argv)
    key = _key()
    B = D.basic()
    out = C.DATA / "overview-extra.parquet"
    fatto = set()
    if out.exists():
        vecchio = pd.read_parquet(out)
        fatto = set(str(x) for x in vecchio["chiave"])
        print(f"riprendo: {len(fatto):,} gia' fatti", flush=True)

    todo = []
    for tipo, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(C.TMDB / f, columns=["id", "overview", col])
        d = d[d["id"].map(lambda i: f"{tipo}:{int(i)}" in B["row_of"])]
        d = d[d["overview"].fillna("").str.strip().str.len() == 0]
        for i, t in zip(d["id"], d[col]):
            i = int(i); k = f"{tipo}:{i}"
            if k not in fatto:
                todo.append(((key, tipo, i), tipo, i, str(t)))
    print(f"da fare: {len(todo):,}", flush=True)
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
                print(f"  {k:,}/{len(todo):,} · riempiti {len(parte):,} · t {time.time()-t0:.0f}s", flush=True)
    parte = pd.DataFrame(righe)
    if out.exists():
        parte = pd.concat([pd.read_parquet(out), parte], ignore_index=True)
    parte = parte.drop_duplicates("chiave", keep="first")
    parte.to_parquet(out, index=False)
    print(f"FINE · {len(parte):,} sinossi recuperate · t {time.time()-t0:.0f}s", flush=True)
    print("per lingua:", parte["lang"].value_counts().to_dict(), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
