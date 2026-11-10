"""Ticket 20 — quanto somiglia una riga «solo contenuto» a una riga servita?

L'esperimento, senza GPU e senza studente: si usano i titoli GIA' nel canone come prova.
Hanno una riga servita (vicini-top100.npz) e tutto il contenuto necessario per ricostruirla.

Per ciascuna riga campionata si ricompone la fusione RRF due volte, con gli stessi pesi veri
(v45/pesi.json) e lo stesso rrf_k=15 del manifest:

  A. TUTTE le fonti          -> controllo: quanto la ricostruzione somiglia al servito
  B. SOLO fonti di contenuto -> privata di COVISION, RRFST, LIST (peso 2,8 su 8,4)

La differenza fra A-servito e B-servito e' il costo di togliere il comportamento.
Manca volutamente la catena successiva (damping, chiusura, potatura): per questo A non sara'
identico al servito, e quella distanza e' l'errore dello strumento, da dichiarare prima di
leggere B.

Uso: PYTHONPATH=services py .scratch/profili-e-identita/ticket20-misura.py [--n 100]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
V45 = ROOT / "services" / "graph" / "data" / "v45"
SRC = V45 / "tipi2-pesi"
SERVITO = ROOT / "services" / "graph" / "data" / "v45-vicini100" / "vicini-top100.npz"

PESI = json.loads((V45 / "pesi.json").read_text())
RRF_K = 15
HUB_TIPI = {"CAST", "PROD"}
HUB_BETA = 0.25
BEHAV = {"COVISION", "RRFST", "LIST"}          # le fonti che un titolo nuovo non puo' avere
TOP = 100


def carica(nome: str, N: int) -> sp.csr_matrix:
    z = np.load(SRC / f"{nome}.npz")
    return sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=(N, N))


def correggi_hub(A: sp.csr_matrix, beta: float) -> sp.csr_matrix:
    """Come mixer.correggi_hub: divide l'arco verso j per (grado in entrata di j)^beta."""
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    return sp.csr_matrix(A.multiply((1.0 / np.maximum(ind, 1.0) ** beta)[None, :])).tocsr()


def righe_campionate(N: int, n_per_classe: int) -> dict[str, np.ndarray]:
    """Campione stratificato: film, serie, anime — con la riga servita non vuota."""
    meta = np.load(ROOT / "services" / "graph" / "data" / "metadati-canone.npz", allow_pickle=True)
    z = np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz", allow_pickle=True)
    tipo = z["tipo"]
    anime = np.asarray(meta["ANIME"], bool) if "ANIME" in meta else np.zeros(N, bool)
    is_tv = tipo == "tv"
    w = np.load(SERVITO)
    grado = np.diff(w["indptr"])
    vive = grado > 0

    rng = np.random.default_rng(20)
    out = {}
    for nome, maschera in [
        ("anime", anime & vive),
        ("serie", (is_tv & ~anime) & vive),
        ("film", (~is_tv & ~anime) & vive),
    ]:
        idx = np.flatnonzero(maschera)
        out[nome] = rng.choice(idx, size=min(n_per_classe, len(idx)), replace=False)
    return out


