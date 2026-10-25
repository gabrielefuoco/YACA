"""Cold-start: piazza un film NUOVO nello spazio di m1 e b10 senza addestrare.

Feature = stesso tokenizzatore del canone (TF-IDF cast/crew/generi/keyword/case/paesi/rating,
cluster keyword, strutturali, extra) + trama qwen3 + keyword proiettate. Poi encode con:
  lc150 (GatedStudent) · b10 (BlockStudentG, 30/30/30/10) · m1 (FieldStudent, 30/20/50).
Uso: py -u .scratch/distillazione-grafo/cold-encode.py 1368337 1283515
"""
import json, os, sys, urllib.request
import numpy as np, scipy.sparse as sp, torch, torch.nn.functional as F
from services.graph_dense import config as C, data as D, fields as FLD
from services.graph_dense.model import GatedStudent
from services.graph_dense.train_b3 import BlockStudentG, FieldStudent
from services.graph_dense.train_b1 import _batch_meta
from services.graph_dense.data import _nomi, _durata, PESI_EXTRA
print('IMPORTS OK', flush=True)

print('PRE-B', flush=True)
B = D.basic(); ro = B["row_of"]; N = B["N"]; date = np.load(C.DATA / "uscite-ordinali.npy")
print('B OK', flush=True)
V = D.vocab(); inv = {c: t for t, c in V.items()}
idf = np.load(C.SRC / "05-idf.npy").astype(np.float32)
kwcols = np.array([c for t, c in V.items() if t.startswith("kw:")], dtype=np.int64)
rng = np.random.default_rng(42)
R = rng.choice(np.array([-1.0, 1.0], np.float32), size=(len(kwcols), 512)) / np.sqrt(512)
print("R OK", flush=True)
zbl = np.load(C.DATA / "blocks.npz"); keep = zbl["keep"]; orig = np.where(keep)[0]
print("ZBL OK", flush=True)
G = json.loads((C.ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
l1 = {k: i for i, k in enumerate(G.get("L1", {}))}
l2 = {k: i for i, k in enumerate(G.get("L2", {}))}
l3 = {k: i for i, k in enumerate(G.get("L3", {}))}
n1, n2 = len(l1), len(l2)
print("G OK", flush=True)
tieni = FLD.extra_tokens(B); tieni_col = {t: j for j, t in enumerate(tieni)}
print("TIENI OK", flush=True)
fids, nomi = FLD.field_ids(B, keep)
print('FIDS OK', flush=True)
dev = "cuda" if torch.cuda.is_available() else "cpu"
KEY = os.environ.get("TMDB_API_KEY")


def key():
    global KEY
    if KEY:
        return KEY
    for f in (".env", "secrets.env"):
        for line in open(C.ROOT / f, encoding="utf-8", errors="ignore"):
            if line.strip().startswith("TMDB_API_KEY="):
                KEY = line.split("=", 1)[1].strip(); return KEY
    raise SystemExit("no TMDB key")


def fetch(tid):
    u = f"https://api.themoviedb.org/3/movie/{tid}?api_key={key()}&language=en-US&append_to_response=credits,keywords,release_dates"
    with urllib.request.urlopen(u, timeout=30) as r:
        return json.load(r)


def tokens(j):
    t = []
    for g in j.get("genres", []):
        t.append("ge:" + g["name"].lower())
    for c in (j.get("credits", {}).get("cast") or [])[:20]:
        t.append("ca:" + c["name"].lower())
    for c in (j.get("credits", {}).get("crew") or []):
        if c.get("job") == "Director":
            t.append("di:" + c["name"].lower())
        if c.get("job") in ("Writer", "Screenplay", "Story"):
            t.append("wr:" + c["name"].lower())
    for c in j.get("production_companies", [])[:10]:
        t.append("co:" + c["name"].lower())
    for c in j.get("production_countries", []):
        t.append("pa:" + c["iso_3166_1"])
    for k in (j.get("keywords", {}).get("keywords") or []):
        t.append("kw:" + k["name"].lower())
    return t


def extra_tokens(j):
    t = []
    lg = j.get("original_language")
    if lg: t.append("lg:" + lg.lower())
    cert = None
    for d in (j.get("release_dates", {}).get("results") or []):
        if d.get("iso_3166_1") in ("US", "IT"):
            for x in d.get("release_dates", []):
                if x.get("certification"): cert = x["certification"]; break
        if cert: break
    if cert: t.append("cr:" + cert.lower())
    rt = j.get("runtime")
    if isinstance(rt, (int, float)) and 10 <= rt <= 400: t.append("du:" + str(_durata(rt)))
    yr = int((j.get("release_date") or "0")[:4] or 0)
    if yr > 1880:
        dec = yr // 10 * 10; t.append(f"de:{dec}")
        paesi = [c.get("iso_3166_1", "").upper() for c in j.get("production_countries", [])]
        fuori = [c for c in paesi if c and c not in ("US", "GB")]
        if fuori and C.EXTRA_PG:
            for g in [g["name"].lower() for g in j.get("genres", [])][:4]:
                t.append(f"pg:{fuori[0]}|{dec}|{g}")
    for c in (j.get("credits", {}).get("crew") or []):
        if c.get("job") in ("Writer", "Screenplay", "Story"):
            t.append("wr:" + c["name"].lower())
    cid = j.get("belongs_to_collection") or {}
    if cid.get("id"): t.append(f"cl:{int(cid['id'])}")
    return t, yr


def build(j):
    toks = tokens(j); ex, yr = extra_tokens(j)
    # tfidf: presenza x idf, L2
    cols, vals = [], []
    for t in set(toks):
        c = V.get(t)
        if c is not None:
            cols.append(c); vals.append(float(idf[c]))
    n = np.sqrt(np.sum(np.square(vals))) + 1e-9
    tf = sp.csr_matrix((np.array(vals) / n, (np.zeros(len(cols), np.int32), np.array(cols))), shape=(1, len(V)))
    # H cluster
    rows, cs = [], []
    for t in set(toks):
        if not t.startswith("kw:"): continue
        c = V.get(t)
        if c is None: continue
        g1 = G.get("kw_to_L1", {}).get(t[3:])
        if not g1 or g1 not in l1: continue
        rows.append(c); cs.append(l1[g1])
        g2 = (G["L1"].get(g1) or {}).get("parent")
        if g2 and g2 in l2:
            rows.append(c); cs.append(n1 + l2[g2])
            g3 = (G["L2"].get(g2) or {}).get("parent")
            if g3 and g3 in l3: rows.append(c); cs.append(n1 + n2 + l3[g3])
    if rows:
        Pm = sp.csr_matrix((np.ones(len(rows), np.float32), (rows, cs)), shape=(len(V), n1 + n2 + len(l3)))
        H = (tf > 0).astype(np.float32) @ Pm
        H.data = np.log1p(H.data)
        H = sp.diags(1.0 / (np.sqrt(np.asarray(H.multiply(H).sum(1)).ravel()) + 1e-9)) @ H
    else:
        H = sp.csr_matrix((1, n1 + n2 + len(l3)), dtype=np.float32)
    anno_n = np.clip((yr - 1990.0) / 35.0, -2.5, 1.5) if yr else 0.0
    st = np.array([[0.0, 1.0, anno_n, 0.0]], np.float32) * 0.25   # is_tv=0, ~is_tv=1, anno, nep=0
    # extra
    ecols, evals = [], []
    for t in set(ex):
        jj = tieni_col.get(t)
        if jj is not None:
            ecols.append(jj); evals.append(PESI_EXTRA[t[:3]])
    nn = np.sqrt(np.sum(np.square(evals))) + 1e-9
    Xe = sp.csr_matrix((np.array(evals) / nn, (np.zeros(len(ecols), np.int32), np.array(ecols))),
                       shape=(1, len(tieni)))
    X0 = sp.hstack([tf, H, sp.csr_matrix(st), Xe], format="csr", dtype=np.float32)
    return X0, (tf, H, st, Xe)


_P = None
def plot_vec(j):
    global _P
    if _P is None:
        z = np.load(C.DATA / "cold-plot.npz")
        _P = {int(t): e for t, e in zip(z["tids"], z["emb"])}
    return _P[int(j["id"])]


def kw_vec(tf):
    xk = tf[:, kwcols].tocsr()
    n = np.sqrt(np.asarray(xk.multiply(xk).sum(1)).ravel()) + 1e-9
    xk = sp.diags(1.0 / n) @ xk
    b = np.asarray(xk @ R, np.float32).ravel()
    return b / (np.linalg.norm(b) + 1e-9)


def main():
    tids = [int(x) for x in sys.argv[1:]] or [1368337, 1283515]
    print("A import", flush=True)
    lc = GatedStudent(len(V) + n1 + n2 + len(l3) + 4 + len(tieni), d_plot=1024, d_emb=512, n_bolle=2922, d_kw=0).to(dev)
    print("B lc built", flush=True)
    lc.load_state_dict(torch.load(C.DATA / "lc150-model.pt", map_location=dev, weights_only=True)); lc.eval()
    print("C lc loaded", flush=True)
    fm = FieldStudent(len(orig), len(nomi), d_field=64, d_meta=512, n_blocks=3).to(dev)
    fm.load_state_dict(torch.load(C.DATA / "m1-model.pt", map_location=dev, weights_only=True)); fm.eval()
    print("D m1 loaded", flush=True)
    bm = BlockStudentG(len(orig), d_meta=512, n_blocks=4).to(dev)
    bm.load_state_dict(torch.load(C.DATA / "b10-model.pt", map_location=dev, weights_only=True)); bm.eval()
    print("E b10 loaded", flush=True)
    z1 = np.load(C.DATA / "m1.npz"); mu1 = z1["mu"].astype(np.float32); Z1 = z1["Z"].astype(np.float32)
    zb = np.load(C.DATA / "b10.npz"); mub = zb["mu"].astype(np.float32); Zb = zb["Z"].astype(np.float32)
    fix1 = torch.tensor([0.3 ** 0.5, 0.2 ** 0.5, 0.5 ** 0.5], device=dev)
    fixb = torch.tensor([0.3 ** 0.5, 0.3 ** 0.5, 0.3 ** 0.5, 0.1 ** 0.5], device=dev)
    def t_(i):
        a = int(date[i] // 365.25 + 1970) if date[i] > 0 else 0
        return f"{B['titoli'][int(i)]} ({a})" if a else B["titoli"][int(i)]
    for tid in tids:
        print("F fetch", tid, flush=True); j = fetch(tid)
        print("G build", flush=True); X0, parts = build(j)
        # lc150
        idx, off, val = _batch_meta(X0, np.array([0]), np.random.default_rng(0), drop=False)
        pv = torch.from_numpy(plot_vec(j)).to(dev).view(1, -1)
        with torch.no_grad():
            lcz = lc(idx.to(dev), off.to(dev), val.to(dev), pv, torch.ones(1, device=dev),
                     torch.zeros(1, dtype=torch.long, device=dev)).float().cpu().numpy().ravel()
        # m1
        Xk = X0[:, keep].tocsr()
        idx2, off2, val2 = _batch_meta(Xk, np.array([0]), np.random.default_rng(0), drop=False)
        fi = torch.from_numpy(fids.astype(np.int64)).to(dev)
        with torch.no_grad():
            h1 = fm._meta(idx2.to(dev), off2.to(dev), val2.to(dev), fi[idx2.to(dev)])
            hp = fm.proj(h1)
            z = torch.cat([fix1[0] * pv[0], fix1[1] * torch.from_numpy(kw_vec(parts[0])).to(dev),
                           fix1[2] * F.normalize(hp, dim=1)[0]]).float().cpu().numpy()
        z = z - mu1[0]; z /= (np.linalg.norm(z) + 1e-9)
        cos = Z1 @ z; top = np.argsort(-cos)[:10]
        print(f"\n{tid} {j.get('title')} ({j.get('release_date')}) · m1: " + " · ".join(t_(x) for x in top))
        # b10
        with torch.no_grad():
            hb = bm.ln(bm.bag(idx2.to(dev), off2.to(dev), per_sample_weights=val2.to(dev)))
            hb = bm.proj(F.gelu(hb) + bm.res(F.gelu(hb)))
            zz = torch.cat([fixb[0] * pv[0], fixb[1] * torch.from_numpy(kw_vec(parts[0])).to(dev),
                            fixb[2] * torch.from_numpy(lcz).to(dev),
                            fixb[3] * F.normalize(hb, dim=1)[0]]).float().cpu().numpy()
        zz = zz - mub[0]; zz /= (np.linalg.norm(zz) + 1e-9)
        cos = Zb @ zz; top = np.argsort(-cos)[:10]
        print(f"{tid} {j.get('title')} · b10: " + " · ".join(t_(x) for x in top))


if __name__ == "__main__":
    main()
