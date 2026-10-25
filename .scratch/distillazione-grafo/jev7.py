"""Test Jev con 6 pool candidati + none, su 6 casi.

Pool: cov (Yc MovieLens, finestra), trama (Bp), kw (Bk), meta (Bm),
      cont (trama+kw+meta), combo (0.5*cov + 0.5*cont).
Domanda: choice tra i 6 + none, con criteri; output probabilità + confidence.
"""
import json
import os
import urllib.error
import urllib.request

import numpy as np
import pandas as pd

from services.graph_dense import config as C, data as D

B = D.basic(); ro = B["row_of"]; N = B["N"]; is_tv = B["is_tv"]
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
Bm = np.load(C.DATA / "meta-jl.npz")["Bm"].astype(np.float32)
CONT = np.concatenate([Bp, np.sqrt(0.5) * Bk, np.sqrt(0.5) * Bm], 1)
CONT /= (np.linalg.norm(CONT, axis=1, keepdims=True) + 1e-9)
date = np.load(C.DATA / "uscite-ordinali.npy")
ov = pd.read_parquet(C.DATA / "overview-en.parquet")
ovm = {str(r.chiave): r.overview for r in ov.itertuples()}
_gen = {}
for _tipo, _f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    _d = pd.read_parquet(C.TMDB / _f, columns=["id", "genres"])
    for _i, _g in zip(_d["id"], _d["genres"]):
        try:
            _gen[f"{_tipo}:{int(_i)}"] = ", ".join(x.get("name", "") for x in json.loads(_g)) if isinstance(_g, str) else ""
        except Exception:
            _gen[f"{_tipo}:{int(_i)}"] = ""
_rev = {r: k for k, r in ro.items()}
CASES = [("movie:872585", "Oppenheimer"), ("movie:792307", "Povere creature!"),
         ("movie:381341", "Perfetti sconosciuti"), ("movie:346698", "Barbie"),
         ("movie:150540", "Inside Out"), ("tv:94997", "House of the Dragon")]


def yr(i):
    return int(date[i] // 365.25 + 1970) if date[i] > 0 else "?"


def desc(j):
    j = int(j); k = _rev.get(j)
    g = _gen.get(k, "") if k else ""
    o = (ovm.get(k, "") or "")[:90].replace(chr(10), " ")
    return f"{B['titoli'][j]} ({yr(j)}) [{g}] — {o}"


def pools(i):
    cov = Yc[i] @ Yc.T; cov[i] = -1e4
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120)
        cov[near] *= 0.2
    tr = Bp[i] @ Bp.T; tr[i] = -1e4
    kw = Bk[i] @ Bk.T; kw[i] = -1e4
    me = Bm[i] @ Bm.T; me[i] = -1e4
    co = CONT[i] @ CONT.T; co[i] = -1e4
    cb = 0.5 * (cov / (cov.max() + 1e-9)) + 0.5 * (co / (co.max() + 1e-9)); cb[i] = -1e4
    scs = {"cov": cov, "trama": tr, "kw": kw, "meta": me, "cont": co, "combo": cb}
    out = {name: [desc(j) for j in np.argsort(-sc)[:8]] for name, sc in scs.items()}
    return out, scs


CRITERI = {
    "cov": "Same MovieLens audience (real co-vision). Captures taste, but can include films merely released in the same window.",
    "trama": "Plot-summary similarity. Captures story and theme, but can be fooled by names or words.",
    "kw": "Shared keywords and themes. Sparse and noisy, but often precise on topic.",
    "meta": "Same cast, crew, studio, collection, era. Structural/franchise similarity, not necessarily tone.",
    "cont": "Blend of plot, keywords and metadata: balanced content similarity.",
    "combo": "Blend of audience co-vision and content: taste plus content.",
    "none": "None of these lists is a good set of similar films for this film.",
}


def main():
    key = os.environ.get("OPENROUTER_API_KEY") or json.load(open(os.path.expanduser("~/.pi/agent/auth.json")))["openrouter"]["key"]
    for key_, nome in CASES:
        i = ro[key_]
        P, SCS = pools(i)
        stato = (f"FILM: {B['titoli'][i]} ({yr(i)}) [{_gen.get(key_, '')}]\n"
                 f"OVERVIEW: {(ovm.get(key_, '') or '')[:400]}\n")
        for name in ("cov", "trama", "kw", "meta", "cont", "combo"):
            stato += f"\nLIST {name.upper()}:\n" + "\n".join("- " + x for x in P[name])
        b = {"model": "typesafe/jev-1.14", "state": stato,
             "questions": {"best": {"type": "choice",
                                    "instructions": "Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, same release window or same broad popularity alone do not count. If none is good, choose none.",
                                    "criteria": CRITERI}}}
        req = urllib.request.Request(
            "https://openrouter.ai/api/alpha/decisions", data=json.dumps(b).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                ans = json.load(r)["answers"]["best"]
            print(f"\n### {nome}", flush=True)
            print("JEV:", json.dumps(ans), flush=True)
            pr = ans.get("probabilities", {})
            w = {k: v for k, v in pr.items() if k != "none" and v > 0}
            tot = sum(w.values()) or 1.0
            mix = np.zeros(N, np.float32)
            for k, v in w.items():
                sc = SCS[k].copy(); sc[i] = -1e4
                mix += (v / tot) * (sc / (sc.max() + 1e-9))
            mix[i] = -1e4
            print("TARGET:", " · ".join(desc(j) for j in np.argsort(-mix)[:8]), flush=True)
            print(f"none={pr.get('none', 0):.2f}", flush=True)
        except urllib.error.HTTPError as e:
            print(f"\n### {nome} · HTTP {e.code}: {e.read(300).decode()[:300]}", flush=True)
        except Exception as e:
            print(f"\n### {nome} · ERR {e}", flush=True)


if __name__ == "__main__":
    main()