def rrf_riga(entrate: list[tuple[np.ndarray, np.ndarray, float]], k: int) -> np.ndarray:
    """Fusione RRF di una riga: v = w / (k + rango) sommato sulle fonti."""
    punteggi: dict[int, float] = {}
    for cols, vals, w in entrate:
        if len(cols) == 0:
            continue
        o = np.argsort(-vals)
        js = cols[o]
        contrib = w / (k + np.arange(len(js)))
        for j, c in zip(js, contrib):
            punteggi[int(j)] = punteggi.get(int(j), 0.0) + float(c)
    if not punteggi:
        return np.array([], np.int64)
    voci = sorted(punteggi.items(), key=lambda kv: -kv[1])[:TOP]
    return np.asarray([j for j, _ in voci], np.int64)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100, help="righe per classe (film/serie/anime)")
    ap.add_argument("--out", default=".cache/ticket20-misura.json")
    a = ap.parse_args()

    t0 = time.time()
    tipi = sorted(p for p in PESI if (SRC / f"{p}.npz").is_file())
    z = np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz", allow_pickle=True)
    N = len(z["tmdb"])
    print(f"fonti: {len(tipi)} · canone {N:,} · comportamento escluso: {sorted(BEHAV & set(tipi))}", flush=True)

    campione = righe_campionate(N, a.n)
    righe = np.unique(np.concatenate(list(campione.values())))
    pos_di = {int(r): i for i, r in enumerate(righe)}
    print("campione: " + " · ".join(f"{k} {len(v)}" for k, v in campione.items()), flush=True)

    # per ogni fonte si tengono SOLO le righe del campione: 14 matrici intere non servono
    solo_campione: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    for t in tipi:
        A = carica(t, N)
        if t in HUB_TIPI:
            A = correggi_hub(A, HUB_BETA)
        A = A.tocsr()
        indptr, indices, data = A.indptr, A.indices, A.data
        righe_loc, cols_loc, vals_loc = [], [], []
        for r in righe:
            lo, hi = indptr[r], indptr[r + 1]
            righe_loc.append(np.full(hi - lo, pos_di[int(r)], np.int32))
            cols_loc.append(indices[lo:hi].astype(np.int32))
            vals_loc.append(data[lo:hi].astype(np.float32))
        solo_campione[t] = (
            np.concatenate(righe_loc) if righe_loc else np.array([], np.int32),
            np.concatenate(cols_loc) if cols_loc else np.array([], np.int32),
            np.concatenate(vals_loc) if vals_loc else np.array([], np.float32),
        )
        del A
        print(f"  {t:<9} righe del campione pronte ({time.time()-t0:.0f}s)", flush=True)

    servito = np.load(SERVITO)
    s_indptr, s_indices = servito["indptr"], servito["indices"]

    def riga_servita(r: int) -> set[int]:
        return set(int(x) for x in s_indices[s_indptr[r]:s_indptr[r + 1]][:TOP])

    risultati = []
    for r in righe:
        i = pos_di[int(r)]
        serv = riga_servita(int(r))
        if not serv:
            continue
        per_fonte = {}
        for t, (rr, cc, vv) in solo_campione.items():
            m = rr == i
            per_fonte[t] = (cc[m], vv[m], PESI[t])

        def overlap(sel: dict[str, tuple]) -> dict[str, float]:
            top = rrf_riga(list(sel.values()), RRF_K)
            top_set = set(int(x) for x in top)
            return {f"@{k}": len(top_set & set(list(serv)[:k])) / k for k in (10, 50, 100)}

        tutto = overlap(per_fonte)
        contenuto = overlap({t: v for t, v in per_fonte.items() if t not in BEHAV})
        risultati.append({"riga": int(r), "tutto": tutto, "contenuto": contenuto})

    def riassunto(chiave: str, metrica: str) -> dict[str, float]:
        v = np.asarray([x[chiave][metrica] for x in risultati], float)
        return {
            "mediana": round(float(np.median(v)), 3),
            "p10": round(float(np.percentile(v, 10)), 3),
            "p90": round(float(np.percentile(v, 90)), 3),
            "media": round(float(v.mean()), 3),
        }

    report = {
        "campione": {k: len(v) for k, v in campione.items()},
        "righe_valutate": len(risultati),
        "fonti": tipi,
        "escluse": sorted(BEHAV & set(tipi)),
        "peso_totale": round(sum(PESI.values()), 2),
        "peso_contenuto": round(sum(v for k, v in PESI.items() if k not in BEHAV), 2),
        "tutte_le_fonti": {m: riassunto("tutto", m) for m in ("@10", "@50", "@100")},
        "solo_contenuto": {m: riassunto("contenuto", m) for m in ("@10", "@50", "@100")},
        "per_classe": {},
        "secondi": round(time.time() - t0, 1),
    }
    for classe, idx in campione.items():
        ins = set(int(x) for x in idx)
        sel = [x for x in risultati if x["riga"] in ins]
        if not sel:
            continue
        report["per_classe"][classe] = {
            metrica: {
                "tutto": round(float(np.median([x["tutto"][metrica] for x in sel])), 3),
                "contenuto": round(float(np.median([x["contenuto"][metrica] for x in sel])), 3),
            }
            for metrica in ("@10", "@50", "@100")
        }

    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("righe_valutate", "tutte_le_fonti", "solo_contenuto")}, indent=2))
    print(f"\nscritto {out} · {report['secondi']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
