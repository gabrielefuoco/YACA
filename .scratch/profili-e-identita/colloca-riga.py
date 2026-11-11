"""La riga di un titolo nuovo, per intero: sette fonti → fusione → studente → top-16.

Le sette righe si calcolano tutte con le strutture congelate (`.cache/fonti/`), senza toccare il corpus:

  TRAMA    coseno fra il suo embedding di trama e quelli del canone
  CAST     coseno IDF fra i suoi attori e quelli del canone          (e così DIR, PROD, COLL)
  KWSEM    le sue keyword proiettate sul grafo keyword, poi coseno
  CREWPROP una camminata sul grafo servito dai film delle sue persone

Poi la fusione (RRF, stessi pesi dell'addestramento) dà l'ingresso allo studente, che produce il
vettore; i vicini sono i top-16 per coseno.

  py .scratch/profili-e-identita/colloca-riga.py --key movie:1751701
  py .scratch/profili-e-identita/colloca-riga.py --key movie:603 --verifica
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph import camminata as cam          # noqa: E402
from services.graph.build import config as C        # noqa: E402
from services.graph.build import data as D          # noqa: E402

# Gli artefatti hanno un CONTRATTO (ticket 24): cartella dichiarata, manifesto versionato con sha e
# ricetta, e un controllo che si ferma invece di ripiegare. Non stanno più in `.cache/`, che è
# sacrificabile per definizione.
ARTEFATTI = ROOT / "services" / "graph" / "data" / "collocatore"
FONTI = ARTEFATTI / "fonti"
RIGHE = FONTI / "righe"
ING = ARTEFATTI / "ingressi"
TRANS = ROOT / "services" / "graph" / "data" / "v45-transizione" / "transizione-pota16.npz"
PESI = json.loads((ROOT / "services" / "graph" / "data" / "v45" / "pesi.json").read_text())
RRF_K = 15
K = 100
TOP = 16


def _modulo(percorso: str, nome: str):
    spec = importlib.util.spec_from_file_location(nome, ROOT / percorso)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


CT = _modulo(".scratch/profili-e-identita/colloca-titolo.py", "ct")
ALL = _modulo(".scratch/profili-e-identita/studente-addestra.py", "all")


class Collocatore:
    def __init__(self) -> None:
        self.ric = json.loads((ING / "ricetta.json").read_text(encoding="utf-8"))
        zr = np.load(ING / "ricetta.npz")
        self.idf, self.keep, self.kwcols = zr["idf"], zr["keep"], zr["kwcols"]
        self.PH = sp.csr_matrix((zr["PH_data"], zr["PH_indices"], zr["PH_indptr"]),
                                shape=tuple(zr["PH_shape"]))
        self.B = D.basic()
        self.N = self.B["N"]
        self.keys = [f"{t}:{int(i)}" for t, i in
                     zip(np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz",
                                 allow_pickle=True)["tipo"],
                         np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz",
                                 allow_pickle=True)["tmdb"])]
        self.row_of = {k: i for i, k in enumerate(self.keys)}
        self.Xp, self.has_plot, _ = D.plot_embedding(self.B)
        self.Xp = sp.csr_matrix(self.Xp)
        self.kw = json.loads((FONTI / "KWSEM.json").read_text(encoding="utf-8"))
        self.G = sp.load_npz(FONTI / "KWSEM_G.npz").tocsr()
        self.Xs = sp.load_npz(FONTI / "KWSEM_Xs.npz").tocsr()
        self.norme_kw = np.load(FONTI / "KWSEM_norme.npy")
        self.meta = {}
        for t in ("CAST", "DIR", "PROD", "COLL"):
            r = json.loads((FONTI / f"AN_{t}.json").read_text(encoding="utf-8"))
            self.meta[t] = {"AN": sp.load_npz(FONTI / f"AN_{t}.npz").tocsr(),
                            "vocab": r["vocab"], "idf": np.asarray(r["idf"], np.float32),
                            "tau": r["tau"], "prefisso": r["prefisso"]}
        zt = np.load(TRANS)
        self.Tr = sp.csr_matrix((zt["data"], zt["indices"], zt["indptr"]), shape=(self.N, self.N))
        self.per_persone = None

    # ── una fonte alla volta ──────────────────────────────────────────────────────────────────────
    def _topk(self, sim: np.ndarray, escludi: int | None = None) -> dict[int, float]:
        if escludi is not None:
            sim[escludi] = -9.0
        o = np.argpartition(-sim, K)[:K]
        o = o[sim[o] > 0]
        return {int(j): float(sim[j]) for j in o}

    def trama(self, meta: dict, riga: int | None) -> dict[int, float]:
        if riga is not None and self.has_plot[riga]:
            v = self.Xp[riga]
        else:
            v = sp.csr_matrix(CT.encoder_trama(meta)[None, :])
        sim = np.asarray((self.Xp @ v.T).todense()).ravel()
        return self._topk(sim, riga)

    def attributi(self, tipo: str, meta: dict, riga: int | None) -> dict[int, float]:
        """I token di UNA fonte, con la sua ricetta (non quella del blocco 05).

        Tre trappole già pagate, tutte scoperte dalla verifica:
          · `CAST` usa **tutto** il cast; il blocco 05 lo tronca a 10, e le due cose non vanno confuse;
          · `PROD` vuole il prefisso `pr:`, non `co:` come il blocco 05;
          · `COLL` non è un attributo del blocco 05: è la collezione TMDB (`co:<id>`).
        """
        m = self.meta[tipo]
        nomi_min = CT._nomi_min
        if tipo == "CAST":
            token = [f"ca:{x}" for x in nomi_min(meta.get("cast"))]
        elif tipo == "DIR":
            campi = "directors" if meta["_tipo"] == "movie" else "created_by"
            token = [f"di:{x}" for x in nomi_min(meta.get(campi))] or                     [f"di:{x}" for x in nomi_min(meta.get("created_by"))]
        elif tipo == "PROD":
            token = [f"pr:{x}" for x in nomi_min(meta.get("production_companies"))]
        else:
            cid = meta.get("collection_id")
            token = [f"co:{int(cid)}"] if (meta["_tipo"] == "movie" and cid == cid and cid) else []
        js = np.asarray([m["vocab"][x] for x in token if x in m["vocab"]], np.int64)
        if len(js) == 0:
            return {}
        w = m["idf"][js].astype(np.float64)
        q = float(np.sqrt((w ** 2).sum()))
        w = w / np.sqrt(q ** 2 + m["tau"] ** 2)
        col = sp.csr_matrix((w.astype(np.float32), (js, np.zeros(len(js), np.int32))),
                            shape=(m["AN"].shape[1], 1))
        sim = np.asarray((m["AN"] @ col).todense()).ravel()
        return self._topk(sim, riga)

    def kwsem(self, meta: dict, riga: int | None) -> dict[int, float]:
        tokens = CT.token_tfidf(meta)
        js, vs = [], []
        for t in tokens:
            if not t.startswith("kw:"):
                continue
            j = self.ric["vocab"].get(t)
            if j is None:
                continue
            js.append(j); vs.append(1.0)
        if not js:
            return {}
        pos = {c: k for k, c in enumerate(self.kw["cols"])}
        k = np.asarray([pos[c] for c in js if c in pos], np.int64)
        if len(k) == 0:
            return {}
        v = sp.csr_matrix((np.ones(len(k), np.float32), (np.zeros(len(k), np.int32), k)),
                          shape=(1, len(self.kw["cols"])))
        n = float(np.sqrt(v.multiply(v).sum()))
        v = v / n
        xs = (v @ self.G).tocsr()
        q = float(np.sqrt(xs.multiply(xs).sum()))
        if q == 0:
            return {}
        sim = np.asarray((self.Xs @ xs.T).todense()).ravel() / np.maximum(
            self.norme_kw * np.sqrt(q ** 2 + self.kw["tau"] ** 2), 1e-9)
        return self._topk(sim, riga)

    def crewprop(self, meta: dict, riga: int | None) -> dict[int, float]:
        """La camminata della carriera: semi = i film delle persone del titolo (sé escluso)."""
        if self.per_persone is None:
            self.per_persone = _modulo(".scratch/profili-e-identita/crewprop-camminata.py",
                                       "cw").incidenza(self.N, self.row_of)
        tipo = meta["_tipo"]

        def _ids(cell) -> list[int]:
            return [int(x["id"]) for x in CT._leggi(cell)
                    if isinstance(x, dict) and x.get("id") is not None]

        persone = [("dir", i) for i in _ids(meta.get("directors" if tipo == "movie" else "created_by"))]
        if tipo == "movie":
            persone += [("wr", i) for i in _ids(meta.get("writers"))]
        persone += [("ca", i) for i in _ids(meta.get("cast"))[:3]]
        semi: dict[int, float] = {}
        for ruolo, pid in persone:
            voci = self.per_persone.get(int(pid), [])
            w_ruolo = {"dir": 1.0, "wr": 0.7, "ca": 0.5}.get(ruolo, 0.5)
            for r2, _, voti in voci:
                if r2 == riga:
                    continue
                semi[r2] = semi.get(r2, 0.0) + w_ruolo * (1.0 + np.log1p(voti))
        if not semi:
            return {}
        idx = np.fromiter(semi.keys(), np.int64, len(semi))
        pesi = np.fromiter(semi.values(), np.float32, len(semi))
        pesi = pesi / pesi.sum()
        v = cam.ppr(self.Tr, idx, pesi)
        v[idx] = -1.0
        return self._topk(v, riga)

    # ── la fusione, identica all'addestramento ───────────────────────────────────────────────────
    def righe_fonti(self, meta: dict, riga: int | None) -> dict[str, dict[int, float]]:
        return {
            "TRAMA": self.trama(meta, riga),
            "CAST": self.attributi("CAST", meta, riga),
            "DIR": self.attributi("DIR", meta, riga),
            "PROD": self.attributi("PROD", meta, riga),
            "COLL": self.attributi("COLL", meta, riga),
            "KWSEM": self.kwsem(meta, riga),
            "CREWPROP": self.crewprop(meta, riga),
        }


def ingresso_fusione(righe: dict[str, dict[int, float]], N: int) -> tuple[np.ndarray, np.ndarray]:
    """RRF a pesi fissi: v = w_t / (k + rango), normalizzato per riga. È la stessa formula di
    `studente_addestra.batch_fusione`, applicata alla singola riga."""
    punteggi: dict[int, float] = {}
    for t, voce in righe.items():
        if not voce:
            continue
        js = np.asarray([j for j in voce], np.int64)
        vs = np.asarray([voce[j] for j in js], np.float64)
        o = np.argsort(-vs)
        js = js[o]
        contrib = float(PESI[t]) / (RRF_K + np.arange(len(js)))
        for j, c in zip(js, contrib):
            punteggi[int(j)] = punteggi.get(int(j), 0.0) + float(c)
    voci = sorted(punteggi.items(), key=lambda kv: -kv[1])[:K]
    js = np.asarray([j for j, _ in voci], np.int64)
    vs = np.asarray([v for _, v in voci], np.float64)
    return js, (vs / vs.sum()).astype(np.float32)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True)
    ap.add_argument("--studente", default=str(ARTEFATTI / "studente-finale"))
    ap.add_argument("--out", default=".cache/collocazione-finale.json")
    ap.add_argument("--verifica", action="store_true")
    a = ap.parse_args()

    # il contratto si verifica PRIMA di toccare qualsiasi cosa
    import importlib.util as _iu
    _spec = _iu.spec_from_file_location(
        "va", ROOT / ".scratch" / "profili-e-identita" / "verifica-artefatti.py")
    va = _iu.module_from_spec(_spec); _spec.loader.exec_module(va)
    problemi = va.verifica()
    if problemi:
        for p in problemi:
            print(f"  · {p}")
        raise SystemExit("artefatti del collocatore non validi: mi fermo invece di collocare male")

    col = Collocatore()
    meta = CT.meta_tmdb(a.key)
    riga = col.row_of.get(a.key)
    print(f"{a.key} · «{meta.get('title')}» · {'nel canone' if riga is not None else 'FUORI canone'}",
          flush=True)

    righe = col.righe_fonti(meta, riga)
    for t, v in righe.items():
        print(f"  {t:9s} {len(v):3d} vicini", flush=True)

    # verifica: le righe calcolate devono somigliare a quelle congelate per i titoli del canone
    if a.verifica and riga is not None:
        for t, v in righe.items():
            z = np.load(RIGHE / f"{t}.npz")
            M = sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=(col.N, col.N))
            vero = set(M.indices[M.indptr[riga]:M.indptr[riga + 1]].tolist())
            ov = len(set(v) & vero) / max(len(vero), 1)
            print(f"    verifica {t:9s} sovrapposizione con la riga congelata: {ov:.3f}", flush=True)

    js, vs = ingresso_fusione(righe, col.N)

    # gl'ingressi densi, con la ricetta congelata (stessa di colloca-titolo.py)
    zbl = np.load(ROOT / "services" / "graph_dense" / "data" / "blocks.npz")
    X_meta = _meta_riga(col, meta)
    if riga is not None and col.has_plot[riga]:
        bp = np.asarray(col.Xp[riga].todense()).ravel().astype(np.float32)
    else:
        bp = CT.encoder_trama(meta)
    if riga is not None:
        bk = zbl["Bk"][riga].astype(np.float32)
    else:
        bk = _blocco_keyword(col, meta, zbl)

    cfg = json.loads(Path(a.studente + ".config.json").read_text(encoding="utf-8"))
    import importlib.util as iu
    spec = iu.spec_from_file_location("sa", ROOT / ".scratch" / "profili-e-identita" / "studente-addestra.py")
    sa = iu.module_from_spec(spec); spec.loader.exec_module(sa)
    modello = sa.StudenteFusione(cfg["n_meta"], n_voci=col.N, d_meta=cfg["dim"])
    modello.load_state_dict(torch.load(a.studente + ".pt", map_location="cpu"))
    modello.eval()

    Xs = sp.csr_matrix(X_meta[None, :])
    lens = np.diff(Xs.indptr)
    off = np.r_[0, np.cumsum(lens)[:-1]].astype(np.int64)
    with torch.no_grad():
        z = modello(
            torch.from_numpy(Xs.indices.astype(np.int64)),
            torch.from_numpy(off),
            torch.from_numpy(Xs.data.astype(np.float32)),
            torch.from_numpy(bp[None, :]),
            torch.from_numpy(bk[None, :]),
            torch.from_numpy(js),
            torch.from_numpy(np.zeros(1, np.int64)),
            torch.from_numpy(vs),
        )[0].numpy()

    zs = np.load(a.studente + ".npz", allow_pickle=True)
    Zc = np.asarray(zs["Z"], np.float32)
    Zn = Zc / (np.linalg.norm(Zc, axis=1, keepdims=True) + 1e-9)
    sim = Zn @ (z / (np.linalg.norm(z) + 1e-9))
    if riga is not None:
        sim[riga] = -9.0
    top = np.argsort(-sim)[:TOP]
    out = {"chiave": a.key, "titolo": meta.get("title") or meta.get("name"),
           "nel_canone": riga is not None,
           "vicini": [{"chiave": col.keys[i], "somiglianza": round(float(sim[i]), 4)} for i in top]}
    (ROOT / a.out).write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print("  riga: " + ", ".join(f"{v['chiave']}({v['somiglianza']:.3f})" for v in out["vicini"][:8]),
          flush=True)
    print(f"  scritto {a.out}", flush=True)
    return 0


def _meta_riga(col, meta: dict) -> np.ndarray:
    """Il blocco meta di una riga, con la ricetta congelata: 05 + gerarchia + strutturali + extra."""
    pesi = col.ric["pesi_token"]
    idx, val = [], []
    for ton in CT.token_tfidf(meta):
        j = col.ric["vocab"].get(ton)
        if j is None:
            continue
        idx.append(j); val.append(float(col.idf[j]) * float(pesi.get(ton[:3], 1.0)))
    n = np.sqrt(np.sum(np.square(val))) + 1e-9
    X = np.zeros(len(col.ric["vocab"]), np.float32)
    X[idx] = np.asarray(val, np.float32) / n
    H = np.zeros(col.PH.shape[1], np.float32)
    for j in np.flatnonzero(X > 0):
        lo, hi = col.PH.indptr[j], col.PH.indptr[j + 1]
        H[col.PH.indices[lo:hi]] += 1.0
    H = np.log1p(H); H /= (np.linalg.norm(H) + 1e-9)
    ds = str((meta.get("release_date") if meta["_tipo"] == "movie" else meta.get("first_air_date")) or "")
    anno = int(ds[:4]) if len(ds) >= 4 and ds[:4].isdigit() else 0
    nep = float(meta.get("number_of_episodes") or 1.0)
    is_tv = 1.0 if meta["_tipo"] == "tv" else 0.0
    st = np.asarray([is_tv, 1.0 - is_tv,
                     float(np.clip((anno - 1990.0) / 35.0, -2.5, 1.5)) if anno > 1900 else 0.0,
                     float(np.log1p(max(nep - 1.0, 0.0)) / 6.0)], np.float32) * 0.25
    col_extra = {t: i for i, t in enumerate(col.ric["extra_token"])}
    pe = np.asarray(col.ric["extra_pesi"], np.float32)
    E = np.zeros(len(col_extra), np.float32)
    for ton in CT.token_extra(meta):
        j = col_extra.get(ton)
        if j is not None:
            E[j] = pe[j]
    E /= (np.linalg.norm(E) + 1e-9)
    return np.concatenate([X, H, st, E])[col.keep]


def _blocco_keyword(col, meta: dict, zbl) -> np.ndarray:
    """Il blocco keyword: TF-IDF delle keyword → proiezione casuale congelata (SEED=42) → L2."""
    pos = {c: k for k, c in enumerate(col.kw["cols"])}
    js = [pos[col.ric["vocab"][t]] for t in CT.token_tfidf(meta)
          if t.startswith("kw:") and col.ric["vocab"].get(t) in pos]
    v = np.zeros(len(col.kw["cols"]), np.float32)
    v[np.asarray(js, np.int64)] = 1.0
    n = np.linalg.norm(v)
    if n > 0:
        v = v / n
    rng = np.random.default_rng(int(zbl["SEED"]))
    R = rng.choice(np.array([-1.0, 1.0], np.float32),
                   size=(len(col.kw["cols"]), int(zbl["KPROJ"]))) / np.sqrt(int(zbl["KPROJ"]))
    bk = v @ R
    return (bk / (np.linalg.norm(bk) + 1e-9)).astype(np.float32)


if __name__ == "__main__":
    raise SystemExit(main())
