"""decider-20.py — i 5 nuovi decision model sui 20 casi piu' controversi.

  OPENROUTER_API_KEY=... py .scratch/distillazione-grafo/decider-20.py

I 20 casi sono scelti meccanicamente in .cache/decider-20-casi.json:
meta' per quanto i modelli cambiano il top-8 (MIX 0.5), meta' per disaccordo del giudice puro.
"""
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

NUOVI = [("pplxflash", "perplexity/pplx-decider-flash-v1.2"), ("span02", "respan/span-02"),
         ("clef", "cloudflare/clef-flash"), ("d1", "liquid/d1"), ("span01", "respan/span-01")]
VECCHI = {"mammoth": ".cache/decider-40-mammoth.jsonl", "pplx": ".cache/decider-40-pplx.jsonl",
          "mercury": ".cache/decider-40-mercury.jsonl", "span": ".cache/decider-40-span.jsonl"}
URL = "https://openrouter.ai/api/alpha/decisions"
KG = 20
KCAND = 40
PCACHE = ".cache/tmdb/person-names.json"
CASI = ".cache/decider-20-casi.json"
OUT = ".scratch/distillazione-grafo/decider-20.md"
INSTR = ("Is candidate {q} a good film for this viewer to watch NEXT, after the title described? "
         "Judge taste, tone and craft. Mere subject overlap (same animals, jobs, setting) or broad "
         "popularity does not count.")
KEY = os.environ["OPENROUTER_API_KEY"]
lock = threading.Lock()
STAT = {"ok": 0, "err": 0, "429": 0}
COSTO, TOKEN, CHIAM = {}, {}, {}


