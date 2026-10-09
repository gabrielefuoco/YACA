"""
gate.py — LE COMPONENTI SERVONO DIVERSAMENTE A QUERY DIVERSE?

Misura DESCRITTIVA (nessun peso calibrato, quindi nessun overfitting): per ogni sorgente del set
curato si guarda quanti dei suoi collegamenti "peso 3" cadono nei primi 10 con CIASCUNA componente
DA SOLA. Poi si guarda se il vincitore cambia per fascia: popolarita', medium, epoca, diversita'.

Se cambia, il "gate" (pesi diversi per query diverse) ha una base misurata. Se non cambia, non ce l'ha.
Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/gate.py
"""
import json, pathlib, re, unicodedata, difflib
import numpy as np, pandas as pd
from scipy import sparse as sp

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT / ".cache" / "tmdb", ROOT / ".cache" / "movielens"


def log(m): print(m, flush=True)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())


def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0


z = np.load(ML / "spazi-cap0.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, coll, year, votes = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["coll"], z["year"], z["votes"]
n = len(tmdb)
is_tv = (tipo == "tv")
Pc2 = Pc.astype(np.float64).copy()
Pc2[~is_tv] -= Pc[~is_tv].mean(0); Pc2[is_tv] -= Pc[is_tv].mean(0)
Pc2 /= (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)
Pb2 = Pb.astype(np.float64).copy()
Pb2[~is_tv] -= Pb[~is_tv].mean(0); Pb2 /= (np.linalg.norm(Pb2, axis=1, keepdims=True) + 1e-9)
zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
TB, TKEYS = zt["bag"], [str(x) for x in zt["keys"]]
TB = TB / (np.abs(TB).max() + 1e-9)
temi_row = {k: a for a, k in enumerate(TKEYS)}

mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "title_en", "release_date"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "name_en", "first_air_date"])
NORM = {}
for typ, rows in (("movie", mv), ("tv", tv)):
    tn, ten, dn = ("title", "title_en", "release_date") if typ == "movie" else ("name", "name_en", "first_air_date")
    for i, t, te, dt in zip(rows["id"], rows[tn], rows[ten], rows[dn]):
        for s in (norm(t), norm(te or "")):
            if s:
                NORM.setdefault((s, yr(dt)), f"{typ}:{int(i)}")
byf = {}
for (s, y), k in NORM.items():
    byf.setdefault(s.split()[0], []).append((s, y, k))


def find(title, year_):
    nn = norm(title)
    for dy in (0, 1, -1, 2, -2, 3, -3):
        if (nn, year_ + dy) in NORM:
            return NORM[(nn, year_ + dy)]
    best, bs = None, 0.0
    for s, y, k in byf.get(nn.split()[0], []):
        r = difflib.SequenceMatcher(None, nn, s).ratio()
        if r > bs:
            bs, best = r, k
    return best if bs >= 0.82 else None


row_of = {f"{t}:{int(i)}": r for r, (t, i) in enumerate(zip(tipo, tmdb))}
gold = {"sources": []}
for f in ("link-manuali.json", "link-manuali-2.json"):
    p = ROOT / ".scratch" / "ml-collaborativo" / "gold" / f
    if p.exists():
        gold["sources"] += json.loads(p.read_text(encoding="utf-8"))["sources"]
srcs = []
for s in gold["sources"]:
    k = find(s["source"]["title"], s["source"]["year"])
    if k is None or k not in row_of:
        continue
    ls = [(find(l["title"], l["year"]), l["w"]) for l in s["links"] if l["w"] == 3]
    ls = [(row_of[j], w) for j, w in ls if j is not None and j in row_of]
    if not ls:
        continue
    srcs.append(dict(r=row_of[k], key=k, links=ls))
log(f"sorgenti con collegamenti peso 3: {len(srcs)} · collegamenti: {sum(len(s['links']) for s in srcs)}")

