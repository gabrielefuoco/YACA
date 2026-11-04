"""mercury-banco.py — giudice Mammoth sui 499 semi del banco, fusioni RRF e MIX."""
import json, os, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np, pandas as pd, scipy.sparse as sp
from services.graph_dense import data as D
from services.graph_dense.data import _nomi
from services.graph_dense import config as C

MODEL = os.environ.get("MERCURY_MODEL", "baseten/mammoth-1:free")
URL = "https://openrouter.ai/api/alpha/decisions"; KG = 20; KCAND = 40
CACHE = ".cache/mercury-banco.jsonl"
INSTR = ("Is candidate {q} a good film for this viewer to watch NEXT, after the series described? "
         "Judge taste, tone and craft. Mere subject overlap (same animals, jobs, setting) or broad "
         "popularity does not count.")
KEY = os.environ["OPENROUTER_API_KEY"]
lock = threading.Lock(); STAT = {"ok": 0, "err": 0, "429": 0}

def ask(state, questions):
    body = json.dumps({"model": MODEL, "state": state, "questions": questions}).encode()
    for t in range(8):
        req = urllib.request.Request(URL, data=body, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                with lock: STAT["ok"] += 1
                return json.load(r)["answers"]
        except urllib.error.HTTPError as e:
            with lock: STAT["429" if e.code == 429 else "err"] += 1
            time.sleep(0.5 + 0.5 * t)
        except Exception:
            with lock: STAT["err"] += 1
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
    if not p.exists(): continue
    d = pd.read_parquet(p, columns=["id", "genres", cr, "cast", "keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"] = {"gen": ", ".join(_nomi(r.genres)), "crew": _nomi(getattr(r, cr))[:2],
                                       "cast": _nomi(r.cast)[:4], "kw": _nomi(r.keywords)[:6]}

def de(j):
    j = int(j); a = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    I = INFO.get(KEYS[j], {})
    return f'{T[j]}{a}{(" ["+I["gen"]+"]") if I.get("gen") else ""} — {ovw.get(KEYS[j], "")[:80]}'

def card(i):
    I = INFO.get(KEYS[i], {}); s = f'SERIES: {T[i]}'
    if YEAR[i] > 0: s += f' ({int(YEAR[i])})'
    if I.get('gen'): s += f'\nGENRES: {I["gen"]}'
    if I.get('crew'): s += f'\nCREATOR: {", ".join(I["crew"])}'
    if I.get('cast'): s += f'\nCAST: {", ".join(I["cast"])}'
    if I.get('kw'): s += f'\nKEYWORDS: {", ".join(I["kw"])}'
    return s + f'\nOVERVIEW: {ovw.get(KEYS[i], "")[:300]}\n'

g = json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json', encoding='utf-8'))
casi = []
for s in g['sources']:
    i = RO.get(s['id'])
    if i is None: continue
    l = [RO[x['id']] for x in s['links'] if x['id'] in RO]
    if l: casi.append((i, l))
print(f'semi {len(casi)}', flush=True)
cands, wg = {}, {}
for i, _ in casi:
    r = M.getrow(i); o = np.argsort(-r.data)
    c = [int(j) for j in r.indices[o] if j != i][:KCAND]
    cands[i] = c; wg[i] = {j: float(r[0, j]) for j in c}
res = {}
if os.path.exists(CACHE):
    for line in open(CACHE, encoding="utf-8"):
        r = json.loads(line); res[r["i"]] = r["p"]

def one(i):
    st = card(i) + "\nCANDIDATI (film proposti a questo spettatore):\n"
    st += "\n".join(f'{q+1}. {de(j)}' for q, j in enumerate(cands[i]))
    ans = ask(st, {f"c{q+1}": {"type": "noul", "instructions": INSTR.format(q=q + 1)} for q in range(len(cands[i]))})
    return i, [float(ans[f"c{q+1}"].get("noul", 0.0)) for q in range(len(cands[i]))]

todo = [i for i, _ in casi if i not in res]
print(f'da fare {len(todo)}', flush=True)
if todo:
    with ThreadPoolExecutor(max_workers=6) as ex, open(CACHE, "a", encoding="utf-8") as fh:
        fut = {ex.submit(one, i): i for i in todo}; done = 0
        for fu in as_completed(fut):
            try: i, p = fu.result()
            except Exception as e: print("ERR", fut[fu], e, flush=True); continue
            res[i] = p; fh.write(json.dumps({"i": i, "p": p}) + "\n"); fh.flush(); done += 1
            if done % 50 == 0: print(f'  {done}/{len(todo)} ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}', flush=True)

def valuta(rk):
    r10 = r20 = mrr = 0.0; n = 0
    for i, links in casi:
        if i not in res: continue
        pos = {j: p + 1 for p, j in enumerate(rk(i))}
        hits = [pos.get(int(j), 10 ** 9) for j in links]
        r10 += sum(1 for h in hits if h <= 10) / len(links)
        r20 += sum(1 for h in hits if h <= 20) / len(links)
        mrr += sum(1.0 / h if h <= 20 else 0.0 for h in hits) / len(links)
        n += 1
    return r10 / n, r20 / n, mrr / n, n

base = {i: sorted(c, key=lambda j: -wg[i][j]) for i, c in cands.items()}
print('\n| fusione | mu | R@10 | R@20 | MRR |'); print('|---|---|---:|---:|---:|')
r10, r20, mrr, n = valuta(lambda i: base[i])
print(f'| grafo V14 | 0 | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
for mu in (0.3, 0.5, 1.0):
    def rk(i, mu=mu):
        c = cands[i]; rg = {j: p for p, j in enumerate(base[i])}
        rm = {j: p for p, j in enumerate([c[x] for x in np.argsort(-np.array(res[i]))])}
        return sorted(c, key=lambda j: -(1 / (KG + rg[j]) + mu / (KG + rm[j])))
    r10, r20, mrr, n = valuta(rk)
    print(f'| RRF | {mu} | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
for mu in (0.1, 0.2, 0.3):
    def rk(i, mu=mu):
        c = cands[i]; qg = np.array([wg[i][j] for j in c], float); qg /= qg.sum()
        qm = np.array(res[i], float); qm /= max(qm.sum(), 1e-9)
        s = (1 - mu) * qg + mu * qm
        return [c[x] for x in np.argsort(-s)]
    r10, r20, mrr, n = valuta(rk)
    print(f'| MIX | {mu} | {r10:.3f} | {r20:.3f} | {mrr:.3f} |', flush=True)