def ask(state, questions, modello, slug):
    body = json.dumps({"model": modello, "state": state, "questions": questions}).encode()
    for t in range(8):
        req = urllib.request.Request(URL, data=body, headers={
            "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                d = json.load(r)
            u = d.get("usage") or {}
            with lock:
                STAT["ok"] += 1
                COSTO[slug] = COSTO.get(slug, 0.0) + float(u.get("cost") or 0)
                TOKEN[slug] = TOKEN.get(slug, 0) + int(u.get("input_tokens") or 0)
                CHIAM[slug] = CHIAM.get(slug, 0) + 1
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


chiavi = json.load(open(CASI, encoding="utf-8"))
semi = [(k, T[RO[k]]) for k in chiavi if k in RO]
cands, wg = {}, {}
for key, _ in semi:
    i = RO[key]
    r = M.getrow(i)
    c = [int(j) for j in r.indices[np.argsort(-r.data)] if j != i][:KCAND]
    cands[key] = c
    wg[key] = np.array([float(r[0, j]) for j in c])
base = {k: list(cands[k]) for k, _ in semi}
RIS = {}
for slug, path in VECCHI.items():
    if os.path.exists(path):
        R = {json.loads(l)['key']: json.loads(l)['p'] for l in open(path, encoding="utf-8")}
        RIS[slug] = {k: R[k] for k, _ in semi if k in R}

for slug, mod in NUOVI:
    CACHE = f".cache/decider-20-{slug}.jsonl"
    R = {}
    if os.path.exists(CACHE):
        for line in open(CACHE, encoding="utf-8"):
            r = json.loads(line)
            R[r["key"]] = r["p"]
    todo = [k for k, _ in semi if k not in R]
    print(f'{slug}: cache {len(R)} · da fare {len(todo)} · {mod}', flush=True)

    def one(key, mod=mod, slug=slug):
        i = RO[key]
        c = cands[key]
        perm = np.random.default_rng(7).permutation(len(c))
        st = card(i) + "\nCANDIDATI (ordine casuale, senza significato):\n"
        st += "\n".join(f'{q+1}. {de(c[perm[q]])}' for q in range(len(c)))
        ans = ask(st, {f"c{q+1}": {"type": "noul", "instructions": INSTR.format(q=q + 1)} for q in range(len(c))},
                  mod, slug)
        p = np.zeros(len(c))
        for q in range(len(c)):
            p[perm[q]] = float(ans[f"c{q+1}"].get("noul", 0.0))
        return key, p.tolist()

    if todo:
        with ThreadPoolExecutor(max_workers=5) as ex, open(CACHE, "a", encoding="utf-8") as fh:
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
                if done % 5 == 0:
                    print(f'  {done}/{len(todo)} ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}', flush=True)
    RIS[slug] = R


def mix(key, p, mu):
    qg = wg[key] / wg[key].sum()
    qm = np.array(p) / max(float(np.sum(p)), 1e-9)
    return [cands[key][x] for x in np.argsort(-((1 - mu) * qg + mu * qm))]


ORDINE = ["mammoth"] + [s for s, _ in NUOVI]
righe = ['# Cinque nuovi decision model sui 20 casi controversi', '',
         'Selezione meccanica: metà per quanto i modelli cambiano il top-8 (MIX 0,5), metà per '
         'disaccordo del giudice puro. Card latinizzata, candidati mescolati (seme 7).', '',
         '## Profilo', '',
         '| modello | p media | >0,5 | accordo col grafo | stabilità MIX 0,5 | token/chiamata | costo 20 casi | costo 15.360 |',
         '|---|---:|---:|---:|---:|---:|---:|---:|']
RIF = RIS.get("mammoth") or next(iter(RIS.values()))
for slug in ORDINE:
    R = RIS[slug]
    ps = [np.array(R[k]) for k, _ in semi if k in R]
    if not ps:
        continue
    rho = np.median([np.corrcoef(np.argsort(np.argsort(-p)), np.arange(len(p)))[0, 1] for p in ps])
    st = np.mean([len(set(mix(k, R[k], 0.5)[:8]) & set(base[k][:8])) / 8 for k, _ in semi if k in R])
    tk = TOKEN.get(slug, 0) / max(CHIAM.get(slug, 1), 1)
    c20 = COSTO.get(slug, 0.0)
    c15 = c20 / max(CHIAM.get(slug, 1), 1) * 15360
    righe.append(f'| {slug} | {np.median([p.mean() for p in ps]):.3f} | '
                 f'{np.median([(p > 0.5).sum() for p in ps]):.0f} | {rho:+.3f} | {100*st:.0f}% | '
                 f'{tk:.0f} | {c20:.5f} $ | {c15:.2f} $ |')
righe += ['', '## I 20 casi (MIX μ=0,5)', '']
for k, nm in semi:
    righe.append(f'\n### {nm} — `{k}`')
    righe += ['', '| # | grafo V14 | ' + ' | '.join(ORDINE) + ' |', '|---|---|' + '---|' * len(ORDINE)]
    for q in range(8):
        celle = [T[mix(k, RIS[s][k], 0.5)[q]] for s in ORDINE if k in RIS.get(s, {})]
        righe.append(f'| {q+1} | {T[base[k][q]]} | ' + ' | '.join(celle) + ' |')
open(OUT, 'w', encoding="utf-8").write("\n".join(righe) + "\n")

print()
for slug in ORDINE:
    R = RIS.get(slug)
    if not R:
        continue
    ps = [np.array(R[k]) for k, _ in semi if k in R]
    st = np.mean([len(set(mix(k, R[k], 0.5)[:8]) & set(base[k][:8])) / 8 for k, _ in semi if k in R])
    print(f'{slug:<10} p {np.median([p.mean() for p in ps]):.3f} · stabilità {100*st:.0f}% · '
          f'token/chiamata {TOKEN.get(slug,0)/max(CHIAM.get(slug,1),1):.0f} · '
          f'costo 20 casi {COSTO.get(slug,0):.5f}$ · 15.360 titoli {COSTO.get(slug,0)/max(CHIAM.get(slug,1),1)*15360:.2f}$')
print(f'\nchiamate ok {STAT["ok"]} · err {STAT["err"]} · 429 {STAT["429"]}')
print(f'scritto {OUT}')
