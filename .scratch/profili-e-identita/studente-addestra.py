"""23 — addestra lo studente che colloca i titoli nuovi, con il grafo V45 servito come maestro.

Le decisioni del grilling (10/11/2026), tutte in questo file:

  · maestro   = il grafo servito (`v45-triangolo.npz`), allineato per costruzione
  · forma A   = i tre blocchi densi (trama + keyword proiettate + meta), ricetta dell'originale
  · forma B   = gli stessi blocchi PIU' le righe delle sette fonti di contenuto, cosi' che la
                fusione sia appresa invece che fissata dai pesi RRF
  · due giri  = uno con 1.000 titoli esclusi dal training (per FIDARSI: si collocano come se
                fossero nuovi e si misura l'overlap contro le righe servite) e uno completo
                (per USARE: e' l'artefatto che serve al ticket 21)
  · cancello  = overlap@100 mediano >= 0,50 sui 1.000 esclusi, dichiarato prima di guardare

Uso:
  py .scratch/profili-e-identita/studente-addestra.py --forma A --heldout 1000 --epoche 24
  py .scratch/profili-e-identita/studente-addestra.py --forma A --heldout 0    --epoche 24
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
import sys

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services"))

from services.graph_dense import config as C                      # noqa: E402
from services.graph_dense import data as D                       # noqa: E402
from services.graph_dense.train_b1 import BlockStudent, _batch_meta  # noqa: E402

V45 = ROOT / "services" / "graph" / "data" / "v45"
PESI = json.loads((V45 / "pesi.json").read_text())
# Le fonti che un titolo nuovo puo' avere: il resto e' comportamento.
CONTENUTO = ["KWSEM", "DIR", "COLL", "CAST", "PROD", "CREWPROP", "TRAMA"]
SEED = 20
TOP_VAL = 100


class StudenteFusione(nn.Module):
    """Forma B: blocchi densi + fusione appresa delle righe delle fonti di contenuto."""

    def __init__(self, n_meta, n_voci, d_meta=512, d_fus=512, wp=0.8, wk=0.57, wm=1.0):
        super().__init__()
        self.base = BlockStudent(n_meta, d_meta=d_meta, wp=wp, wk=wk, wm=wm)
        # EmbeddingBag e non Embedding: serve `per_sample_weights` per pesare i vicini con
        # il peso RRF della fonte che li propone.
        self.voci = nn.EmbeddingBag(n_voci, d_fus, mode="sum")
        self.ln = nn.LayerNorm(d_fus)

    def forward(self, idx, off, val, bp, bk, fidx, foff, fval):
        b = self.base(idx, off, val, bp, bk)
        h = F.normalize(self.ln(self.voci(fidx, foff, per_sample_weights=fval)), dim=1)
        return F.normalize(torch.cat([b, h], 1), dim=1)


def carica_fonti(N: int) -> dict[str, sp.csr_matrix]:
    """Le righe delle sette fonti di contenuto, gia' normalizzate e pesate per riga."""
    out = {}
    for t in CONTENUTO:
        p = V45 / "tipi2-pesi" / f"{t}.npz"
        if not p.is_file():
            raise SystemExit(f"fonte mancante: {p}")
        z = np.load(p)
        out[t] = sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=(N, N)).tocsr()
    return out