# le componenti DA SOLE
def ranks(comp, r):
    if comp == "contenuto":
        s_ = Pc2 @ Pc2[r]
    elif comp == "comportamento":
        s_ = Pb2 @ Pb2[r]
    elif comp == "anno":
        s_ = np.exp(-((year - year[r]) / 8.0) ** 2)
    elif comp == "saga":
        s_ = ((coll == coll[r]) & ~pd.isna(coll)).astype(float)
    elif comp == "temi":
        a = temi_row.get(key_of.get(r))
        s_ = TB[a].astype(float) if a is not None else np.zeros(n)
    s_[r] = -9
    order = np.argsort(-s_)
    rk = np.empty(n, dtype=np.int32)
    rk[order] = np.arange(n)
    return rk

key_of = {r: f"{tipo[r]}:{int(tmdb[r])}" for r in range(n)}
COMP = ["contenuto", "comportamento", "anno", "saga", "temi"]
R = {c: {s["r"]: ranks(c, s["r"]) for s in srcs} for c in COMP}

# fasce
pop = votes.astype(float)
q1, q2 = np.quantile(pop[[s["r"] for s in srcs]], [0.33, 0.66])
def fascia(s):
    r = s["r"]
    if tipo[r] == "tv":
        return "serie"
    if year[r] and year[r] < 1980:
        return "classico (<1980)"
    if pop[r] <= q1:
        return "nicchia (pochi voti)"
    if pop[r] >= q2:
        return "mainstream (molti voti)"
    return "medio"
for s in srcs:
    s["fascia"] = fascia(s)

log("")
log("=== CHI VINCE, PER FASCIA (collegamenti peso 3 nei primi 10, media per sorgente) ===")
log("| fascia | n | " + " | ".join(COMP) + " | vincitore |")
log("|---|---|" + "---|" * (len(COMP) + 1))
fasce = {}
for s in srcs:
    fasce.setdefault(s["fascia"], []).append(s)
for f in sorted(fasce, key=lambda x: -len(fasce[x])):
    ss = fasce[f]
    med = []
    for c in COMP:
        v = np.mean([np.mean(R[c][s["r"]][[j for j, _ in s["links"]]] < 10) for s in ss])
        med.append(100 * v)
    vince = COMP[int(np.argmax(med))]
    log(f"| {f} | {len(ss)} | " + " | ".join(f"{m:.0f}%" for m in med) + f" | **{vince}** |")
log("")
log("=== E IN GENERALE (tutte le sorgenti) ===")
for c in COMP:
    v = np.mean([np.mean(R[c][s["r"]][[j for j, _ in s["links"]]] < 10) for s in srcs])
    log(f"  {c:<14} {100*v:5.1f}%")

# ---------------------------------------------------------------- IL GATE: pesi diversi per query diverse
def sc(comp, r):
    if comp == "contenuto":   return Pc2 @ Pc2[r]
    if comp == "comportamento": return Pb2 @ Pb2[r]
    if comp == "anno":        return np.exp(-((year - year[r]) / 8.0) ** 2)
    if comp == "saga":        return ((coll == coll[r]) & ~pd.isna(coll)).astype(float)
    if comp == "temi":
        a = temi_row.get(key_of.get(r))
        return TB[a].astype(float) if a is not None else np.zeros(n)
    return np.zeros(n)

SOGLIA = 2000.0    # SOGLIA ASSOLUTA DICHIARATA: sotto 2.000 voti TMDB un titolo e' 'di nicchia'.
# (Il terzile del catalogo non funzionava: i titoli del set curato sono tutti famosi.)
log("")
log(f"=== IL GATE (soglia di nicchia: voti < {int(SOGLIA)}, precalcolata sul catalogo) ===")
even = [k for k in range(len(srcs)) if k % 2 == 0]

def fusion(r, wb):
    s_ = 1.0 * sc("contenuto", r) + wb * sc("comportamento", r) + 0.15 * sc("anno", r) + 0.4 * sc("saga", r) + 0.2 * sc("temi", r)
    s_[r] = -9
    return s_

