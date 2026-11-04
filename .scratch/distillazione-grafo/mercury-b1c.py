"""mercury-b1c.py — 40 casi, versione corretta: nomi latinizzati, FILM/SERIES giusto,
candidati in ordine casuale. Confronta riordino puro, RRF e miscela convessa.

  OPENROUTER_API_KEY=... py .scratch/distillazione-grafo/mercury-b1c.py
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

MODEL = os.environ.get("MERCURY_MODEL", "baseten/mammoth-1:free")
URL = "https://openrouter.ai/api/alpha/decisions"
KG = 20
KCAND = 40
CACHE = ".cache/mercury-b1c.jsonl"
PCACHE = ".cache/tmdb/person-names.json"
OUT = ".scratch/distillazione-grafo/mercury-40-corretto.md"
INSTR = ("Is candidate {q} a good film for this viewer to watch NEXT, after the title described? "
         "Judge taste, tone and craft. Mere subject overlap (same animals, jobs, setting) or broad "
         "popularity does not count.")

FILM = [346698, 64690, 76341, 27205, 11216, 157336, 329, 603, 419430, 496243, 422, 807, 240, 582, 1417,
        406, 11093, 62215, 97370, 329865, 264660, 152601, 210577, 146233, 242582, 273481, 18148, 490, 797, 5156]
SERIE = [1438, 1920, 87108, 42009, 62560, 70523, 76331, 61222, 60574, 71446]

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
    """Colonna TMDB (stringa JSON) -> [(id, nome_nativo)]."""
    if not isinstance(x, str) or not x.strip():
        return []
    try:
        v = json.loads(x)
    except Exception:
        return []
    out = []
    for e in (v if isinstance(v, list) else []):
        if isinstance(e, dict) and e.get("name"):
            out.append((int(e.get("id", 0)), str(e["name"])))
    return out


INFO = {}
for tipo, f, cr in (("movie", "movies.parquet", "directors"), ("tv", "tv.parquet", "created_by")):
    p = C.TMDB / f
    if not p.exists():
        continue
    d = pd.read_parquet(p, columns=["id", "genres", cr, "cast", "keywords"])
    for r in d.itertuples(index=False):
        crew = _pers(getattr(r, cr))
        cast = _pers(r.cast)
        INFO[f"{tipo}:{int(r.id)}"] = {
            "gen": ", ".join(_nomi(r.genres)),
            "crew": crew[:2],
            "cast": cast[:4],
            "kw": _nomi(r.keywords)[:6]}

# ---- nomi latinizzati ----
KMDB = [l.split('=', 1)[1].strip() for l in (C.ROOT / '.env').read_text(encoding='utf-8', errors='ignore')
        .splitlines() if l.startswith('TMDB_API_KEY=')][0]
PN = json.load(open(PCACHE, encoding='utf-8')) if os.path.exists(PCACHE) else {}


def nome(pid, nat):
    if nat.isascii():
        return nat
    if str(pid) in PN:
        return PN[str(pid)]
    return nat


def scarica_nomi(pids):
    todo = [p for p in pids if str(p) not in PN]
    if not todo:
        return
    print(f'nomi da TMDB: {len(todo)}', flush=True)

    def one(pid):
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
        for pid, nm in ex.map(one, todo):
            if nm:
                PN[str(pid)] = nm
    json.dump(PN, open(PCACHE, "w", encoding="utf-8"), ensure_ascii=False)


semi = [(f'movie:{t}', T[RO[f'movie:{t}']]) for t in FILM if f'movie:{t}' in RO]
semi += [(f'tv:{t}', T[RO[f'tv:{t}']]) for t in SERIE if f'tv:{t}' in RO]
pids = set()
for key, _ in semi:
    I = INFO.get(key, {})
    pids |= {p for p, _ in I.get('crew', [])} | {p for p, _ in I.get('cast', [])}
scarica_nomi(sorted(pids))


def de(j):
    j = int(j)
    a = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    I = INFO.get(KEYS[j], {})
    return f'{T[j]}{a}{(" ["+I["gen"]+"]") if I.get("gen") else ""} — {ovw.get(KEYS[j], "")[:80]}'


def card(i):
    tipo = 'FILM' if KEYS[i].startswith('movie:') else 'SERIES'
    I = INFO.get(KEYS[i], {})
    s = f'{tipo}: {T[i]}'
    if YEAR[i] > 0:
        s += f' ({int(YEAR[i])})'
    if I.get('gen'):
        s += f'\nGENRES: {I["gen"]}'
    if I.get('crew'):
        s += f'\n{"DIRECTOR" if tipo=="FILM" else "CREATOR"}: ' + ", ".join(nome(p, n) for p, n in I["crew"])
    if I.get('cast'):
        s += f'\nCAST: ' + ", ".join(nome(p, n) for p, n in I["cast"])
    if I.get('kw'):
        s += f'\nKEYWORDS: {", ".join(I["kw"])}'
    return s + f'\nOVERVIEW: {ovw.get(KEYS[i], "")[:300]}\n'


cands, wgraph = {}, {}
for key, _ in semi:
    i = RO[key]
    r = M.getrow(i)
    c = [int(j) for j in r.indices[np.argsort(-r.data)] if j != i][:KCAND]
    cands[key] = c
    wgraph[key] = {j: float(r[0, j]) for j in c}

print(f'semi {len(semi)} · candidati mescolati · modello {MODEL}', flush=True)
res = {}
if os.path.exists(CACHE):
    for line in open(CACHE, encoding="utf-8"):
        r = json.loads(line)
        res[r["key"]] = r["p"]
    print(f'dalla cache: {len(res)}', flush=True)
rng = np.random.default_rng(7)


def one(item):
    key, _ = item
    i = RO[key]
    c = cands[key]
    perm = rng.permutation(len(c))
    st = card(i) + "\nCANDIDATI (ordine casuale, senza significato):\n"
    st += "\n".join(f'{q+1}. {de(c[perm[q]])}' for q in range(len(c)))
    ans = ask(st, {f"c{q+1}": {"type": "noul", "instructions": INSTR.format(q=q + 1)} for q in range(len(c))})
    p = np.zeros(len(c))
    for q in range(len(c)):
        p[perm[q]] = float(ans[f"c{q+1}"].get("noul", 0.0))
    return key, p.tolist()


todo = [k for k, _ in semi if k not in res]
if todo:
    with ThreadPoolExecutor(max_workers=6) as ex, open(CACHE, "a", encoding="utf-8") as fh:
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
                print(f'  {done}/{len(todo)} ok {STAT["ok"]} err {STAT["err"]} 429 {STAT["429"]}', flush=True)

base = {k: sorted(cands[k], key=lambda j: -wgraph[k][j]) for k, _ in semi}


def rk_puro(k):
    c = cands[k]
    return [c[x] for x in np.argsort(-np.array(res[k]))]


def rk_rrf(k, mu):
    c = cands[k]
    rg = {j: p for p, j in enumerate(base[k])}
    rm = {j: p for p, j in enumerate([c[x] for x in np.argsort(-np.array(res[k]))])}
    return sorted(c, key=lambda j: -(1 / (KG + rg[j]) + mu / (KG + rm[j])))


def rk_mix(k, mu):
    c = cands[k]
    qg = np.array([wgraph[k][j] for j in c], float); qg /= qg.sum()
    qm = np.array(res[k], float); qm /= max(qm.sum(), 1e-9)
    return [c[x] for x in np.argsort(-((1 - mu) * qg + mu * qm))]


MET = [('puro', None, rk_puro)] + \
      [(f'RRF μ={m}', m, lambda k, m=m: rk_rrf(k, m)) for m in (0.3, 0.5, 1.0)] + \
      [(f'MIX μ={m}', m, lambda k, m=m: rk_mix(k, m)) for m in (0.05, 0.1, 0.15, 0.2, 0.3)]

righe = ['# Mammoth su 40 casi — versione corretta', '',
         f'Modello `{MODEL}` · nomi latinizzati da TMDB · etichetta FILM/SERIES corretta · '
         f'**candidati in ordine casuale** (seme 7).', '',
         '## Tutte le fusioni', '',
         '| fusione | top-8 diverso | stabilità |', '|---|---:|---:|']
sint = {}
for nome_, mu, f in MET:
    camb = sum(1 for k, _ in semi if set(f(k)[:8]) != set(base[k][:8]))
    stab = np.mean([len(set(f(k)[:8]) & set(base[k][:8])) / 8 for k, _ in semi])
    sint[nome_] = (camb, stab)
    righe.append(f'| {nome_} | {camb}/{len(semi)} | {100*stab:.0f}% |')

# ancoraggio: correlazione p vs rango di grafo (mescolato) contro la run ordinata
rho_sh = np.median([np.corrcoef(np.argsort(np.argsort(-np.array(res[k]))),
                                np.arange(len(res[k])))[0, 1] for k, _ in semi])
ordc = '.cache/mercury-b1.jsonl'
rho_ord = None
if os.path.exists(ordc):
    R = {json.loads(l)['key']: json.loads(l)['p'] for l in open(ordc, encoding='utf-8')}
    com = [(k, R[k]) for k, _ in semi if k in R]
    if com:
        rho_ord = np.median([np.corrcoef(np.argsort(np.argsort(-np.array(p))), np.arange(len(p)))[0, 1]
                             for k, p in com])
righe += ['', '## Ancoraggio all\'ordine della lista', '']
righe.append(f'- candidati **in ordine di grafo** (run precedente): correlazione p↔posizione = '
             f'**{rho_ord:+.3f}**' if rho_ord is not None else '- run ordinata non disponibile')
righe.append(f'- candidati **in ordine casuale** (questa run): correlazione p↔rango di grafo = **{rho_sh:+.3f}**')
righe += ['', '## I 40 casi', '']
for key, nm in semi:
    g8 = base[key][:8]
    a8 = rk_mix(key, 0.1)[:8]
    b8 = rk_rrf(key, 0.3)[:8]
    c8 = rk_puro(key)[:8]
    uguale = set(g8) == set(a8) == set(b8) == set(c8)
    righe.append(f'\n### {nm} — `{key}`' + ('  ·  nessun cambio' if uguale else ''))
    righe += ['', '| # | grafo V14 | MIX μ=0,1 | RRF μ=0,3 | puro | p |', '|---|---|---|---|---:|---:|']
    for q in range(8):
        pv = res[key][cands[key].index(c8[q])]
        righe.append(f'| {q+1} | {T[g8[q]]} | {T[a8[q]]} | {T[b8[q]]} | {T[c8[q]]} | {pv:.2f} |')
open(OUT, 'w', encoding='utf-8').write("\n".join(righe) + "\n")

print(f'\nchiamate ok {STAT["ok"]} · err {STAT["err"]} · 429 {STAT["429"]}')
for nome_, (camb, stab) in sint.items():
    print(f'{nome_:<14} cambiati {camb:2d}/{len(semi)} · stabilità {100*stab:.0f}%')
print(f'\nancoraggio: ordinato {rho_ord if rho_ord is None else round(rho_ord,3)} · mescolato {rho_sh:+.3f}')
print(f'scritto {OUT}')