def batch_fusione(fonti: dict[str, sp.csr_matrix], rows: np.ndarray, rrf_k: int = 15):
    """Per il batch: indici dei vicini, offset per riga, pesi RRF normalizzati per riga."""
    per_riga = [([], []) for _ in rows]
    for t, S in fonti.items():
        w_t = float(PESI[t])
        sub = S[rows].tocsr()
        for i in range(len(rows)):
            lo, hi = sub.indptr[i], sub.indptr[i + 1]
            if lo == hi:
                continue
            js = sub.indices[lo:hi]
            vs = sub.data[lo:hi]
            o = np.argsort(-vs)
            js = js[o]
            contrib = w_t / (rrf_k + np.arange(len(js)))
            per_riga[i][0].extend(js.tolist())
            per_riga[i][1].extend(contrib.tolist())
    idx, vals, lens = [], [], []
    for js, vs in per_riga:
        s = float(np.sum(vs))
        if not js or s <= 0:
            lens.append(0)
            continue
        idx.extend(js)
        vals.extend([v / s for v in vs])
        lens.append(len(js))
    off = np.r_[0, np.cumsum(lens)[:-1]].astype(np.int64) if lens else np.zeros(0, np.int64)
    return (
        torch.from_numpy(np.asarray(idx, np.int64)),
        torch.from_numpy(off),
        torch.from_numpy(np.asarray(vals, np.float32)),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--forma", choices=["A", "B"], default="A")
    ap.add_argument("--heldout", type=int, default=0, help="titoli esclusi dal training (0 = usa tutto)")
    ap.add_argument("--epoche", type=int, default=24)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--dim", type=int, default=512)
    ap.add_argument("--tau", type=float, default=float(C.TAU))
    ap.add_argument("--lr", type=float, default=float(C.LR))
    ap.add_argument("--maestro", default=str(V45 / "v45-triangolo.npz"),
                    help="grafo maestro: deve essere SENZA RRFST (ricetta norrfst), altrimenti lo "
                         "studente impara a imitare lo studente precedente invece del comportamento")
    ap.add_argument("--peso-freddi", type=float, default=1.0,
                    help="quanto pesa nell'estrazione una riga con co-visione bassa (1.0 = uniforme)")
    ap.add_argument("--freddi-soglia", type=int, default=2,
                    help="grado di COVISION sotto il quale una riga conta come fredda")
    ap.add_argument("--out", default=".cache/studente-v45.npz")
    a = ap.parse_args()

    t0 = time.time()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device {dev} · forma {a.forma} · heldout {a.heldout} · epoche {a.epoche}", flush=True)
    if dev == "cuda":
        torch.cuda.set_per_process_memory_fraction(0.9, 0)
        torch.cuda.empty_cache()

    B = D.basic(); N = B["N"]
    zt = np.load(a.maestro, allow_pickle=True)
    W = sp.csr_matrix((zt["data"], zt["indices"], zt["indptr"]), shape=(N, N)).tocsr()
    print(f"maestro: {Path(a.maestro).name} · {W.nnz:,} archi · {N:,} righe", flush=True)

    zbl = np.load(ROOT / "services" / "graph_dense" / "data" / "blocks.npz")
    Bp = torch.from_numpy(zbl["Bp"].astype(np.float32)).to(dev)
    Bk = torch.from_numpy(zbl["Bk"].astype(np.float32)).to(dev)
    keep = zbl["keep"]
    X = D.features(B, extra=True)[:, keep].tocsr()
    print(f"blocchi: trama {Bp.shape[1]} · keyword {Bk.shape[1]} · meta {X.shape[1]:,}", flush=True)

    # held-out stratificato: film / serie / anime, per non misurare solo blockbuster
    tiene = np.diff(W.indptr) > 0
    nodi = np.flatnonzero(tiene)
    meta_c = np.load(ROOT / "services" / "graph" / "data" / "metadati-canone.npz", allow_pickle=True)
    zsp = np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz", allow_pickle=True)
    is_tv = zsp["tipo"] == "tv"
    anime = np.asarray(meta_c["ANIME"], bool) if "ANIME" in meta_c else np.zeros(N, bool)
    rng = np.random.default_rng(SEED)
    esclusi = np.array([], np.int64)
    if a.heldout > 0:
        per_classe = a.heldout // 3
        scelti = []
        for maschera in (anime & tiene, (is_tv & ~anime) & tiene, (~is_tv & ~anime) & tiene):
            cand = np.flatnonzero(maschera)
            scelti.append(rng.choice(cand, size=min(per_classe, len(cand)), replace=False))
        esclusi = np.unique(np.concatenate(scelti))
        print(f"held-out: {len(esclusi):,} titoli esclusi dal training", flush=True)
    addestrabili = np.setdiff1d(nodi, esclusi)

    # Estrazione pesata per freddezza: con `--peso-freddi > 1` le righe senza co-visione pesano di
    # piu' nei batch. Serve perche' il campionamento uniforme spende la capacita' sulla massa
    # popolare, e i titoli senza comportamento restano indietro (divario misurato: +0,12).
    zc = np.load(V45 / "tipi2-pesi" / "COVISION.npz")
    cov_grado = np.diff(zc["indptr"])
    prob = None
    if a.peso_freddi != 1.0:
        pesi_camp = np.where(cov_grado[addestrabili] <= a.freddi_soglia, float(a.peso_freddi), 1.0)
        prob = pesi_camp / pesi_camp.sum()
        print(f"estrazione pesata: freddi (COVISION<={a.freddi_soglia}) x{a.peso_freddi} · "
              f"{int((cov_grado[addestrabili] <= a.freddi_soglia).sum()):,} righe fredde su "
              f"{len(addestrabili):,}", flush=True)

    fonti = carica_fonti(N) if a.forma == "B" else {}
    if a.forma == "B":
        print(f"fusione appresa su: {', '.join(fonti)}", flush=True)

    if a.forma == "A":
        model = BlockStudent(X.shape[1], d_meta=a.dim).to(dev)
    else:
        model = StudenteFusione(X.shape[1], n_voci=N, d_meta=a.dim).to(dev)
    ott = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=float(C.WD), foreach=False)
    sch = torch.optim.lr_scheduler.CosineAnnealingLR(ott, T_max=a.epoche, eta_min=1e-4)
    torch.manual_seed(C.SEED)
    dim_v = Bp.shape[1] + Bk.shape[1] + a.dim + (a.dim if a.forma == "B" else 0)
    print(f"parametri {sum(p.numel() for p in model.parameters())/1e6:.2f}M · vettore {dim_v}", flush=True)

    def enc(rows, drop):
        rt = torch.from_numpy(np.asarray(rows, np.int64)).to(dev)
        idx, off, val = _batch_meta(X, rows, rng, drop=drop)
        if a.forma == "A":
            return model(idx.to(dev), off.to(dev), val.to(dev), Bp[rt], Bk[rt])
        fidx, foff, fval = batch_fusione(fonti, np.asarray(rows, np.int64))
        return model(idx.to(dev), off.to(dev), val.to(dev), Bp[rt], Bk[rt],
                     fidx.to(dev), foff.to(dev), fval.to(dev))

    def banca() -> torch.Tensor:
        model.eval()
        Z = np.zeros((N, dim_v), np.float32)
        with torch.no_grad():
            for st in range(0, N, 4096):
                r = np.arange(st, min(st + 4096, N))
                Z[r] = enc(r, drop=False).float().cpu().numpy()
        model.train()
        return torch.from_numpy(Z).to(dev)

    def target(bn):
        righe = W[bn]
        lens = np.diff(righe.indptr).astype(np.int64)
        ii = np.repeat(np.arange(len(bn)), lens)
        vals = np.power(righe.data.astype(np.float32), 0.5)
        starts = righe.indptr[:-1].astype(np.int64)
        somma = np.add.reduceat(vals, np.minimum(starts, len(vals) - 1)).astype(np.float64) if len(vals) else np.ones(len(bn))
        somma[lens == 0] = 1.0
        somma[somma <= 0] = 1.0
        vals = (vals / np.repeat(somma, lens)).astype(np.float32)
        P = torch.zeros((len(bn), N), device=dev)
        P[torch.from_numpy(ii.astype(np.int64)).to(dev),
          torch.from_numpy(righe.indices.astype(np.int64)).to(dev)] = torch.from_numpy(vals).to(dev)
        return P

    for ep in range(1, a.epoche + 1):
        ep_t = time.time()
        Zb = banca()
        model.train()
        perm = (rng.choice(addestrabili, size=len(addestrabili), replace=True, p=prob)
                if prob is not None else rng.permutation(addestrabili))
        tot, nb = 0.0, 0
        for st in range(0, len(perm), a.batch):
            bn = perm[st:st + a.batch]
            if len(bn) < 32:
                continue
            za = enc(bn, drop=True)
            logits = (za @ Zb.T) / a.tau
            bnt = torch.from_numpy(bn.astype(np.int64)).to(dev)
            logits.scatter_(1, bnt.unsqueeze(1), -1e4)
            P = target(bn)
            loss = -(P * torch.log_softmax(logits, dim=1)).sum(1).mean()
            ott.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            ott.step()
            tot += float(loss); nb += 1
            if nb % 40 == 0:
                print(f"  ep {ep} · {st+len(bn)}/{len(perm)} batch · loss {tot/nb:.4f} · {time.time()-t0:.0f}s", flush=True)
        sch.step()
        print(f"ep {ep}/{a.epoche} loss {tot/max(nb,1):.4f} · {time.time()-ep_t:.0f}s", flush=True)

    model.eval()
    Z = np.zeros((N, dim_v), np.float32)
    with torch.no_grad():
        for st in range(0, N, 4096):
            r = np.arange(st, min(st + 4096, N))
            Z[r] = enc(r, drop=False).float().cpu().numpy()

    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, Z=Z, forma=a.forma, heldout=esclusi.astype(np.int64),
                        epoche=a.epoche, maestro=Path(a.maestro).name,
                        peso_freddi=np.float32(a.peso_freddi))
    print(f"scritto {out} · Z {Z.shape} · {out.stat().st_size/2**20:.0f} MB · {time.time()-t0:.0f}s", flush=True)

    # ---- la prova: i titoli esclusi si collocano come se fossero nuovi
    if len(esclusi):
        servito = np.load(ROOT / "services" / "graph" / "data" / "v45-vicini100" / "vicini-top100.npz")
        s_indptr, s_indices = servito["indptr"], servito["indices"]
        Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
        voti = {}
        for st in range(0, len(esclusi), 512):
            blk = esclusi[st:st + 512]
            sim = Zn[blk] @ Zn.T
            for i, r in enumerate(blk):
                sim[i, r] = -9.0
                top = np.argpartition(-sim[i], TOP_VAL)[:TOP_VAL]
                voti[int(r)] = set(top.tolist())
        res = {"@10": [], "@50": [], "@100": []}
        for r, top in voti.items():
            serv = set(int(x) for x in s_indices[s_indptr[r]:s_indptr[r + 1]][:TOP_VAL])
            if not serv:
                continue
            res["@10"].append(len(top & set(list(serv)[:10])) / 10)
            res["@50"].append(len(top & set(list(serv)[:50])) / 50)
            res["@100"].append(len(top & serv) / 100)
        rep = {k: {"mediana": round(float(np.median(v)), 3), "p10": round(float(np.percentile(v, 10)), 3)}
               for k, v in res.items() if v}
        print("PROVA sui titoli esclusi: " + json.dumps(rep), flush=True)
        (ROOT / ".cache" / f"studente-prova-{a.forma}.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
