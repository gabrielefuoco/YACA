"""Test Jev (OpenRouter, typesafe/jev-1.14) su 6 casi: sceglie la lista migliore e con che confidenza.

Stato: film (titolo, anno, trama EN) + lista A (contenuto: trama+keyword+metadati, top-8) +
lista B (co-visione MovieLens vera Yc, finestra film-film, top-8).
Domanda: choice {content, covision, both, neither} con criteri; output probabilità + confidence.

Confronto atteso (giudizio umano sui 6):
  Oppenheimer -> content (i documentari); Povere creature! -> covision (arthouse);
  Perfetti -> content (remake); Barbie -> covision; Inside Out -> both; HotD -> content (no Yc).
"""
import json
import os
import urllib.error
import urllib.request

import numpy as np
import pandas as pd

from services.graph_dense import config as C, data as D

B = D.basic(); ro = B["row_of"]; is_tv = B["is_tv"]; N = B["N"]
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
for _tipo, _f, _col in (("movie", "movies.parquet", "genres"), ("tv", "tv.parquet", "genres")):
    _d = pd.read_parquet(C.TMDB / _f, columns=["id", _col])
    for _i, _g in zip(_d["id"], _d[_col]):
        try:
            _gen[f"{_tipo}:{int(_i)}"] = ", ".join(x.get("name", "") for x in json.loads(_g)) if isinstance(_g, str) else ""
        except Exception:
            _gen[f"{_tipo}:{int(_i)}"] = ""


def desc(i):
    ch = f"{'tv' if is_tv[i] else 'movie'}:{int(B['tmdb_id'][i])}" if "tmdb_id" in B else None
    return ""
CASES = [("movie:872585", "Oppenheimer"), ("movie:792307", "Povere creature!"),
         ("movie:381341", "Perfetti sconosciuti"), ("movie:346698", "Barbie"),
         ("movie:150540", "Inside Out"), ("tv:94997", "House of the Dragon")]
CRITERI = {
    "content": "List A films are similar to the film in theme, tone, style, genre, era or intended "
               "audience. Sharing only the title, brand or franchise is NOT enough: a children's cartoon "
               "with the same brand as an adult film is NOT a good match, and neither is a sequel that "
               "shares nothing but the name.",
    "covision": "List B films were watched by the same MovieLens audience as this film. This captures "
                "real taste, but can include films that are merely from the same release window or "
                "that are popular with the same broad audience without being similar.",
    "both": "Both lists are good sets of similar films, for different reasons.",
    "neither": "Neither list is a good set of similar films for this film.",
}


def yr(i):
    return int(date[i] // 365.25 + 1970) if date[i] > 0 else "?"


def tit(i):
    return f"{B['titoli'][int(i)]} ({yr(int(i))})"


def liste(key):
    i = ro[key]
    cc = CONT[i] @ CONT.T; cc[i] = -1e4
    tc = np.argsort(-cc)[:8]
    cy = Yc[i] @ Yc.T; cy[i] = -1e4
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120)
        cy[near] *= 0.2
    ty = np.argsort(-cy)[:8]
    def d(j):
        j = int(j)
        key2 = next((k for k, r in ro.items() if r == j), None)
        g = _gen.get(key2, "") if key2 else ""
        o = (ovm.get(key2, "") or "")[:110].replace(chr(10), " ")
        return f"{tit(j)} [{g}] — {o}"
    return [d(j) for j in tc], [d(j) for j in ty], bool(np.linalg.norm(Yc[i]) > 0)


def main():
    key = os.environ.get("OPENROUTER_API_KEY") or json.load(open(os.path.expanduser("~/.pi/agent/auth.json")))["openrouter"]["key"]
    print(f"chiave openrouter: ...{key[-4:]} · lunghezza {len(key)}", flush=True)
    for key_, nome in CASES:
        i = ro[key_]
        A, Bl, has_yc = liste(key_)
        stato = (f"FILM: {B['titoli'][i]} ({yr(i)})\n"
                 f"OVERVIEW: {ovm.get(key_, '')[:400]}\n\n"
                 "LIST A (content similarity):\n" + "\n".join("- " + x for x in A) +
                 "\n\nLIST B (same MovieLens audience):\n" +
                 ("\n".join("- " + x for x in Bl) if has_yc else "- (no MovieLens co-vision available)"))
        b = {"model": "typesafe/jev-1.14", "state": stato,
             "questions": {
                 "A_good": {"type": "noul", "instructions": "Is list A a good set of films similar to the film described in theme, tone, style or intended audience? Sharing only the brand, title or franchise does not count."},
                 "B_good": {"type": "noul", "instructions": "Is list B a good set of films similar to the film described in theme, tone, style or intended audience? Sharing only the release window or broad popularity does not count."},
             }}
        req = urllib.request.Request(
            "https://openrouter.ai/api/alpha/decisions", data=json.dumps(b).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                ans = json.load(r)["answers"]
            print(f"\n### {nome}", flush=True)
            print("A: " + " · ".join(A), flush=True)
            print("B: " + " · ".join(Bl) if has_yc else "B: (nessuna co-visione)", flush=True)
            print("JEV:", json.dumps(ans), flush=True)
        except urllib.error.HTTPError as e:
            print(f"\n### {nome} · HTTP {e.code}: {e.read(300).decode()[:300]}", flush=True)
        except Exception as e:
            print(f"\n### {nome} · ERR {e}", flush=True)


if __name__ == "__main__":
    main()
