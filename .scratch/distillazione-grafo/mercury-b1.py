"""mercury-b1.py — giudice Mammoth/Mercury sui soliti 40 casi, fusione col grafo V14.

  OPENROUTER_API_KEY=... py .scratch/distillazione-grafo/mercury-b1.py --semi 40

La chiave arriva SOLO dall'ambiente. Una chiamata per seme, 40 domande `noul`
(una per candidato). Due fusioni:
  RRF    1/(20+rango_grafo) + mu/(20+rango_mercury)     -> gemella del test Qwen3
  MIX    (1-mu)*q_grafo + mu*q_mercury                  -> miscela convessa di distribuzioni
"""
import argparse
import json
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import scipy.sparse as sp

from services.graph_dense import config as C
from services.graph_dense import data as D
from services.graph_dense.data import _nomi

MODEL = os.environ.get("MERCURY_MODEL", "baseten/mammoth-1:free")
URL = "https://openrouter.ai/api/alpha/decisions"
KG = 20
KCAND = 40
CACHE = ".cache/mercury-b1.jsonl"
OUT = ".scratch/distillazione-grafo/mercury-30x10.md"
INSTR = ("Is candidate {q} a good film for this viewer to watch NEXT, after the film described? "
         "Judge taste, tone and craft. Mere subject overlap (same animals, jobs, setting) or broad "
         "popularity does not count.")

FILM = [346698, 64690, 76341, 27205, 11216, 157336, 329, 603, 419430, 496243, 422, 807, 240, 582, 1417,
        406, 11093, 62215, 97370, 329865, 264660, 152601, 210577, 146233, 242582, 273481, 18148, 490, 797, 5156]
SERIE = [1438, 1920, 87108, 42009, 62560, 70523, 76331, 61222, 60574, 71446]

KEY = os.environ.get("OPENROUTER_API_KEY")
if not KEY:
    raise SystemExit("manca OPENROUTER_API_KEY nell'ambiente")
lock = threading.Lock()
STAT = {"ok": 0, "err": 0, "429": 0}


