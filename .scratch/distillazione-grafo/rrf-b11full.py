"""Multi-vector + RRF sui 4 rami di b11full, letto sui 40 titoli."""
import numpy as np, torch, torch.nn.functional as F
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b3 import BlockStudentG
from services.graph_dense.train_b1 import _batch_meta

B = D.basic(); N = B["N"]; ro = B["row_of"]
keep = np.load(C.DATA / "blocks.npz")["keep"]
X = D.features(B, extra=True).tocsr()[:, keep]
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
beh = np.load(C.DATA / "lc150.npz")["Z"].astype(np.float32)
m = BlockStudentG(X.shape[1], 512, 4); m.load_state_dict(torch.load(C.DATA / "b11full-model.pt", map_location="cpu")); m.eval()
Z = {k: np.zeros((N, d), np.float32) for k, d in (("bp", 1024), ("bk", 512), ("beh", 512), ("h", 512))}
with torch.no_grad():
    for st in range(0, N, 2048):
        rows = np.arange(st, min(st + 2048, N))
        idx, off, val = _batch_meta(X, rows, np.random.default_rng(0), drop=False)
        hh = F.gelu(m.ln(m.bag(idx, off, per_sample_weights=val)))
        hh = F.normalize(m.proj(hh + m.res(hh)), dim=1).numpy()
        Z["bp"][rows] = Bp[rows]; Z["bk"][rows] = Bk[rows]
        Z["beh"][rows] = beh[rows]; Z["h"][rows] = hh
for k in Z:
    Z[k] /= (np.linalg.norm(Z[k], axis=1, keepdims=True) + 1e-9)

FILM = [(597,"Titanic"),(872585,"Oppenheimer"),(346698,"Barbie"),(792307,"Povere creature!"),(150540,"Inside Out"),
        (381341,"Perfetti"),(348,"Alien"),(8587,"Il re leone"),(129,"Giappone"),(496243,"Parasite"),
        (550,"Fight Club"),(545611,"EEAAO"),(157336,"Interstellar"),(238,"Il padrino"),(680,"Pulp Fiction"),
        (27205,"Inception"),(155,"Batman"),(244786,"Whiplash"),(313369,"La La Land"),(694,"Shining")]
SERIE = [(94997,"HotD"),(93405,"Squid Game"),(1438,"The Wire"),(60059,"BCS"),(87108,"Chernobyl"),
         (1399,"GoT"),(84773,"Rings"),(100088,"Last of Us"),(95396,"Scissione"),(83867,"Andor"),
         (66732,"Stranger Things"),(1396,"Breaking Bad"),(46648,"True Detective"),(76331,"Succession"),
         (76479,"The Boys"),(70523,"Dark"),(65494,"The Crown"),(71446,"Casa di carta"),(87739,"Scacchi"),(60574,"Peaky")]
TOPK = 100; K = 60
WF = {"bp": 0.50, "bk": 0.15, "beh": 0.25, "h": 0.10}
WS = {"bp": 0.20, "bk": 0.10, "beh": 0.40, "h": 0.30}
is_tv = B["is_tv"]
def rrf(i):
    sc = np.zeros(N, np.float32)
    W = WS if is_tv[i] else WF
    for k in Z:
        c = Z[k] @ Z[k][i]; c[i] = -1e9
        top = np.argsort(-c)[:TOPK]
        sc[top] += W[k] / (K + np.arange(1, TOPK + 1))
    sc[i] = -1e9
    return np.argsort(-sc)[:6]
for lab, L in (("FILM", FILM), ("SERIE", SERIE)):
    print(f"\n===== {lab}")
    for tid, nome in L:
        key = ("movie:" if lab == "FILM" else "tv:") + str(tid)
        if key not in ro:
            print(f"\n### {nome} FUORI"); continue
        i = int(ro[key])
        print(f"\n### {nome}")
        print("RRF : " + " · ".join(B["titoli"][int(x)] for x in rrf(i)))
