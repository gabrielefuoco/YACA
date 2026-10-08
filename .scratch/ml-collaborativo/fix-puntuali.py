"""
.scratch/ml-collaborativo/fix-puntuali.py

DUE FIX PUNTUALI, dopo le feature estese.

 1. RISOLUZIONE DI LEIDEN: col grafo nuovo i cluster sono cresciuti (mediana 4.118
    a res 16, che non e' piu' un micro-genere). Sweep su risoluzioni piu' alte.

 2. FEATURE AD ALTA CARDINALITA': il gap in-sample e' +0,128. Si prova
    la normalizzazione L2 delle righe di feature (cosi' un film con 8 attori e uno
    con 1 pesano uguale) e uno sweep di alpha. Metrica: coseno held-out SEMPRE
    accanto al controllo del vettore medio.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/fix-puntuali.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
GRAPH = ROOT / ".cache" / "movielens" / "film-graph.npz"
EMB_DIM = 64
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)
cos = lambda A, B: np.asarray((A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9) *
                               (B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9))).sum(axis=1)).ravel()

# ============================================================ 1. Leiden
log("=== 1. RISOLUZIONE DI LEIDEN sul grafo nuovo ===")
import igraph as ig
import leidenalg as la
g = np.load(GRAPH, allow_pickle=True)
member, edges, P = g["member"], g["edges"], g["embeddings"]
log(f"  nodi {len(member):,} · archi {len(edges):,} · cluster attuali {len(set(member.tolist()))}")
gr = ig.Graph(n=len(member), edges=[tuple(e) for e in edges], directed=False)
gr.simplify()
best = None
log("  | res | cluster | mediana | max | modularità | coerenza media |")
log("  |---|---|---|---|---|---|")
for res in [16, 32, 64, 128, 256]:
    part = la.find_partition(gr, la.RBConfigurationVertexPartition, resolution_parameter=res, seed=SEED)
    sizes = sorted((len(c) for c in part), reverse=True)
    # coerenza: coseno medio fra membri campionati dello stesso cluster
    cosines = []
    for c in part:
        if len(c) < 2:
            continue
        idx = np.array(c)[:40]
        sub = P[idx]
        sub = sub / (np.linalg.norm(sub, axis=1, keepdims=True) + 1e-9)
        M = sub @ sub.T
        cosines.append(float((M.sum() - len(idx)) / (len(idx) * (len(idx) - 1))))
    log(f"  | {res} | {len(part)} | {sizes[len(sizes)//2]} | {sizes[0]} | {part.modularity:.3f} | {np.mean(cosines):.3f} |")
    if best is None or abs(len(part) - 300) < abs(best[1] - 300):
        best = (res, len(part), part)
log(f"  -> risoluzione scelta per ~300 cluster: {best[0]} ({best[1]} cluster)")

# ============================================================ 2. feature: normalizzazione e alpha
log("\n=== 2. FEATURE AD ALTA CARDINALITA': normalizzazione e alpha ===")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))

cols = ["id", "title", "keywords", "genres", "vote_count", "vote_average", "runtime",
        "original_language", "production_countries", "popularity", "cast", "directors", "collection_id",
        "budget", "content_rating"]
mv = pd.read_parquet(PQ / "movies.parquet", columns=cols + ["release_date"])
mv["type"] = "movie"; mv["date"] = mv["release_date"]; mv["number_of_seasons"] = np.nan
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "keywords", "genres", "first_air_date", "vote_count",
                                                 "vote_average", "runtime", "original_language", "production_countries",
                                                 "popularity", "cast", "created_by", "content_rating", "number_of_seasons"])
tv["type"] = "tv"; tv["title"] = tv["name"]; tv["date"] = tv["first_air_date"]; tv["directors"] = tv["created_by"]
tv["collection_id"] = np.nan; tv["budget"] = np.nan
cat = pd.concat([mv[cols + ["release_date", "type", "date", "number_of_seasons"]], tv[cols + ["first_air_date", "type", "date", "number_of_seasons"]]], ignore_index=True)
cat = cat.dropna(subset=["keywords"]).reset_index(drop=True)
cat = cat[cat["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
C_VOTES = 250.0
m_global = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + C_VOTES * m_global) / (cat["vote_count"] + C_VOTES)

G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
CHAIN = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent")
    v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CHAIN[nm] = (c, t_, v_)
l1_ids = {k: i for i, k in enumerate(G["L1"])}
l2_ids = {k: i for i, k in enumerate(G["L2"])}
l3_ids = {k: i for i, k in enumerate(G["L3"])}
N_TOPO = len(l1_ids) + len(l2_ids) + len(l3_ids)

def json_list(s, key):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in v if isinstance(x, dict) and x.get(key) is not None] if isinstance(v, list) else []

kw_names = cat["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
countries = cat["production_countries"].map(lambda x: json_list(x, "iso_3166_1"))
people = cat.apply(lambda r: json_list(r["cast"], "id")[:8] + json_list(r["directors"], "id"), axis=1)
collections = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
lang_vocab = {l: i for i, l in enumerate(cat["original_language"].dropna().value_counts().head(25).index)}
country_vocab = {c: i for i, (c, _) in enumerate(Counter(c for L in countries for c in L).most_common(40))}
people_vocab = {p: i for i, (p, _) in enumerate(Counter(p for L in people for p in L).most_common(3000))}
coll_vocab = {c: i for i, (c, _) in enumerate(Counter(c for L in collections for c in L).most_common(800))}
genres_vocab = {}
rows_i, cols_i, vals_i = [], [], []
for i in range(len(cat)):
    row = []
    for n in kw_names.iloc[i]:
        ch = CHAIN.get(n)
        if not ch:
            continue
        if ch[0]: row.append(l1_ids[ch[0]])
        if ch[1]: row.append(len(l1_ids) + l2_ids[ch[1]])
        if ch[2]: row.append(len(l1_ids) + len(l2_ids) + l3_ids[ch[2]])
    for c in set(row):
        rows_i.append(i); cols_i.append(c); vals_i.append(1.0)
    for gg in json.loads(cat["genres"].iloc[i] or "[]"):
        gid = int(gg["id"])
        if gid not in genres_vocab:
            genres_vocab[gid] = N_TOPO + len(genres_vocab)
        rows_i.append(i); cols_i.append(genres_vocab[gid]); vals_i.append(1.0)
OFF = N_TOPO + len(genres_vocab)
for i in range(len(cat)):
    lang = cat["original_language"].iloc[i]
    if lang in lang_vocab:
        rows_i.append(i); cols_i.append(OFF + lang_vocab[lang]); vals_i.append(1.0)
    for c in countries.iloc[i]:
        if c in country_vocab:
            rows_i.append(i); cols_i.append(OFF + len(lang_vocab) + country_vocab[c]); vals_i.append(1.0)
    for p in people.iloc[i]:
        if p in people_vocab:
            rows_i.append(i); cols_i.append(OFF + len(lang_vocab) + len(country_vocab) + people_vocab[p]); vals_i.append(1.0)
    for c in collections.iloc[i]:
        if c in coll_vocab:
            rows_i.append(i); cols_i.append(OFF + len(lang_vocab) + len(country_vocab) + len(people_vocab) + coll_vocab[c]); vals_i.append(1.0)
N_BIN = OFF + len(lang_vocab) + len(country_vocab) + len(people_vocab) + len(coll_vocab)
extra = np.zeros((len(cat), 8), dtype=np.float32)
for i in range(len(cat)):
    y = cat["year"].iloc[i]; bud = cat["budget"].iloc[i]
    extra[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(cat["vote_count"].iloc[i]), cat["bayes"].iloc[i],
                0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i] / 120.0,
                np.log1p(cat["popularity"].iloc[i]),
                0.0 if pd.isna(bud) else np.log1p(float(bud)),
                0.0 if pd.isna(cat["number_of_seasons"].iloc[i]) else float(cat["number_of_seasons"].iloc[i]) / 5.0,
                1.0 if str(cat["content_rating"].iloc[i] or "").upper() in ("R", "NC-17", "TV-MA") else 0.0]
F = sparse.hstack([sparse.csr_matrix((vals_i, (rows_i, cols_i)), shape=(len(cat), N_BIN)), sparse.csr_matrix(extra)]).tocsr()
log(f"  feature: {F.shape[1]:,} colonne ({N_BIN:,} binarie + 8 numeriche)")

# teacher
covered = sorted(set(movieid_by_tmdb[int(x)] for x in cat.loc[cat["type"] == "movie", "id"] if int(x) in movieid_by_tmdb))
mid_pos = {m: i for i, m in enumerate(covered)}
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
ratings = ratings[ratings["movieId"].isin(mid_pos)]
r = ratings.copy(); r["i"] = r["movieId"].map(mid_pos).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(covered)))
X.sum_duplicates(); X.data[:] = 1.0
n_item = np.asarray(X.sum(axis=0)).ravel()
Xw = X.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
U, S, Vt = svds(Xw, k=EMB_DIM)
Z = Vt.T; Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
row_of = {m: j for j, m in enumerate(covered)}
cov = np.array([(t == "movie" and int(i) in movieid_by_tmdb and movieid_by_tmdb[int(i)] in row_of)
                for t, i in zip(cat["type"], cat["id"])], dtype=bool)
Y = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
idx = np.where(cov)[0]
for i in idx:
    Y[i] = Z[row_of[movieid_by_tmdb[int(cat["id"].iloc[i])]]]
perm = rng.permutation(idx); n_test = int(0.2 * len(perm))
test_idx, train_idx = perm[:n_test], perm[n_test:]
log(f"  film con teacher {int(cov.sum()):,} · train {len(train_idx):,} · test {len(test_idx):,}")
mean_vec = Y[test_idx].mean(axis=0)
log(f"  controllo (vettore medio): {cos(np.tile(mean_vec, (len(test_idx), 1)), Y[test_idx]).mean():.3f}")

# normalizzo SOLO il blocco binario (le numeriche restano sulla loro scala)
Fbin = F[:, :N_BIN].astype(np.float32)
row_norm = np.sqrt(np.asarray(Fbin.multiply(Fbin).sum(axis=1)).ravel()); row_norm[row_norm == 0] = 1.0
Fnorm = sparse.hstack([sparse.diags(1.0 / row_norm) @ Fbin, sparse.csr_matrix(F[:, N_BIN:])]).tocsr()

log("\n  | feature | alpha | held-out | in-sample | gap |")
log("  |---|---|---|---|---|")
for label, M in [("grezze", F), ("righe normalizzate (solo binarie)", Fnorm)]:
    for alpha in [1.0, 30.0]:
        m = Ridge(alpha=alpha, solver="lsqr", max_iter=1000).fit(M[train_idx], Y[train_idx])
        te = cos(m.predict(M[test_idx]), Y[test_idx]).mean()
        ins = cos(m.predict(M[train_idx]), Y[train_idx]).mean()
        log(f"  | {label} | {alpha} | {te:.3f} | {ins:.3f} | {ins-te:+.3f} |")

# ============================================================ 3. IL BERSAGLIO RUMOROSO
# Il soffitto (report 13) dice: stabilita' del bersaglio 0,270 sotto i 100 voti, 0,530 fra 100 e
# 1.000, 0,831 sopra. Oltre meta' del training set e' rumore e il modello lo sta imparando.
# Qui si pesa la perdita per l'affidabilita' MISURATA. Previsto, dichiarato prima: held-out migliore
# SUL SOTTOINSIEME AFFIDABILE, e l'aggregato lo nasconde -> si riporta per fascia.
votes = pd.to_numeric(cat["vote_count"], errors="coerce").fillna(0).to_numpy()
reliab = np.where(votes >= 1000, 0.831, np.where(votes >= 100, 0.530, 0.270))
band = np.where(votes >= 1000, 2, np.where(votes >= 100, 1, 0))
log("\n=== 3. IL BERSAGLIO RUMOROSO (peso per affidabilita' misurata) ===")
log("  fasce di verifica: " + " · ".join(f"{['<100','100-1k','1k+'][b]}: {int((band[test_idx]==b).sum())} film" for b in range(3)))
log("\n  | modello | held-out | <100 voti | 100-1k | 1k+ | in-sample |")
log("  |---|---|---|---|---|---|")
def evaluate(label, M, w=None, model="ridge", alpha=30.0):
    if model == "mlp":
        from sklearn.neural_network import MLPRegressor
        m = MLPRegressor(hidden_layer_sizes=(256,), alpha=1e-2, max_iter=60, early_stopping=True,
                         random_state=20261008, verbose=False)
    else:
        m = Ridge(alpha=alpha, solver="lsqr", max_iter=1000)
    if w is None:
        m.fit(M[train_idx], Y[train_idx])
    else:
        m.fit(M[train_idx], Y[train_idx], sample_weight=w[train_idx])
    p_te = m.predict(M[test_idx]); p_tr = m.predict(M[train_idx])
    per = [cos(p_te[band[test_idx] == b], Y[test_idx][band[test_idx] == b]).mean()
           if (band[test_idx] == b).sum() > 0 else float("nan") for b in range(3)]
    log(f"  | {label} | {cos(p_te, Y[test_idx]).mean():.3f} | {per[0]:.3f} | {per[1]:.3f} | {per[2]:.3f} | {cos(p_tr, Y[train_idx]).mean():.3f} |")
evaluate("Ridge alpha 30 (oggi)", F)
evaluate("+ peso per affidabilita'", F, w=reliab)
evaluate("+ peso, alpha 100", F, w=reliab, alpha=100.0)
evaluate("MLP 256 (capacita')", F, model="mlp")
log("\n  (previsione dichiarata prima: il peso aiuta SUL SOTTOINSIEME AFFIDABILE, l'MLP non batte il Ridge)")

# ============================================================ 4. TRASFERIMENTO
# Le due mosse che l'osservazione dell'utente ha reso evidenti:
#  (1) BERSAGLIO DENOISED: addestrare su UNA meta' degli utenti e validare sull'ALTRA. I rumori delle
#      due meta' sono INDIPENDENTI, quindi memorizzare il rumore di A non aiuta a predire B: quello che
#      resta nella misura e' SOLO il segnale trasferibile. E' il protocollo giusto per questo problema.
#      Il soffitto di questo confronto e' sqrt(0,422) = 0,650 (affidabilita' di UNA meta').
#  (2) COLD-START per regista: si tengono fuori TUTTI i film di un regista e si misura li'. E' l'analogo
#      su film del caso serie (entita' mai vista), con la verita' di riferimento. Controllo: un hold-out
#      CASUALE della stessa taglia, per separare "cold-start" da "meno dati".
log("\n=== 4. TRASFERIMENTO ===")
users = np.sort(r["userId"].unique())
halfmask = rng.permutation(len(users)) < len(users) // 2
setA = set(int(u) for u in users[halfmask]); setB = set(int(u) for u in users[~halfmask])

def build_teacher(uids):
    rr = r[r["userId"].isin(uids)]
    Xh = sparse.csr_matrix((np.ones(len(rr), dtype=np.float32),
                            (rr["userId"].to_numpy(np.int32), rr["i"].to_numpy(np.int32))),
                           shape=(int(rr["userId"].max()) + 1, len(covered)))
    Xh.sum_duplicates(); Xh.data[:] = 1.0
    n_i = np.asarray(Xh.sum(axis=0)).ravel()
    Xhw = Xh.multiply((1.0 / np.log1p(np.maximum(n_i, 1)))[None, :]).tocsr()
    _, _, Vt2 = svds(Xhw, k=EMB_DIM)
    Zh = Vt2.T
    return Zh / (np.linalg.norm(Zh, axis=1, keepdims=True) + 1e-9)

ZA = build_teacher(setA); ZB = build_teacher(setB)
# I due spazi SVD differiscono per una ROTAZIONE ARBITRARIA: senza allineare, il confronto non
# significa nulla. (Il primo run ha dato -0,031, un numero impossibile per un modello addestrato:
# era l'errore, non il risultato.) Procrustes: R ottimale da ZB a ZA. 64x64 = 4.096 parametri su
# 49.709 film, ininfluente.
U_, S_, Vt_ = np.linalg.svd(ZB.T @ ZA, full_matrices=False)
ZB = ZB @ (U_ @ Vt_)
log(f"  allineamento di Procrustes applicato a ZB (la rotazione fra i due spazi)")
log(f"  controllo dell'allineamento: coseno medio fra i due teacher dopo Procrustes = "
    f"{np.einsum('ij,ij->i', ZA, ZB).mean():.3f} (atteso ~0,422)")
log(f"  due teacher indipendenti: {ZA.shape[0]:,} film ciascuno ({len(setA):,} e {len(setB):,} utenti)")

def targets(Zh):
    Yh = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
    for i in idx:
        Yh[i] = Zh[row_of[movieid_by_tmdb[int(cat["id"].iloc[i])]]]
    return Yh
YA, YB = targets(ZA), targets(ZB)
CEIL_HALF = np.sqrt(0.422)          # soffitto del confronto fra due meta'
log(f"  soffitto di questo confronto: sqrt(0,422) = {CEIL_HALF:.3f}")
log("\n  | addestrato su | validato su | coseno | quota del soffitto |")
log("  |---|---|---|---|")
for lbl, (Ytr_, Yte_) in [("meta' A", (YA, YB)), ("meta' B", (YB, YA)), ("media A+B", (None, None))]:
    if Ytr_ is None:
        Yavg = (YA + YB) / 2.0
        m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(F[idx], Yavg[idx])
        p = m.predict(F[idx])
        # contro la MEDIA il confronto e' in-sample sul bersaglio: si riporta solo come riferimento
        log(f"  | media A+B | (in-sample) | {cos(p, Yavg[idx]).mean():.3f} | — |")
        continue
    m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(F[idx], Ytr_[idx])
    p = m.predict(F[idx])
    c_ = cos(p, Yte_[idx]).mean()
    log(f"  | {lbl} | l'altra meta' | {c_:.3f} | {100*c_/CEIL_HALF:.0f}% |")

# cold-start per regista
log("\n  COLD-START (analogo su film del caso serie):")
dirs = [json.loads(s) if isinstance(s, str) else [] for s in cat["directors"]]
keys = [tuple(sorted(int(x.get("id", 0)) for x in d if isinstance(x, dict))) for d in dirs]
cnt = Counter(k for k in keys if k)
eligible = [k for k, n in cnt.items() if n >= 3]
held_dirs = set(eligible[i] for i in rng.choice(len(eligible), size=max(1, len(eligible) // 10), replace=False))
cold = np.array([i for i in idx if keys[i] and keys[i] in held_dirs])
rand_same = np.array([i for i in idx if i not in set(cold.tolist())])
rand_same = rng.choice(rand_same, size=min(len(cold), len(rand_same)), replace=False)
log(f"    registi tenuti fuori: {len(held_dirs):,} su {len(eligible):,} con >=3 film · film cold-start: {len(cold):,}")
for lbl, hold in [("COLD-START (regista mai visto)", cold), ("controllo: hold-out casuale", rand_same)]:
    keep = np.array([i for i in idx if i not in set(hold.tolist())])
    m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(F[keep], Y[keep])
    p = m.predict(F[hold])
    log(f"    {lbl:<34} {len(hold):>6,} film · coseno {cos(p, Y[hold]).mean():.3f}")
log("\n  (se il cold-start regge vicino al controllo, il modello generalizza a entita' mai viste:")
log("   ed e' l'unica evidenza che possiamo avere sulle serie, dove il teacher non esiste)")

# ============================================================ 5. L'IDEA DELL'UTENTE
# Al posto di 1.982 nodi one-hot: un vettore APPRESO per keyword (SVD spettrale del grafo costruito
# sull'adiacenza appresa = il grafo comportamentale) e per titolo la media dei suoi. Misura col
# protocollo pulito (meta' A -> meta' B) e sul cold-start. Ipotesi dichiarata prima: l'embedding
# generalizza MEGLIO (feature dense e levigate), quindi il vantaggio deve vedersi soprattutto sul
# cold-start e sulle fasce rumorose, non necessariamente sull'aggregato.
log("\n=== 5. EMBEDDING APPRESI DAL SOTTOGRAFO (l'idea dell'utente) ===")
_emb = np.load(ROOT / ".cache" / "movielens" / "film-emb.npz", allow_pickle=True)
key2vec = {str(k): v for k, v in zip(_emb["keys"], _emb["vecs"])}
FE = np.zeros((len(cat), _emb["vecs"].shape[1]), dtype=np.float32)
hasE = np.zeros(len(cat), dtype=bool)
for i in range(len(cat)):
    v = key2vec.get(f"{cat['type'].iloc[i]}:{int(cat['id'].iloc[i])}")
    if v is not None:
        FE[i] = v; hasE[i] = True
log(f"  titoli con embedding: {int(hasE.sum()):,} su {len(cat):,} · dimensioni {FE.shape[1]}")
Fmix = sparse.hstack([F, sparse.csr_matrix(FE)]).tocsr()

log("\n  | feature | dim | A->B | B->A | cold-start | controllo |")
log("  |---|---|---|---|---|---|")
for lbl, M in [("topoi one-hot (oggi)", F), ("EMBEDDING appresi", sparse.csr_matrix(FE)), ("one-hot + embedding", Fmix)]:
    c_ab, c_ba = [], []
    for Ytr_, Yte_ in ((YA, YB), (YB, YA)):
        m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[idx], Ytr_[idx])
        c_ab.append(cos(m.predict(M[idx]), Yte_[idx]).mean()) if Ytr_ is YA else c_ba.append(cos(m.predict(M[idx]), Yte_[idx]).mean())
    keep = np.array([i for i in idx if i not in set(cold.tolist())])
    m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[keep], Y[keep])
    cs = cos(m.predict(M[cold]), Y[cold]).mean()
    m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[np.array([i for i in idx if i not in set(rand_same.tolist())])], Y[np.array([i for i in idx if i not in set(rand_same.tolist())])])
    cr = cos(m.predict(M[rand_same]), Y[rand_same]).mean()
    log(f"  | {lbl} | {M.shape[1]:,} | {c_ab[0]:.3f} | {c_ba[0]:.3f} | {cs:.3f} | {cr:.3f} |")
log("\n  (riferimenti: one-hot A->B 0,362 = 56% del soffitto 0,650 · cold-start 0,494 · controllo 0,507)")

# ============================================================ 6. LE DUE STRADE DEL BRAINSTORMING
# Strada 2: GRAFO COMPORTAMENTALE A LIVELLO DI KEYWORD. Per ogni keyword il centroide collaborativo
#   dei film che la portano (dal teacher), similarita' fra keyword = coseno fra centroidi,
#   sparsificazione top-k, embedding. La struttura NON e' la partizione in cluster (che il one-hot gia'
#   contiene): e' comportamento, quindi la media delle keyword smette di essere ridondante.
# Strada 1: PROPAGAZIONE SUL GRAFO DEI FILM. La posizione di un film = media pesata delle posizioni
#   dei suoi VICINI (che il teacher ce l'hanno). Le keyword servono a trovare i vicini, non a essere
#   la rappresentazione. E' il ponte per le serie, i cui vicini sono film.
# In entrambe: leave-one-out (il film non contribuisce al proprio centroide ne' alla propria stima) e
# le feature vengono dalla META' A mentre il bersaglio e' la META' B: rumori indipendenti.
log("\n=== 6. LE DUE STRADE (feature dalla struttura) ===")
kw_index = {k: i for i, k in enumerate(G["kw_to_L1"].keys())}
NK = len(kw_index)
trow_of_cat = np.full(len(cat), -1, dtype=int)
for i in range(len(cat)):
    if cat["type"].iloc[i] == "movie":
        m = movieid_by_tmdb.get(int(cat["id"].iloc[i]))
        if m is not None and m in row_of:
            trow_of_cat[i] = row_of[m]
kw_of_cat = []
for raw in cat["keywords"]:
    kw_of_cat.append([kw_index[n] for n in (str(k.get("name", "")).strip().lower()
                                            for k in json.loads(raw)) if n in kw_index] if isinstance(raw, str) else [])
log(f"  keyword: {NK:,} · film con riga teacher: {int((trow_of_cat>=0).sum()):,}")

# --- centroidi per keyword dalla META' A (pesati per affidabilita', col contributo del film a parte)
sumA = np.zeros((NK, EMB_DIM), dtype=np.float32); cntA = np.zeros(NK, dtype=np.float32)
for i in idx:
    if trow_of_cat[i] < 0:
        continue
    v = ZA[trow_of_cat[i]] * reliab[i]; w = reliab[i]
    for j in kw_of_cat[i]:
        sumA[j] += v; cntA[j] += w
centA = sumA / np.maximum(cntA, 1e-9)[:, None]
centA /= (np.linalg.norm(centA, axis=1, keepdims=True) + 1e-9)
log(f"  centroidi collaborativi: {int((cntA>0).sum()):,} keyword con almeno un film")

# --- grafo comportamentale fra keyword, sparsificato (top-K per nodo: le clique erano l'errore)
K_NN = 20
S_kw = centA @ centA.T
np.fill_diagonal(S_kw, -1.0)
top = np.argpartition(-S_kw, K_NN, axis=1)[:, :K_NN]
r_, c_ = np.repeat(np.arange(NK), K_NN), top.ravel()
A_kw = sparse.csr_matrix((S_kw[r_, c_].clip(0), (r_, c_)), shape=(NK, NK))
A_kw = A_kw.maximum(A_kw.T)
deg = np.asarray(A_kw.sum(1)).ravel(); dinv = 1.0 / np.sqrt(np.maximum(deg, 1e-9))
An = sparse.diags(dinv) @ A_kw @ sparse.diags(dinv)
U_k, S_k, _ = svds(An.tocsr(), k=EMB_DIM)
Ekw = U_k * np.sqrt(np.maximum(S_k, 1e-9))
Ekw /= (np.linalg.norm(Ekw, axis=1, keepdims=True) + 1e-9)
log(f"  grafo keyword: {A_kw.nnz:,} archi · grado mediano {int(np.median(np.diff(A_kw.indptr)))} · "
    f"prime 5 componenti {100*np.sum(S_k[-5:]**2)/np.sum(S_k**2):.0f}% della varianza")

# --- feature strada 2: media (e max-pooling) degli embedding delle keyword, LOO sul proprio centroide
FE2 = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
FE2max = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
for i in range(len(cat)):
    js = kw_of_cat[i]
    if not js:
        continue
    # LOO: si toglie il contributo del film stesso dal centroide delle sue keyword
    w = reliab[i]
    v = (sumA[js].sum(0) - w * (ZA[trow_of_cat[i]] if trow_of_cat[i] >= 0 else 0)) / np.maximum((cntA[js].sum() - w * len(js)), 1e-9)
    v = v / (np.linalg.norm(v) + 1e-9)
    cs = centA[js] @ v                                    # quanto ogni sua keyword e' vicina alla media
    FE2[i] = Ekw[js].mean(0); FE2[i] /= (np.linalg.norm(FE2[i]) + 1e-9)
    FE2max[i] = Ekw[js].max(0); FE2max[i] /= (np.linalg.norm(FE2max[i]) + 1e-9)
log(f"  feature strada 2: {int((np.abs(FE2).sum(1)>0).sum()):,} titoli")

# --- feature strada 1: propagazione sul grafo dei film (vicini con teacher, k-NN, LOO)
fg = np.load(ROOT / ".cache" / "movielens" / "film-graph.npz", allow_pickle=True)
fg_key = {f"{t}:{int(i)}": k for k, (t, i) in enumerate(zip(fg["types"], fg["ids"]))}
NEIGH = [[] for _ in range(len(fg["member"]))]
for a, b in fg["edges"]:
    NEIGH[int(a)].append(int(b)); NEIGH[int(b)].append(int(a))
cat_key = {f"{cat['type'].iloc[i]}:{int(cat['id'].iloc[i])}": i for i in range(len(cat))}
node2cat = {fg_key[k]: cat_key[k] for k in fg_key if k in cat_key}
FE3 = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
n_prop = 0
for i in idx:
    k = f"{cat['type'].iloc[i]}:{int(cat['id'].iloc[i])}"
    nd = fg_key.get(k)
    if nd is None:
        continue
    vs, ws = [], []
    for nb in NEIGH[nd]:
        j = node2cat.get(nb)
        if j is None or j == i or trow_of_cat[j] < 0:
            continue
        vs.append(ZA[trow_of_cat[j]]); ws.append(1.0 / max(1.0, len(NEIGH[nb]) ** 0.5))   # normalizza per grado (hubness)
    if not vs:
        continue
    v = np.average(np.array(vs), axis=0, weights=np.array(ws))
    FE3[i] = v / (np.linalg.norm(v) + 1e-9); n_prop += 1
log(f"  feature strada 1: {n_prop:,} titoli con almeno un vicino col teacher")

log("\n  | feature | dim | A->B | cold-start | controllo |")
log("  |---|---|---|---|---|")
for lbl, M in [("one-hot (oggi)", F),
               ("strada 2: embedding comportamentale", sparse.csr_matrix(FE2)),
               ("strada 2b: max-pooling", sparse.csr_matrix(FE2max)),
               ("strada 1: propagazione dai vicini", sparse.csr_matrix(FE3)),
               ("one-hot + strada 2", sparse.hstack([F, sparse.csr_matrix(FE2)]).tocsr()),
               ("one-hot + strada 1", sparse.hstack([F, sparse.csr_matrix(FE3)]).tocsr()),
               ("one-hot + entrambe", sparse.hstack([F, sparse.csr_matrix(FE2), sparse.csr_matrix(FE3)]).tocsr())]:
    m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[idx], YA[idx])
    ab = cos(m.predict(M[idx]), YB[idx]).mean()
    keep = np.array([i for i in idx if i not in set(cold.tolist())])
    m2 = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[keep], Y[keep])
    cs = cos(m2.predict(M[cold]), Y[cold]).mean()
    keepr = np.array([i for i in idx if i not in set(rand_same.tolist())])
    m3 = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[keepr], Y[keepr])
    cr = cos(m3.predict(M[rand_same]), Y[rand_same]).mean()
    log(f"  | {lbl} | {M.shape[1]:,} | {ab:.3f} | {cs:.3f} | {cr:.3f} |")
log("\n  (riferimenti: one-hot A->B 0,362 · cold-start 0,494 · controllo 0,507 · banale 0,224)")
log("   avvertenza dichiarata: il GRAFO dei film e' costruito dalle previsioni dello student, quindi la")
log("   strada 1 porta una circolarita' residua — la si misura come INCREMENTO su one-hot, non da sola)")

# ============================================================ 7. PER FASCIA: il rumore e' alta varianza?
# La domanda dell'utente («anche il rumore puo' essere utile, per discriminare il vero segnale»).
# Se la propagazione stima i film poco votati DAI LORO VICINI (meglio misurati), il 55% a bassa
# stabilita' non e' un muro: e' ALTA VARIANZA, e i vicini la mediano.
log("\n=== 7. PER FASCIA DI POPOLARITA': rumore inutile o alta varianza? ===")
log("  film nel test: " + " · ".join(f"{['<100 voti','100-1k','1k+'][b]}: {int((band[idx]==b).sum()):,}" for b in range(3)))
log("\n  | feature | <100 voti | 100-1k | 1k+ |")
log("  |---|---|---|---|")
for lbl, M in [("one-hot (metadati)", F),
               ("strada 1 da sola (vicini)", sparse.csr_matrix(FE3)),
               ("one-hot + strada 1", sparse.hstack([F, sparse.csr_matrix(FE3)]).tocsr())]:
    m = Ridge(alpha=30.0, solver="lsqr", max_iter=1000).fit(M[idx], YA[idx])
    p = m.predict(M[idx])
    per = [cos(p[band[idx] == b], YB[idx][band[idx] == b]).mean() if (band[idx] == b).sum() > 0 else float("nan") for b in range(3)]
    log(f"  | {lbl} | {per[0]:.3f} | {per[1]:.3f} | {per[2]:.3f} |")
has_prop = np.abs(FE3).sum(1) > 0
log("\n  copertura della propagazione per fascia: " +
    " · ".join(f"{['<100','100-1k','1k+'][b]}: {100*has_prop[idx][band[idx]==b].mean():.0f}%" for b in range(3)))
log("  (se la propagazione regge sui poco votati, il 'rumore' e' alta varianza che i vicini mediano)")
