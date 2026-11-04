"""mercury-banco2.py — Mammoth sui 499 semi del banco. Card latinizzata, candidati mescolati.

  OPENROUTER_API_KEY=... py .scratch/distillazione-grafo/mercury-banco2.py --workers 6
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
CACHE = ".cache/mercury-banco2.jsonl"
PCACHE = ".cache/tmdb/person-names.json"
INSTR = ("Is candidate {q} a good film for this viewer to watch NEXT, after the series described? "
         "Judge taste, tone and craft. Mere subject overlap (same animals, jobs, setting) or broad "
         "popularity does not count.")
KEY = os.environ["OPENROUTER_API_KEY"]
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

KMDB = [l.split('=', 1)[1].strip() for l in (C.ROOT / '.env').read_text(encoding='utf-8', errors='ignore')
        .splitlines() if l.startswith('TMDB_API_KEY=')][0]
PN = json.load(open(PCACHE, encoding='utf-8')) if os.path.exists(PCACHE) else {}

g = json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json', encoding='utf-8'))
casi = []
for s in g['sources']:
    i = RO.get(s['id'])
    if i is None:
        continue
    l = [RO[x['id']] for x in s['links'] if x['id'] in RO]
    if l:
        casi.append((i, l))
print(f'semi {len(casi)}', flush=True)

pids = set()
for i, _ in casi:
    I = INFO.get(KEYS[i], {})
    pids |= {p for p, n in I.get('crew', []) if not n.isascii()}
    pids |= {p for p, n in I.get('cast', []) if not n.isascii()}
todo_p = [p for p in pids if str(p) not in PN]
print(f'nomi non latini da TMDB: {len(todo_p)}', flush=True)
if todo_p:
    def one_p(pid):
        u = f"https://api.themoviedb.org/3/person/{pid}?api_key={KMDB}&language=en-US"
        for t in range(3):
            try:
                with urllib.request.urlopen(u, timeout=40) as r:
                    d = json.load(r)
                nm = d.get("name") or ""
                if nm.isascii():
                    return pid, nm
                aka = [x.strip() for x in d.get("also_known_as", []) if x.strip().isascii()]
                return pid, (aka[0] if aka else nm)
            except Exception:
                time.sleep(0.5 + t)
        return pid, None
    with ThreadPoolExecutor(max_workers=16) as ex:
        for pid, nm in ex.map(one_p, todo_p):
            if nm:
                PN[str(pid)] = nm
    json.dump(PN, open(PCACHE, "w", encoding="utf-8"), ensure_ascii=False)
print(f'nomi in cache: {len(PN)}', flush=True)


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


cands, wg = {}, {}
for i, _ in casi:
    r = M.getrow(i)
    c = [int(j) for j in r.indices[np.argsort(-r.data)] if j != i][:KCAND]
    cands[i] = c
    wg[i] = np.array([float(r[0, j]) for j in c])
res = {}
if os.path.exists(CACHE):
    for line in open(CACHE, encoding="utf-8"):
        r = json.loads(line)
        res[r["i"]] = r["p"]
rng = np.random.default_rng(11)


def one(i):
    c = cands[i]
    perm = rng.permutation(len(c))
    st = card(i) + "\nCANDIDATI (ordine casuale, senza significato):\n"
    st += "\n".join(f'{q+1}. {de(c[perm[q]])}' for q in range(len(c)))
    ans = ask(st, {f"c{q+1}": {"type": "noul", "instructions": INSTR.format(q=q + 1)} for q in range(len(c))})
    p = np.zeros(len(c))
    for q in range(len(c)):
        p[perm[q]] = float(ans[f"c{q+1}"].get("noul", 0.0))
    return i, p.tolist()


ap = argparse.ArgumentParser()
ap.add_argument("--workers", type=int, default=6)
a = ap.parse_args()
todo = [i for i, _ in casi if i not in res]
print(f'da fare {len(todo)}', flush=True)
if todo:
    with ThreadPoolExecutor(max_workers=a.workers) as ex, open(CACHE, "a", encoding="utf-8") as fh:
        fut = {ex.submit(one, i): i for i in todo}
        done = 0
        for fu in as_completed(fut):
            try:
                i, p = fu.result()
            except Exception as e:
                print("ERR", fut[fu], e, flush=True); continue
            res[i] = p
            fh.write(json.dumps({"i": i, "p": p}) + "\n"); fh.flush()
            done += 1
            if done % 50 == 0:
                print(f'  {done}/{len(todo)} ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}', flush=True)

pos_g = {i: {j: p for p, j in enumerate(cands[i])} for i, _ in casi}


def rk_mix(i, mu):
    c = cands[i]
    qg = wg[i] / wg[i].sum()
    qm = np.array(res[i]) / max(float(np.sum(res[i])), 1e-9)
    return [c[x] for x in np.argsort(-((1 - mu) * qg + mu * qm))]


def rk_rrf(i, mu):
    c = cands[i]
    rg = pos_g[i]
    rm = {j: p for p, j in enumerate([c[x] for x in np.argsort(-np.array(res[i]))])}
    return sorted(c, key=lambda j: -(1 / (KG + rg[j]) + mu / (KG + rm[j])))


def rk_puro(i):
    c = cands[i]
    return [c[x] for x in np.argsort(-np.array(res[i]))]


def valuta(f):
    r10 = r20 = mrr = 0.0
    n = 0
    for i, links in casi:
        if i not in res:
            continue
        out = f(i)
        pos = {j: p + 1 for p, j in enumerate(out)}
        hits = [pos.get(int(j), 10 ** 9) for j in links]
        r10 += sum(1 for h in hits if h <= 10) / len(links)
        r20 += sum(1 for h in hits if h <= 20) / len(links)
        mrr += sum(1.0 / h if h <= 20 else 0.0 for h in hits) / len(links)
        n += 1
    return r10 / n, r20 / n, mrr / n, n


print()
print('| fusione | mu | R@10 | R@20 | MRR |')
print('|---|---|---:|---:|---:|')
r10, r20, mrr, n = valuta(lambda i: cands[i])
print(f'| grafo V14 | - | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
r10, r20, mrr, n = valuta(rk_puro)
print(f'| puro | 1.0 | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
for mu in (0.3, 0.5, 0.7, 0.8):
    r10, r20, mrr, n = valuta(lambda i, m=mu: rk_mix(i, m))
    print(f'| MIX | {mu} | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
for mu in (0.3, 0.8, 1.0):
    r10, r20, mrr, n = valuta(lambda i, m=mu: rk_rrf(i, m))
    print(f'| RRF | {mu} | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
print(f'\nsemi valutati {n} · chiamate ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}')