def valuta(nome, gate, subset=None):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = hit = 0; hit20 = tot20 = 0; ff10 = ff_tot = 0
    for s in ss:
        r = s["r"]
        wb = (0.5 if votes[r] < SOGLIA else 0.0) if gate else 0.0
        order = np.argsort(-fusion(r, wb))
        rk = np.empty(n, dtype=np.int32); rk[order] = np.arange(n)
        for j, w in s["links"]:
            tot += 1; hit += rk[j] < 10; tot20 += 1; hit20 += rk[j] < 20
        for j in s.get("ffs", []):
            pass
    c3 = hit / max(1, tot); c2 = hit20 / max(1, tot20)
    log(f"  {nome:<40} p3@10 {100*c3:5.1f}% ({hit}/{tot}) · p2@20 {100*c2:5.1f}%")
    return c3, c2

valuta("pesi FISSI (comportamento 0, come oggi)", False, even)
valuta("GATE (comportamento 0.5 sulle query di nicchia)", True, even)
# controllo onesto: comportamento 0.5 su TUTTE le query (non solo le nicchia)
def valuta_fisso(nome, wb, subset=None):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = hit = tot20 = hit20 = 0
    for s in ss:
        order = np.argsort(-fusion(s["r"], wb))
        rk = np.empty(n, dtype=np.int32); rk[order] = np.arange(n)
        for j, w in s["links"]:
            tot += 1; hit += rk[j] < 10; tot20 += 1; hit20 += rk[j] < 20
    log(f"  {nome:<40} p3@10 {100*hit/max(1,tot):5.1f}% ({hit}/{tot}) · p2@20 {100*hit20/max(1,tot20):5.1f}%")
valuta_fisso("controllo: comportamento 0.5 SEMPRE", 0.5, even)
valuta_fisso("controllo: comportamento 1.0 SEMPRE", 1.0, even)

# ---------------------------------------------------------------- IL GATE FORTE (cambio di regime)
log("")
log("=== IL GATE FORTE: sulle query di nicchia il comportamento DOMINA (non si aggiunge) ===")
def fusion2(r, wc, wb):
    s_ = wc * sc("contenuto", r) + wb * sc("comportamento", r) + 0.15 * sc("anno", r) + 0.4 * sc("saga", r) + 0.2 * sc("temi", r)
    s_[r] = -9
    return s_

def valuta2(nome, modo, subset=None):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    agg = {"tutti": [0, 0, 0, 0], "nicchia": [0, 0, 0, 0], "resto": [0, 0, 0, 0]}
    for s in ss:
        r = s["r"]
        nic = votes[r] < SOGLIA
        if modo == "fisso":       wc, wb = 1.0, 0.0
        elif modo == "gate":      wc, wb = (0.2, 1.0) if nic else (1.0, 0.0)
        elif modo == "uniforme":  wc, wb = 0.2, 1.0
        order = np.argsort(-fusion2(r, wc, wb))
        rk = np.empty(n, dtype=np.int32); rk[order] = np.arange(n)
        for j, w in s["links"]:
            for k_ in ("tutti", "nicchia" if nic else "resto"):
                agg[k_][0] += 1; agg[k_][1] += rk[j] < 10; agg[k_][2] += 1; agg[k_][3] += rk[j] < 20
    out = []
    for k_ in ("tutti", "nicchia", "resto"):
        a = agg[k_]
        out.append(f"{k_} p3@10 {100*a[1]/max(1,a[0]):5.1f}% ({a[1]}/{a[0]}) · p2@20 {100*a[3]/max(1,a[2]):5.1f}%")
    log(f"  {nome:<34} " + " · ".join(out))

valuta2("pesi FISSI (come oggi)", "fisso", even)
valuta2("GATE FORTE (nicchia: 0.2/1.0)", "gate", even)
valuta2("controllo UNIFORME (0.2/1.0 sempre)", "uniforme", even)