def ask(state, questions):
    body = json.dumps({"model": MODEL, "state": state, "questions": questions}).encode()
    for t in range(8):
        req = urllib.request.Request(URL, data=body, headers={
            "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                with lock:
                    STAT["ok"] += 1
                return json.load(r)["answers"]
        except urllib.error.HTTPError as e:
            with lock:
                STAT["429" if e.code == 429 else "err"] += 1
            time.sleep(0.5 + 0.5 * t)
        except Exception:
            with lock:
                STAT["err"] += 1
            time.sleep(1 + t)
    raise RuntimeError("ask failed")


B = D.basic(); N = B["N"]; T = B["titoli"]; RO = B["row_of"]; YEAR = B["year"]; KEYS = B["keys"]
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N)); del z
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
ovw = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}; del ov
INFO = {}
for tipo, f, cr in (("movie", "movies.parquet", "directors"), ("tv", "tv.parquet", "created_by")):
    p = C.TMDB / f
    if not p.exists():
        continue
    d = pd.read_parquet(p, columns=["id", "genres", cr, "cast", "keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"] = {
            "gen": ", ".join(_nomi(r.genres)),
            "crew": _nomi(getattr(r, cr))[:2],
            "cast": _nomi(r.cast)[:4],
            "kw": _nomi(r.keywords)[:6]}


def de(j):
    j = int(j)
    a = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    I = INFO.get(KEYS[j], {})
    g = f' [{I["gen"]}]' if I.get('gen') else ''
    return f'{T[j]}{a}{g} — {ovw.get(KEYS[j], "")[:80]}'


def card(i):
    I = INFO.get(KEYS[i], {})
    s = f'FILM: {T[i]}'
    if YEAR[i] > 0:
        s += f' ({int(YEAR[i])})'
    if I.get('gen'):
        s += f'\nGENRES: {I["gen"]}'
    if I.get('crew'):
        s += f'\nDIRECTOR/CREATOR: {", ".join(I["crew"])}'
    if I.get('cast'):
        s += f'\nCAST: {", ".join(I["cast"])}'
    if I.get('kw'):
        s += f'\nKEYWORDS: {", ".join(I["kw"])}'
    return s + f'\nOVERVIEW: {ovw.get(KEYS[i], "")[:300]}\n'


# ---- casi ----
ap = argparse.ArgumentParser()
ap.add_argument("--semi", type=int, default=40)
ap.add_argument("--workers", type=int, default=6)
a = ap.parse_args()
semi = [(f'movie:{t}', T[RO[f'movie:{t}']]) for t in FILM if f'movie:{t}' in RO]
semi += [(f'tv:{t}', T[RO[f'tv:{t}']]) for t in SERIE if f'tv:{t}' in RO]
semi = semi[:a.semi]
cands, wgraph = {}, {}
for key, _ in semi:
    i = RO[key]
    r = M.getrow(i)
    o = np.argsort(-r.data)
    c = [int(j) for j in r.indices[o] if j != i][:KCAND]
    cands[key] = c
    cands_w = {}
    for j in c:
        cands_w[j] = float(r[0, j])
    wgraph[key] = cands_w
print(f'semi {len(semi)} · chiamate {len(semi)} · modello {MODEL}', flush=True)

res = {}
if os.path.exists(CACHE):
    for line in open(CACHE, encoding="utf-8"):
        r = json.loads(line)
        res[r["key"]] = r["p"]
    print(f'dalla cache: {len(res)} casi', flush=True)
todo = [k for k, _ in semi if k not in res]


def one(item):
    key, nome = item
    i = RO[key]
    c = cands[key]
    st = card(i) + "\nCANDIDATI (film proposti a questo spettatore):\n"
    st += "\n".join(f'{q+1}. {de(j)}' for q, j in enumerate(c))
    ans = ask(st, {f"c{q+1}": {"type": "noul", "instructions": INSTR.format(q=q + 1)} for q in range(len(c))})
    p = [float(ans[f"c{q+1}"].get("noul", 0.0)) for q in range(len(c))]
    return key, p


if todo:
    with ThreadPoolExecutor(max_workers=a.workers) as ex, open(CACHE, "a", encoding="utf-8") as fh:
        fut = {ex.submit(one, (k, dict(semi)[k])): k for k in todo}
        done = 0
        for fu in as_completed(fut):
            try:
                key, p = fu.result()
            except Exception as e:
                print("ERR", fut[fu], e, flush=True); continue
            res[key] = p
            fh.write(json.dumps({"key": key, "p": p}) + "\n"); fh.flush()
            done += 1
            if done % 10 == 0:
                print(f'  {done}/{len(todo)} · ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}', flush=True)

# ---- fusioni ----
def rrf(mu, key):
    c = cands[key]
    w = wgraph[key]
    rg = {j: p for p, j in enumerate(sorted(c, key=lambda j: -w[j]))}
    p = res[key]
    rm = {j: p for p, j in enumerate([c[x] for x in np.argsort(-np.array(p))])}
    return sorted(c, key=lambda j: -(1 / (KG + rg[j]) + mu / (KG + rm[j])))


def mix(mu, key):
    c = cands[key]
    qg = np.array([wgraph[key][j] for j in c], float); qg /= qg.sum()
    qm = np.array(res[key], float); qm /= max(qm.sum(), 1e-9)
    s = (1 - mu) * qg + mu * qm
    return [c[x] for x in np.argsort(-s)]


base = {k: sorted(cands[k], key=lambda j: -wgraph[k][j]) for k, _ in semi}
righe = [f'# Mammoth ({MODEL}) vs grafo V14 — 30 film + 10 serie', '',
         f'Top-8. Giudice chiamato una volta per titolo, {KCAND} candidati come domande `noul`.', '',
         '## Fusione RRF (gemella del test Qwen3)', '']
for mu in (0.3, 0.5, 1.0):
    stab = [len(set(rrf(mu, k)[:8]) & set(base[k][:8])) / 8 for k, _ in semi]
    camb = sum(1 for k, _ in semi if set(rrf(mu, k)[:8]) != set(base[k][:8]))
    righe.append(f'- μ={mu}: top-8 diverso in **{camb}/{len(semi)}** · stabilità {100*np.mean(stab):.0f}%')
righe += ['', '## Miscela convessa di distribuzioni', '']
for mu in (0.1, 0.2, 0.3):
    stab = [len(set(mix(mu, k)[:8]) & set(base[k][:8])) / 8 for k, _ in semi]
    camb = sum(1 for k, _ in semi if set(mix(mu, k)[:8]) != set(base[k][:8]))
    righe.append(f'- μ={mu}: top-8 diverso in **{camb}/{len(semi)}** · stabilità {100*np.mean(stab):.0f}%')

righe += ['', '## Casi', '']
for key, nome in semi:
    a8 = base[key][:8]; b8 = rrf(0.3, key)[:8]
    if set(a8) == set(b8):
        continue
    righe.append(f'\n**{nome}** — `{key}`\n')
    for q in range(8):
        righe.append(f'- {q+1}. {T[b8[q]]:<45} (grafo: {T[a8[q]]})')
open(OUT, 'w', encoding='utf-8').write("\n".join(righe) + "\n")

print(f'\nchiamate ok {STAT["ok"]} · err {STAT["err"]} · 429 {STAT["429"]}')
for mu in (0.3, 0.5, 1.0):
    camb = sum(1 for k, _ in semi if set(rrf(mu, k)[:8]) != set(base[k][:8]))
    stab = np.mean([len(set(rrf(mu, k)[:8]) & set(base[k][:8])) / 8 for k, _ in semi])
    print(f'RRF  μ={mu}: cambiati {camb}/{len(semi)} · stabilità {100*stab:.0f}%')
for mu in (0.1, 0.2, 0.3):
    camb = sum(1 for k, _ in semi if set(mix(mu, k)[:8]) != set(base[k][:8]))
    stab = np.mean([len(set(mix(mu, k)[:8]) & set(base[k][:8])) / 8 for k, _ in semi])
    print(f'MIX  μ={mu}: cambiati {camb}/{len(semi)} · stabilità {100*stab:.0f}%')
print(f'scritto {OUT}')
