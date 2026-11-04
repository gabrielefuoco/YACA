"""decider-40.py — i soliti 40 casi con piu' decision model a confronto, e il costo misurato.

  OPENROUTER_API_KEY=... py .scratch/distillazione-grafo/decider-40.py

Card latinizzata, candidati mescolati (seme 7), 40 domande `noul` per titolo.
Cache per modello: .cache/decider-40-<slug>.jsonl
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

MODELLI = [("mammoth", "baseten/mammoth-1:free"), ("pplx", "perplexity/pplx-decider-v1.2"),
           ("mercury", "inception/mercury-decide"), ("span", "respan/span-01-lite")]
URL = "https://openrouter.ai/api/alpha/decisions"
KG = 20
KCAND = 40
PCACHE = ".cache/tmdb/person-names.json"
OUT = ".scratch/distillazione-grafo/decider-40.md"
INSTR = ("Is candidate {q} a good film for this viewer to watch NEXT, after the title described? "
         "Judge taste, tone and craft. Mere subject overlap (same animals, jobs, setting) or broad "
         "popularity does not count.")
FILM = [346698, 64690, 76341, 27205, 11216, 157336, 329, 603, 419430, 496243, 422, 807, 240, 582, 1417,
        406, 11093, 62215, 97370, 329865, 264660, 152601, 210577, 146233, 242582, 273481, 18148, 490, 797, 5156]
SERIE = [1438, 1920, 87108, 42009, 62560, 70523, 76331, 61222, 60574, 71446]
KEY = os.environ["OPENROUTER_API_KEY"]
lock = threading.Lock()
STAT = {"ok": 0, "err": 0, "429": 0}
COSTO = {}


def ask(state, questions, modello):
    body = json.dumps({"model": modello, "state": state, "questions": questions}).encode()
    for t in range(8):
        req = urllib.request.Request(URL, data=body, headers={
            "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                d = json.load(r)
            with lock:
                STAT["ok"] += 1
                COSTO[modello] = COSTO.get(modello, 0.0) + float((d.get("usage") or {}).get("cost") or 0)
            return d["answers"]
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


def _pers(x):
    if not isinstance(x, str) or not x.strip():
        return []
    try:
        v = json.loads(x)
    except Exception:
        return []
    return [(int(e.get("id", 0)), str(e["name"])) for e in (v if isinstance(v, list) else [])
            if isinstance(e, dict) and e.get("name")]


INFO = {}
for tipo, f, cr in (("movie", "movies.parquet", "directors"), ("tv", "tv.parquet", "created_by")):
    p = C.TMDB / f
    if not p.exists():
        continue
    d = pd.read_parquet(p, columns=["id", "genres", cr, "cast", "keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"] = {"gen": ", ".join(_nomi(r.genres)), "crew": _pers(getattr(r, cr))[:2],
                                       "cast": _pers(r.cast)[:4], "kw": _nomi(r.keywords)[:6]}
PN = json.load(open(PCACHE, encoding="utf-8")) if os.path.exists(PCACHE) else {}


def nome(pid, nat):
    return nat if nat.isascii() else PN.get(str(pid), nat)


def de(j):
    j = int(j)
    a = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    I = INFO.get(KEYS[j], {})
    return f'{T[j]}{a}{(" [" + I["gen"] + "]") if I.get("gen") else ""} — {ovw.get(KEYS[j], "")[:80]}'


def card(i):
    tipo = 'FILM' if KEYS[i].startswith('movie:') else 'SERIES'
    I = INFO.get(KEYS[i], {})
    s = f'{tipo}: {T[i]}'
    if YEAR[i] > 0:
        s += f' ({int(YEAR[i])})'
    if I.get('gen'):
        s += f'\nGENRES: {I["gen"]}'
    if I.get('crew'):
        s += f'\n{"DIRECTOR" if tipo == "FILM" else "CREATOR"}: ' + ", ".join(nome(p, n) for p, n in I["crew"])
    if I.get('cast'):
        s += f'\nCAST: ' + ", ".join(nome(p, n) for p, n in I["cast"])
    if I.get('kw'):
        s += f'\nKEYWORDS: {", ".join(I["kw"])}'
    return s + f'\nOVERVIEW: {ovw.get(KEYS[i], "")[:300]}\n'


semi = [(f'movie:{t}', T[RO[f'movie:{t}']]) for t in FILM if f'movie:{t}' in RO]
semi += [(f'tv:{t}', T[RO[f'tv:{t}']]) for t in SERIE if f'tv:{t}' in RO]
cands, wg = {}, {}
for key, _ in semi:
    i = RO[key]
    r = M.getrow(i)
    c = [int(j) for j in r.indices[np.argsort(-r.data)] if j != i][:KCAND]
    cands[key] = c
    wg[key] = np.array([float(r[0, j]) for j in c])
base = {k: list(cands[k]) for k, _ in semi}

ap = argparse.ArgumentParser()
ap.add_argument("--workers", type=int, default=6)
ap.add_argument("--modelli", default="pplx,mercury")
a = ap.parse_args()
scelti = [m for m in MODELLI if m[0] in a.modelli.split(",")]

RIS = {}
for slug, mod in scelti:
    CACHE = f".cache/decider-40-{slug}.jsonl"
    if not os.path.exists(CACHE) and slug == "mammoth" and os.path.exists(".cache/mercury-b1c.jsonl"):
        os.makedirs(".cache", exist_ok=True)
        with open(CACHE, "w", encoding="utf-8") as fh:
            for line in open(".cache/mercury-b1c.jsonl", encoding="utf-8"):
                fh.write(line)
    R = {}
    if os.path.exists(CACHE):
        for line in open(CACHE, encoding="utf-8"):
            r = json.loads(line)
            R[r["key"]] = r["p"]
    todo = [k for k, _ in semi if k not in R]
    print(f'{slug}: {len(R)} in cache · {len(todo)} da fare · {mod}', flush=True)

    def one(key, mod=mod):
        i = RO[key]
        c = cands[key]
        perm = np.random.default_rng(7).permutation(len(c))
        st = card(i) + "\nCANDIDATI (ordine casuale, senza significato):\n"
        st += "\n".join(f'{q+1}. {de(c[perm[q]])}' for q in range(len(c)))
        ans = ask(st, {f"c{q+1}": {"type": "noul", "instructions": INSTR.format(q=q + 1)} for q in range(len(c))}, mod)
        p = np.zeros(len(c))
        for q in range(len(c)):
            p[perm[q]] = float(ans[f"c{q+1}"].get("noul", 0.0))
        return key, p.tolist()

    if todo:
        with ThreadPoolExecutor(max_workers=a.workers) as ex, open(CACHE, "a", encoding="utf-8") as fh:
            fut = {ex.submit(one, k): k for k in todo}
            done = 0
            for fu in as_completed(fut):
                try:
                    key, p = fu.result()
                except Exception as e:
                    print("ERR", fut[fu], e, flush=True); continue
                R[key] = p
                fh.write(json.dumps({"key": key, "p": p}) + "\n"); fh.flush()
                done += 1
                if done % 10 == 0:
                    print(f'  {done}/{len(todo)} ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}', flush=True)
    RIS[slug] = R


def mix(key, p, mu):
    c = cands[key]
    qg = wg[key] / wg[key].sum()
    qm = np.array(p) / max(float(np.sum(p)), 1e-9)
    return [c[x] for x in np.argsort(-((1 - mu) * qg + mu * qm))]


def puro(key, p):
    c = cands[key]
    return [c[x] for x in np.argsort(-np.array(p))]


righe = ['# Tre decision model sui soliti 40 casi', '',
         'Card latinizzata, candidati mescolati (seme 7), 40 domande `noul`.', '',
         '## Profilo dei giudici', '',
         '| modello | mod. p | >0,5 | >0,8 | correlazione con l\'ordine del grafo |',
         '|---|---:|---:|---:|---:|']
for slug, R in RIS.items():
    ps = [np.array(R[k]) for k, _ in semi]
    rho = np.median([np.corrcoef(np.argsort(np.argsort(-p)), np.arange(len(p)))[0, 1] for p in ps])
    righe.append(f'| {slug} | {np.median([p.mean() for p in ps]):.3f} | '
                 f'{np.median([(p > 0.5).sum() for p in ps]):.0f} | '
                 f'{np.median([(p > 0.8).sum() for p in ps]):.0f} | {rho:+.3f} |')
righe += ['', '## Fusione MIX', '', '| modello | μ | top-8 diverso | stabilità |', '|---|---:|---:|---:|']
for slug, R in RIS.items():
    for mu in (0.5, 0.7):
        camb = sum(1 for k, _ in semi if set(mix(k, R[k], mu)[:8]) != set(base[k][:8]))
        st = np.mean([len(set(mix(k, R[k], mu)[:8]) & set(base[k][:8])) / 8 for k, _ in semi])
        righe.append(f'| {slug} | {mu} | {camb}/40 | {100*st:.0f}% |')
righe += ['', '## Accordo fra giudici (correlazione di Spearman sulle p)', '']
sl = list(RIS)
if len(sl) > 1:
    righe += ['| | ' + ' | '.join(sl) + ' |', '|---|' + '---:|' * len(sl)]
    for x in sl:
        celle = []
        for y in sl:
            v = [np.corrcoef(np.argsort(np.argsort(RIS[x][k])), np.argsort(np.argsort(RIS[y][k])))[0, 1]
                 for k, _ in semi]
            celle.append(f'{np.median(v):+.2f}')
        righe.append(f'| **{x}** | ' + ' | '.join(celle) + ' |')
righe += ['', '## I 40 casi (MIX μ=0,5)', '']
for k, nm in semi:
    righe.append(f'\n### {nm} — `{k}`')
    righe += ['', '| # | grafo V14 | ' + ' | '.join(sl) + ' |', '|---|---|' + '---|' * len(sl)]
    for q in range(8):
        righe.append(f'| {q+1} | {T[base[k][q]]} | ' + ' | '.join(T[mix(k, RIS[s][k], 0.5)[q]] for s in sl) + ' |')
open(OUT, 'w', encoding='utf-8').write("\n".join(righe) + "\n")

print()
for slug, R in RIS.items():
    ps = [np.array(R[k]) for k, _ in semi]
    print(f'{slug:<9} p media {np.median([p.mean() for p in ps]):.3f} · >0,5 '
          f'{np.median([(p>0.5).sum() for p in ps]):.0f}/40 · costo {COSTO.get(dict(scelti)[slug],0):.5f} $')
for slug, R in RIS.items():
    for mu in (0.5, 0.7):
        camb = sum(1 for k, _ in semi if set(mix(k, R[k], mu)[:8]) != set(base[k][:8]))
        st = np.mean([len(set(mix(k, R[k], mu)[:8]) & set(base[k][:8])) / 8 for k, _ in semi])
        print(f'  {slug} MIX {mu}: cambiati {camb}/40 · stabilità {100*st:.0f}%')
print(f'\ncosto totale misurato: {sum(COSTO.values()):.5f} $')
print(f'scritto {OUT}')
