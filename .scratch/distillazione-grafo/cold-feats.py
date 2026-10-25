import json, os, sys, urllib.request
KEY = os.environ.get("TMDB_API_KEY")
import numpy as np, scipy.sparse as sp
from services.graph_dense import config as C, data as D, fields as FLD
from services.graph_dense.data import _nomi, _durata, PESI_EXTRA
B = D.basic(); ro = B["row_of"]; N = B["N"]
V = D.vocab(); inv = {c: t for t, c in V.items()}
idf = np.load(C.SRC / "05-idf.npy").astype(np.float32)
G = json.loads((C.ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
l1 = {k: i for i, k in enumerate(G.get("L1", {}))}; l2 = {k: i for i, k in enumerate(G.get("L2", {}))}
l3 = {k: i for i, k in enumerate(G.get("L3", {}))}; n1, n2 = len(l1), len(l2)
tieni = FLD.extra_tokens(B); tieni_col = {t: j for j, t in enumerate(tieni)}
fids, nomi = FLD.field_ids(B, np.where(np.load(C.DATA/"blocks.npz")["keep"])[0])
np.save(C.DATA/"cold-fids.npy", fids); json.dump(nomi, open(C.DATA/"cold-nomi.json","w"), ensure_ascii=False)
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



def main():
    tids = [int(x) for x in sys.argv[1:]] or [1368337, 1283515]
    rows = []
    for tid in tids:
        j = fetch(tid); X0, _ = build(j); rows.append(X0)
    X0s = sp.vstack(rows, format="csr", dtype=np.float32)
    sp.save_npz(C.DATA/"cold-feats.npz", X0s)
    print("feats ok", X0s.shape)
if __name__ == "__main__": main()
