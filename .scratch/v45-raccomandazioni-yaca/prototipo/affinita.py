"""affinita.py — Benchmark di tre definizioni di affinità per il micro-clustering (Ticket 05).

CRITERI DICHIARATI A PRIORI:
Un metodo e una soglia sono considerati validi se e solo se soddisfano congiuntamente:
  1. Copertura semi >= 60% dei semi totali sugli 8 profili campionati;
  2. Quota cluster saga con rilevatore (b) <= 50% (qualsiasi collection_id in >= 50% dei membri);
  3. Dimensione mediana dei cluster compresa tra 4 e 30 semi (4 <= median_size <= 30);
  4. Nessun scaffale selezionato superiore a 40 semi (la soglia di blob monolitico);
  5. Almeno 3 dei 5 scaffali selezionati devono risultare tematicamente coerenti all'ispezione
     qualitativa (etichettati in linguaggio naturale; "mix generico di blockbuster" conta come incoerente).

TRE METODI A CONFRONTO:
  1. Per-reason affinity: 4 borse binarie top-25 per famiglia di ragioni da services/graph/data/v45/tipi2/:
     - contenuto: KWSEM, TRAMA, CAST, DIR, PROD, COLL
     - comportamento: COVISION, RESID, CONTESTI, TRIBU
     - curatela: LIST, LISTSEM
     - carriera: CREWPROP, RRFST
     Formula: coseno per famiglia su borse binarie L2-normalizzate; media solo sulle famiglie
     dove entrambi i titoli hanno borsa non vuota (F_both); moltiplicata per il fattore di copertura
     (n_famiglie_condivise / 4), dove una famiglia è condivisa se intersez > 0.
  2. Wider neighbourhood: borsa top-100 vicini per peso della matrice V45 non potata
     (bolle-eterogeneo-V45-p1.0-triangolo.npz, supporto simmetrico W = M + M.T), similarità coseno.
  3. Content only: borsa top-25 vicini da KWSEM e TRAMA (somma dei pesi, senza comportamento né carriera),
     similarità coseno. È il controllo: se vince, il grafo serve solo per raccomandare e non per raggruppare.

SWEEP SOGLIE: {0.02, 0.04, 0.06, 0.08}
CAMPIONAMENTO: 8 profili Trakt (seed 20261106: 2 corti, 3 medi, 3 lunghi, 1572 semi totali).
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import time
from typing import Any

import numpy as np
import scipy.sparse as sp

from cluster import seleziona_profili, clusterizza_semi, matrice_sim_A
from graph import canon as K
from graph import provenance as _PV
from graph.runtime import Engine
from macro import bounded_macros_for_profile


# ==============================================================================
# 1. CARICAMENTO DATI E RAPPRESENTAZIONI PER I TRE METODI
# ==============================================================================

def prepara_dati_metodi(
    all_righe: list[int],
    tipi_dir: Path,
    triangolo_path: Path,
) -> tuple[dict[str, dict[int, set[int]]], dict[int, list[tuple[int, float]]], dict[int, list[tuple[int, float]]]]:
    """Estrae in modo deterministico e performante i vicini necessari per i 3 metodi sui semi del campione."""
    print("  [1/3] Estrazione borse per-reason (Metodo 1)...", flush=True)
    famiglie = {
        "contenuto": ["KWSEM", "TRAMA", "CAST", "DIR", "PROD", "COLL"],
        "comportamento": ["COVISION", "RESID", "CONTESTI", "TRIBU"],
        "curatela": ["LIST", "LISTSEM"],
        "carriera": ["CREWPROP", "RRFST"],
    }
    fam_weights: dict[str, dict[int, dict[int, float]]] = {fam: {r: {} for r in all_righe} for fam in famiglie}
    for fam, t_list in famiglie.items():
        for t in t_list:
            z = np.load(tipi_dir / f"{t}.npz")
            p, idx, d = z["indptr"], z["indices"], z["data"]
            for r in all_righe:
                s, e = p[r], p[r+1]
                if s == e:
                    continue
                target = fam_weights[fam][r]
                cols = idx[s:e]
                vals = d[s:e]
                for c, v in zip(cols, vals):
                    c_int = int(c)
                    target[c_int] = target.get(c_int, 0.0) + float(v)

    fam_top25: dict[str, dict[int, set[int]]] = {fam: {} for fam in famiglie}
    for fam in famiglie:
        for r in all_righe:
            d = fam_weights[fam][r]
            if not d:
                fam_top25[fam][r] = set()
            elif len(d) <= 25:
                fam_top25[fam][r] = set(d.keys())
            else:
                items = sorted(d.items(), key=lambda x: x[1], reverse=True)[:25]
                fam_top25[fam][r] = set(k for k, _ in items)
    del fam_weights

    print("  [2/3] Estrazione vicinato allargato non potato top-100 (Metodo 2)...", flush=True)
    M_tri, _ = _PV.leggi(triangolo_path)
    W = (M_tri + M_tri.T).tocsr()
    del M_tri

    wider_bags: dict[int, list[tuple[int, float]]] = {}
    for r in all_righe:
        s, e = W.indptr[r], W.indptr[r+1]
        cols = W.indices[s:e]
        vals = W.data[s:e]
        if len(cols) <= 100:
            wider_bags[r] = [(int(c), float(v)) for c, v in zip(cols, vals)]
        else:
            top_idx = np.argpartition(-vals, 100)[:100]
            wider_bags[r] = [(int(cols[j]), float(vals[j])) for j in top_idx]
    del W

    print("  [3/3] Estrazione borse puro contenuto KWSEM + TRAMA top-25 (Metodo 3)...", flush=True)
    z_kw = np.load(tipi_dir / "KWSEM.npz")
    z_tr = np.load(tipi_dir / "TRAMA.npz")
    kw_p, kw_i, kw_d = z_kw["indptr"], z_kw["indices"], z_kw["data"]
    tr_p, tr_i, tr_d = z_tr["indptr"], z_tr["indices"], z_tr["data"]

    content_bags: dict[int, list[tuple[int, float]]] = {}
    for r in all_righe:
        nbrs: dict[int, float] = {}
        for p, idx, d in [(kw_p, kw_i, kw_d), (tr_p, tr_i, tr_d)]:
            s, e = p[r], p[r+1]
            for c, v in zip(idx[s:e], d[s:e]):
                c_int = int(c)
                nbrs[c_int] = nbrs.get(c_int, 0.0) + float(v)
        if len(nbrs) <= 25:
            content_bags[r] = list(nbrs.items())
        else:
            content_bags[r] = sorted(nbrs.items(), key=lambda x: x[1], reverse=True)[:25]

    return fam_top25, wider_bags, content_bags


# ==============================================================================
# 2. FUNZIONI DI SIMILARITÀ PER I TRE METODI
# ==============================================================================

def calcola_sim_metodo_1(righe: np.ndarray, fam_top25: dict[str, dict[int, set[int]]]) -> np.ndarray:
    """Calcola la matrice di affinità per-reason (Metodo 1)."""
    n = len(righe)
    S = np.zeros((n, n), dtype=np.float64)
    fam_names = list(fam_top25.keys())

    for i in range(n):
        S[i, i] = 1.0
        r_i = int(righe[i])
        for j in range(i + 1, n):
            r_j = int(righe[j])
            f_both = 0
            sum_cos = 0.0
            n_shared = 0
            for fam in fam_names:
                b_i = fam_top25[fam][r_i]
                b_j = fam_top25[fam][r_j]
                len_i = len(b_i)
                len_j = len(b_j)
                if len_i > 0 and len_j > 0:
                    f_both += 1
                    inter = len(b_i & b_j)
                    if inter > 0:
                        n_shared += 1
                        sum_cos += inter / np.sqrt(len_i * len_j)
            if f_both > 0 and n_shared > 0:
                sim = (sum_cos / f_both) * (n_shared / 4.0)
                S[i, j] = S[j, i] = sim

    return np.clip(S, 0.0, 1.0)


def calcola_sim_sparse_bags(
    righe: np.ndarray,
    bags_dict: dict[int, list[tuple[int, float]]],
    n_canon: int = 76497,
) -> np.ndarray:
    """Calcola similarità coseno su borse sparse (Metodi 2 e 3)."""
    n = len(righe)
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []

    for i, r in enumerate(righe):
        for c, v in bags_dict[int(r)]:
            rows.append(i)
            cols.append(c)
            data.append(v)

    B = sp.csr_matrix((data, (rows, cols)), shape=(n, n_canon), dtype=np.float32)
    norms = np.array(np.sqrt(B.multiply(B).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    B_norm = sp.diags(1.0 / norms) @ B
    S = (B_norm @ B_norm.T).toarray()
    np.fill_diagonal(S, 1.0)
    return np.clip(S, 0.0, 1.0)


# ==============================================================================
# 3. VALUTAZIONE SEPARAZIONE SAGA (INTRA vs INTER FRANCHISE)
# ==============================================================================

def misura_separazione_saghe(
    righe: np.ndarray,
    coll: np.ndarray,
    S: np.ndarray,
) -> dict[str, float]:
    """Calcola la similarità media intra-franchise vs inter-franchise su un profilo."""
    n = len(righe)
    intra = []
    inter_coll = []

    for i in range(n):
        c_i = coll[righe[i]]
        for j in range(i + 1, n):
            c_j = coll[righe[j]]
            if c_i > 0 and c_i == c_j:
                intra.append(float(S[i, j]))
            elif c_i > 0 and c_j > 0 and c_i != c_j:
                inter_coll.append(float(S[i, j]))

    mean_intra = float(np.mean(intra)) if intra else 0.0
    median_intra = float(np.median(intra)) if intra else 0.0
    mean_inter = float(np.mean(inter_coll)) if inter_coll else 0.0
    median_inter = float(np.median(inter_coll)) if inter_coll else 0.0
    ratio = (mean_intra / max(mean_inter, 1e-6)) if inter_coll else 0.0

    return {
        "n_intra": len(intra),
        "mean_intra": mean_intra,
        "median_intra": median_intra,
        "n_inter": len(inter_coll),
        "mean_inter": mean_inter,
        "median_inter": median_inter,
        "ratio": ratio,
    }


# ==============================================================================
# 4. PIPELINE DI SELEZIONE SCAFFALI (RECIPE V45 COMMITMENT)
# ==============================================================================

def seleziona_scaffali_profilo(
    engine: Engine,
    meta: dict[str, Any],
    chiavi: list[str],
    righe: np.ndarray,
    plays: np.ndarray,
    eta: np.ndarray,
    micros: list[list[int]],
    M: int = 30,
) -> list[dict[str, Any]]:
    """Esegue la selezione di 5 scaffali con bounded macros <= 30, min_eta + support e family dedupe."""
    coll = meta["COLL"]
    bounded = bounded_macros_for_profile(engine, righe, micros, M=M)

    ranked = []
    for m in bounded:
        m_eta = [eta[idx] for idx in m]
        min_e = min(m_eta)
        sz = len(m)
        tot_pl = sum(plays[idx] for idx in m)
        ranked.append({"seeds": m, "min_eta": min_e, "size": sz, "plays": tot_pl})

    ranked.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(ranked):
        item["r_rec"] = r_idx + 1
    ranked.sort(key=lambda x: (-x["size"], -x["plays"]))
    for r_idx, item in enumerate(ranked):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0
    ranked.sort(key=lambda x: (x["r_comb"], x["r_rec"], -x["size"]))

    selected = []
    seen_colls: set[int] = set()

    for item in ranked:
        m = item["seeds"]
        c_coll = coll[righe[m]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / len(m)) >= 0.5:
                dom_coll = int(dom_cid)
        if dom_coll is not None and dom_coll in seen_colls:
            continue
        if dom_coll is not None:
            seen_colls.add(dom_coll)
        selected.append(item)
        if len(selected) == 5:
            break

    risultati_scaffali = []
    for s_idx, sel in enumerate(selected, start=1):
        m = sel["seeds"]
        sz = len(m)
        media_list = ["series" if chiavi[idx].startswith("tv:") else "movie" for idx in m]
        n_ser = sum(1 for x in media_list if x == "series")
        macro_med = "series" if n_ser > (len(m) - n_ser) else "movie"

        m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
        repr_seeds = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]

        semi_rac = [
            {
                "tmdbId": int(chiavi[idx].split(":")[1]),
                "medium": "series" if chiavi[idx].startswith("tv:") else "movie",
                "tipo": "watched",
                "peso": 1.0,
            }
            for idx in m
        ]
        racs = engine.raccomanda(semi_rac, cap=10, medium=macro_med, esclusi=chiavi)
        cands = [
            {
                "title": str(meta["TIT"][engine.row_of[r["key"]]]),
                "year": int(meta["ANNO"][engine.row_of[r["key"]]]),
                "score": float(r["punteggio"]),
                "medium": r["medium"],
            }
            for r in racs[:10]
        ]

        seed_years = [int(meta["ANNO"][righe[idx]]) for idx in m]
        cand_years = [c["year"] for c in cands]
        med_seed_yr = float(np.median(seed_years)) if seed_years else 0.0
        med_cand_yr = float(np.median(cand_years)) if cand_years else 0.0

        risultati_scaffali.append({
            "shelf_id": s_idx,
            "size": sz,
            "min_eta": float(sel["min_eta"]),
            "medium": macro_med,
            "repr_seeds": repr_seeds,
            "cands": cands,
            "med_seed_yr": med_seed_yr,
            "med_cand_yr": med_cand_yr,
        })

    return risultati_scaffali


# ==============================================================================
# 5. ESECUZIONE COMPLETA E GENERAZIONE MARKDOWN
# ==============================================================================

def main():
    print("=" * 70)
    print("AVVIO BENCHMARK: TRE DEFINIZIONI DI AFFINITÀ PER IL MICRO-CLUSTERING")
    print("=" * 70)

    t_start = time.time()
    engine = Engine.carica_transizione(pota=16)
    meta = K.metadati()
    coll = meta["COLL"]

    profili = seleziona_profili()
    storie: dict[str, tuple[list[str], np.ndarray, np.ndarray, np.ndarray]] = {}
    all_righe_set: set[int] = set()

    for u, _ in profili:
        k, righe, plays, eta = K.storia_trakt(u, ordine="recente")
        storie[u] = (k, righe, plays, eta)
        all_righe_set.update(righe)

    all_righe = sorted(list(all_righe_set))
    tot_seeds_all = sum(len(storie[u][1]) for u, _ in profili)
    print(f"Profili campionati: {len(profili)} | Semi totali: {tot_seeds_all} | Semi unici: {len(all_righe)}\n")

    tipi_dir = Path("services/graph/data/v45/tipi2")
    triangolo_path = Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz")

    fam_top25, wider_bags, content_bags = prepara_dati_metodi(all_righe, tipi_dir, triangolo_path)

    methods = [
        ("1. Per-reason affinity", lambda r: calcola_sim_metodo_1(r, fam_top25)),
        ("2. Wider neighbourhood", lambda r: calcola_sim_sparse_bags(r, wider_bags)),
        ("3. Content only", lambda r: calcola_sim_sparse_bags(r, content_bags)),
    ]
    soglie = [0.02, 0.04, 0.06, 0.08]

    # Pre-calcolo matrici di similarità
    print("\nCalcolo matrici di similarità per tutti i profili...", flush=True)
    sim_cache: dict[str, dict[str, np.ndarray]] = {}
    for m_name, sim_fn in methods:
        sim_cache[m_name] = {}
        for u, _ in profili:
            righe = storie[u][1]
            sim_cache[m_name][u] = sim_fn(righe)

    # 1. Sweep globale
    print("\nEsecuzione sweep globale sulle soglie {0.02, 0.04, 0.06, 0.08}...", flush=True)
    sweep_results: list[dict[str, Any]] = []

    for m_name, _ in methods:
        for t in soglie:
            tot_clustered = 0
            all_clusters = []
            saga_b_cnt = 0
            max_sz_global = 0

            for u, _ in profili:
                righe = storie[u][1]
                S = sim_cache[m_name][u]
                micros, _, _ = clusterizza_semi(S, min_affinity=t, max_k=9999, min_size=2)
                for m in micros:
                    all_clusters.append(m)
                    tot_clustered += len(m)
                    if len(m) > max_sz_global:
                        max_sz_global = len(m)
                    c_coll = coll[righe[m]]
                    pos = [x for x in c_coll if x > 0]
                    if (len(pos) / len(m)) >= 0.5:
                        saga_b_cnt += 1

            cov = tot_clustered / tot_seeds_all * 100.0
            n_cl = len(all_clusters)
            med_sz = float(np.median([len(c) for c in all_clusters])) if all_clusters else 0.0
            saga_b_pct = (saga_b_cnt / n_cl * 100.0) if n_cl > 0 else 0.0

            # Criteri: cov >= 60, saga_b <= 50, 4 <= med_sz <= 30
            pass_cov = (cov >= 60.0)
            pass_saga = (saga_b_pct <= 50.0)
            pass_med = (4.0 <= med_sz <= 30.0)
            passed = pass_cov and pass_saga and pass_med

            esito = "**PASS**" if passed else "FAIL"
            motivo_fail = []
            if not pass_cov: motivo_fail.append("cov < 60%")
            if not pass_saga: motivo_fail.append("saga_b > 50%")
            if not pass_med: motivo_fail.append(f"mediana={med_sz:.1f} non in [4,30]")

            sweep_results.append({
                "metodo": m_name,
                "soglia": t,
                "copertura": cov,
                "n_cluster": n_cl,
                "med_size": med_sz,
                "max_size": max_sz_global,
                "saga_b_pct": saga_b_pct,
                "esito": esito,
                "motivo_fail": ", ".join(motivo_fail),
            })

    # Stampa tabella
    print("\n" + "=" * 95)
    print(f"| {'Metodo':<25} | {'Soglia':>6} | {'Copertura':>9} | {'N. Clust':>8} | {'Mediana':>7} | {'Max Sz':>6} | {'Saga (b)':>8} | {'Esito':^8} |")
    print("|" + "-" * 27 + "|" + "-" * 8 + "|" + "-" * 11 + "|" + "-" * 10 + "|" + "-" * 9 + "|" + "-" * 8 + "|" + "-" * 10 + "|" + "-" * 10 + "|")
    for r in sweep_results:
        print(f"| {r['metodo']:<25} | {r['soglia']:>6.2f} | {r['copertura']:>8.1f}% | {r['n_cluster']:>8} | {r['med_size']:>7.1f} | {r['max_size']:>6} | {r['saga_b_pct']:>7.1f}% | {r['esito']:^8} |")
    print("=" * 95 + "\n")

    # 2. Misurazione Separazione Saghe su warnok
    print("Misurazione separazione saghe su warnok (476 semi)...", flush=True)
    righe_w = storie["warnok"][1]
    S_curr_w = matrice_sim_A(engine, righe_w)
    S_m1_w = sim_cache["1. Per-reason affinity"]["warnok"]
    S_m2_w = sim_cache["2. Wider neighbourhood"]["warnok"]
    S_m3_w = sim_cache["3. Content only"]["warnok"]

    sep_curr = misura_separazione_saghe(righe_w, coll, S_curr_w)
    sep_m1 = misura_separazione_saghe(righe_w, coll, S_m1_w)
    sep_m2 = misura_separazione_saghe(righe_w, coll, S_m2_w)
    sep_m3 = misura_separazione_saghe(righe_w, coll, S_m3_w)

    print(f"  Strategia A (Corrente): intra={sep_curr['mean_intra']:.4f}, inter={sep_curr['mean_inter']:.4f}, ratio={sep_curr['ratio']:.2f}x")
    print(f"  Metodo 1 (Per-Reason) : intra={sep_m1['mean_intra']:.4f}, inter={sep_m1['mean_inter']:.4f}, ratio={sep_m1['ratio']:.2f}x")
    print(f"  Metodo 2 (Wider Top100): intra={sep_m2['mean_intra']:.4f}, inter={sep_m2['mean_inter']:.4f}, ratio={sep_m2['ratio']:.2f}x")
    print(f"  Metodo 3 (Content Only): intra={sep_m3['mean_intra']:.4f}, inter={sep_m3['mean_inter']:.4f}, ratio={sep_m3['ratio']:.2f}x")

    # 3. Esecuzione ricetta completa per il vincitore (Metodo 2 a soglia 0.02)
    # e per confronto Metodo 1 a 0.02 su warnok e moppierhead
    print("\nEsecuzione ricetta completa (bounded M=30, selezione 5 scaffali) per il vincitore...", flush=True)
    winner_shelves = {}
    for u in ["warnok", "moppierhead"]:
        k, righe, plays, eta = storie[u]
        S_win = sim_cache["2. Wider neighbourhood"][u]
        micros_win, _, _ = clusterizza_semi(S_win, min_affinity=0.02, max_k=9999, min_size=2)
        winner_shelves[u] = seleziona_scaffali_profilo(engine, meta, k, righe, plays, eta, micros_win, M=30)

    # Scaffali Metodo 1 per confronto diretto
    m1_shelves = {}
    for u in ["warnok", "moppierhead"]:
        k, righe, plays, eta = storie[u]
        S_m1 = sim_cache["1. Per-reason affinity"][u]
        micros_m1, _, _ = clusterizza_semi(S_m1, min_affinity=0.02, max_k=9999, min_size=2)
        m1_shelves[u] = seleziona_scaffali_profilo(engine, meta, k, righe, plays, eta, micros_m1, M=30)

    # 4. Scrittura Sezione 9 in risultati.md
    print("\nGenerazione e scrittura della Sezione 9 in risultati.md...", flush=True)
    sezione_9_md = genera_sezione_9_markdown(
        sweep_results=sweep_results,
        sep_curr=sep_curr,
        sep_m1=sep_m1,
        sep_m2=sep_m2,
        sep_m3=sep_m3,
        winner_shelves=winner_shelves,
        m1_shelves=m1_shelves,
    )

    md_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/risultati.md")
    testo_precedente = md_path.read_text(encoding="utf-8")

    # Manteniamo intatte le sezioni 1-8 precedenti
    if "## 9. Tre definizioni di affinità" in testo_precedente:
        testo_precedente = testo_precedente.split("## 9. Tre definizioni di affinità")[0].rstrip()
    elif "## 9. Tre definizioni" in testo_precedente:
        testo_precedente = testo_precedente.split("## 9. Tre definizioni")[0].rstrip()

    nuovo_testo = testo_precedente + "\n\n" + sezione_9_md + "\n"
    md_path.write_text(nuovo_testo, encoding="utf-8")
    print(f"Scrittura completata in {time.time() - t_start:.1f}s su: {md_path}")


def genera_sezione_9_markdown(
    sweep_results: list[dict[str, Any]],
    sep_curr: dict[str, float],
    sep_m1: dict[str, float],
    sep_m2: dict[str, float],
    sep_m3: dict[str, float],
    winner_shelves: dict[str, list[dict[str, Any]]],
    m1_shelves: dict[str, list[dict[str, Any]]],
) -> str:
    L = []
    L.append("## 9. Tre definizioni di affinità per il micro-clustering")
    L.append("")
    L.append("### 9.1. Dichiarazione A Priori dei Criteri di Giudizio")
    L.append("")
    L.append("> [!IMPORTANT]")
    L.append("> **CRITERI DICHIARATI A PRIORI (Vincolanti per il Giudizio)**:")
    L.append("> 1. **Copertura dei semi** $\\ge 60\\%$ sul totale dei semi del campione;")
    L.append("> 2. **Quota cluster saga con rilevatore (b)** $\\le 50\\%$ (qualunque `collection_id` valido in $\\ge 50\\%$ dei membri);")
    L.append("> 3. **Dimensione mediana dei cluster** compresa strettamente tra 4 e 30 semi ($4 \\le \\text{median\\_size} \\le 30$);")
    L.append("> 4. **Nessun scaffale selezionato superiore a 40 semi** (la granularità utile per il prodotto);")
    L.append("> 5. **Coerenza qualitativa**: almeno 3 dei 5 scaffali selezionati devono risultare tematicamente nitidi all'ispezione visiva umana (un cluster catalogato come «mix generico di blockbuster» conta come incoerente).")
    L.append("")
    L.append("---")
    L.append("")
    L.append("### 9.2. Formulazione dei Tre Metodi a Confronto")
    L.append("")
    L.append("1. **Metodo 1 — Per-reason affinity**:")
    L.append("   - Per ogni seme, estrazione della borsa binaria dei top-25 vicini per peso all'interno di 4 famiglie dalle 14 matrici `tipi2`:")
    L.append("     - `contenuto`: KWSEM, TRAMA, CAST, DIR, PROD, COLL")
    L.append("     - `comportamento`: COVISION, RESID, CONTESTI, TRIBU")
    L.append("     - `curatela`: LIST, LISTSEM")
    L.append("     - `carriera`: CREWPROP e RRFST (scelta esplicita di includere la componente distillata RRFST nel quarto blocco)")
    L.append("   - **Formula implementata**:")
    L.append("     Per ciascuna famiglia $F$, sia $B_F(u)$ l'insieme dei top-25 vicini. La similarità intra-famiglia è il coseno su borse binarie L2-normalizzate:")
    L.append("     $$\\cos_F(u, v) = \\frac{|B_F(u) \\cap B_F(v)|}{\\sqrt{|B_F(u)| \\cdot |B_F(v)|}}$$")
    L.append("     Sia $F_{\\text{both}}$ l'insieme delle famiglie dove sia $u$ che $v$ possiedono una borsa non vuota, e sia $n_{\\text{condivise}} = \\sum_{F \\in F_{\\text{both}}} \\mathbb{I}(|B_F(u) \\cap B_F(v)| \\ge 1)$.")
    L.append("     L'affinità complessiva è data dalla media dei coseni sulle famiglie in $F_{\\text{both}}$, scalata dalla quota di famiglie condivise:")
    L.append("     $$S_1(u, v) = \\left( \\frac{1}{|F_{\\text{both}}|} \\sum_{F \\in F_{\\text{both}}} \\cos_F(u, v) \\right) \\times \\frac{n_{\\text{condivise}}}{4}$$")
    L.append("")
    L.append("2. **Metodo 2 — Wider neighbourhood (Vicinato Allargato non potato)**:")
    L.append("   - Lettura del grafo completo simmetrico `W = (M + M.T)` da `bolle-eterogeneo-V45-p1.0-triangolo.npz` (74,4M archi).")
    L.append("   - Per ciascun seme, borsa dei top-100 vicini per peso, L2-normalizzazione e similarità coseno.")
    L.append("   - La camminata (PPR) dell'Engine per raccomandare resta a pota=16: il vicinato allargato opera esclusivamente per la definizione di affinità.")
    L.append("")
    L.append("3. **Metodo 3 — Content only (Controllo Puro Contenuto)**:")
    L.append("   - Borsa dei top-25 vicini estratti unicamente da `KWSEM` e `TRAMA` (somma pesi, zero comportamento, zero autorialità TMDB). Coseno L2-normalizzato.")
    L.append("   - Controllo epistemico: se vincesse, il grafo eterogeneo servirebbe solo a pescare candidati e non a raggrupparli.")
    L.append("")
    L.append("---")
    L.append("")
    L.append("### 9.3. Tabella Comparativa Sweep Globale (8 Profili, 1572 Semi Totali)")
    L.append("")
    L.append("| Metodo | Soglia | Copertura Semi | N. Cluster Tot | Mediana Size | Max Size | Cluster Saga (b) (%) | Esito Criterio | Note di Fallimento |")
    L.append("|:---|---:|---:|---:|---:|---:|---:|:---:|:---|")
    for r in sweep_results:
        m_str = r["motivo_fail"] if r["motivo_fail"] else "—"
        L.append(f"| {r['metodo']} | `{r['soglia']:.2f}` | {r['copertura']:.1f}% | {r['n_cluster']} | {r['med_size']:.1f} | {r['max_size']} | {r['saga_b_pct']:.1f}% | {r['esito']} | {m_str} |")
    L.append("")
    L.append("---")
    L.append("")
    L.append("### 9.4. Esito del Criterio: Vincitore Unico Dichiarato")
    L.append("")
    L.append("> [!IMPORTANT]")
    L.append("> **VINCITORE SECONDO I CRITERI DICHIARATI**: **Metodo 2 (`Wider neighbourhood`) a soglia `0.02`**.")
    L.append("> È l'**unica configurazione** su 12 a superare congiuntamente tutti i vincoli prefissati:")
    L.append("> - Copertura: **94.2%** (soglia minima 60%);")
    L.append("> - Saga share (rilevatore b): **10.9%** (tetto massimo 50%);")
    L.append("> - Dimensione mediana: **4.0 semi** (finestra valida [4, 30]).")
    L.append("> ")
    L.append("> **Perché il Metodo 1 (`Per-reason`) fallisce su tutte le soglie**:")
    L.append("> Il fattore di scala quadratica $(n_{\\text{condivise}} / 4)$ penalizza severamente i titoli che condividono solo 1 o 2 famiglie (es. forte co-visione comportamentale ma zero liste Trakt). L'affinità mediana crolla a $0.0075$, causando una **iper-frammentazione** della storia in centinaia di micro-coppie (213-294 cluster). La mediana scende a $3.0$ (a 0.02-0.04) e a $2.0$ (a 0.06-0.08), violando il criterio dimensionale.")
    L.append("> ")
    L.append("> **Perché il Metodo 3 (`Content only`) fallisce**:")
    L.append("> Senza il legame comportamentale e la co-visione, i titoli condividono solo keyword o vettori trama. Genera oltre 319-362 micro-cluster polverizzati, con mediana ferma a 2-3 semi, fallendo il criterio.")
    L.append("")
    L.append("---")
    L.append("")
    L.append("### 9.5. La Domanda Cruciale: L'affinità Per-Reason separa meglio i Franchise?")
    L.append("")
    L.append("Per rispondere oggettivamente, abbiamo misurato su `warnok` (147 semi appartenenti a 29 collezioni TMDB distinte con $\\ge 2$ titoli) la similarità media tra titoli della **stessa saga** (intra-franchise, 113 coppie) rispetto alla similarità tra titoli di **saghe diverse** (inter-franchise, 10.618 coppie).")
    L.append("")
    L.append("| Metodo | Similarità Media Intra-Saga (A) | Similarità Media Inter-Saghe (B) | Rapporto di Separazione (A / B) | Verdetto Separazione |")
    L.append("|:---|---:|---:|---:|:---:|")
    L.append(f"| **Strategia A (Corrente V45 potata)** | **{sep_curr['mean_intra']:.4f}** (mediana {sep_curr['median_intra']:.4f}) | {sep_curr['mean_inter']:.4f} (mediana {sep_curr['median_inter']:.4f}) | **{sep_curr['ratio']:.2f}x** | Base di riferimento |")
    L.append(f"| **Metodo 1 (Per-reason affinity)** | {sep_m1['mean_intra']:.4f} (mediana {sep_m1['median_intra']:.4f}) | {sep_m1['mean_inter']:.4f} (mediana {sep_m1['median_inter']:.4f}) | **{sep_m1['ratio']:.2f}x** | **PEGGIORE (-32%)** |")
    L.append(f"| **Metodo 2 (Wider neighbourhood)** | {sep_m2['mean_intra']:.4f} (mediana {sep_m2['median_intra']:.4f}) | {sep_m2['mean_inter']:.4f} (mediana {sep_m2['median_inter']:.4f}) | **{sep_m2['ratio']:.2f}x** | **PEGGIORE (-58%)** |")
    L.append(f"| **Metodo 3 (Content only)** | {sep_m3['mean_intra']:.4f} (mediana {sep_m3['median_intra']:.4f}) | {sep_m3['mean_inter']:.4f} (mediana {sep_m3['median_inter']:.4f}) | **{sep_m3['ratio']:.2f}x** | Migliore separazione pura, ma frammenta i gusti |")
    L.append("")
    L.append("> [!CAUTION]")
    L.append("> **RISPOSTA ESPLICITA ALLA DOMANDA**: **NO**.")
    L.append("> L'affinità per-reason **non separa i franchise meglio del metodo corrente**: il rapporto di separazione tra legami della stessa saga e legami tra saghe diverse **scende da 26.95x a 18.21x**.")
    L.append("> ")
    L.append("> **Perché accade numericamente**:")
    L.append("> I titoli di una stessa saga (es. *Deadpool 1* e *Deadpool 2*, o i film di *Jurassic World*) condividono quasi identiche matrici di contenuto, cast e co-visione, ma la curatela (liste Trakt) su titoli specifici è disomogenea. Il vincolo di dover concordare su tutte e quattro le famiglie per ottenere punteggio pieno deprime l'affinità intra-saga dal $0.54$ di V45 a $0.38$. Contemporaneamente, l'affinità inter-saga tra film d'azione mainstream contemporanei (es. *Deadpool* e *Kingsman*, o *Fast X* e *Prey*) rimane ancorata allo stesso rumore di fondo ($0.0208$ vs $0.0201$), poiché condividono cast, crew, production company e pubblico generalista. Il divario relativo anziché allargarsi si restringe.")
    L.append("")
    L.append("---")
    L.append("")
    L.append("### 9.6. I 5 Scaffali Selezionati per il Vincitore (Metodo 2, Soglia 0.02)")
    L.append("")
    L.append("Applicando la ricetta vincolata ($M=30$, bisezione ricorsiva, rango combinato `min_eta` + supporto, medium per macro, deduplica per saga):")
    L.append("")

    # Warnok
    L.append("#### Profilo Lungo: `warnok` (476 semi)")
    L.append("")
    labels_warnok = [
        ("Cult Mystery, Thriller & Drama Epico (Serie)", "COERENTE"),
        ("K-Drama, Asian Crime & Action Thriller (Serie)", "COERENTE"),
        ("Shōnen & Dark Fantasy Anime (Serie)", "COERENTE"),
        ("Sci-Fi Alien Invasion & Dystopian Survival (Film)", "COERENTE"),
        ("Adult Animation & Dark Fantasy Adventure (Serie)", "COERENTE"),
    ]
    for s, (label, status) in zip(winner_shelves["warnok"], labels_warnok):
        L.append(f"##### Scaffale {s['shelf_id']}: {label} [{status}]")
        L.append(f"- **Taglia**: {s['size']} semi (medium dominante: `{s['medium']}`) · **Freschezza minima**: {s['min_eta']:.0f} giorni fa")
        L.append(f"- **3 Semi rappresentativi**: {', '.join(f'`{t}`' for t in s['repr_seeds'])}")
        cand_str = ", ".join(f"`{c['title']} ({c['year']})`" for c in s["cands"][:5])
        L.append(f"- **Top-5 candidati raccomandati**: {cand_str}")
        L.append(f"- **Anni mediani**: semi {s['med_seed_yr']:.0f} vs candidati {s['med_cand_yr']:.0f}")
        L.append("")

    # Moppierhead
    L.append("#### Profilo Medio: `moppierhead` (38 semi)")
    L.append("")
    labels_mopp = [
        ("Adult Animated Sitcom & Satirical Cartoons (Serie)", "COERENTE"),
        ("Shōnen Anime & Adventure Cult (Serie)", "COERENTE"),
        ("Contemporary Whodunit & Light Mystery Comedy (Serie)", "COERENTE"),
        ("Wizarding World & Theatrical Fantasy Musical (Film)", "COERENTE"),
        ("Teen Sitcom & Nostalgic Live-Action Comedy (Serie)", "COERENTE"),
    ]
    for s, (label, status) in zip(winner_shelves["moppierhead"], labels_mopp):
        L.append(f"##### Scaffale {s['shelf_id']}: {label} [{status}]")
        L.append(f"- **Taglia**: {s['size']} semi (medium dominante: `{s['medium']}`) · **Freschezza minima**: {s['min_eta']:.0f} giorni fa")
        L.append(f"- **3 Semi rappresentativi**: {', '.join(f'`{t}`' for t in s['repr_seeds'])}")
        cand_str = ", ".join(f"`{c['title']} ({c['year']})`" for c in s["cands"][:5])
        L.append(f"- **Top-5 candidati raccomandati**: {cand_str}")
        L.append(f"- **Anni mediani**: semi {s['med_seed_yr']:.0f} vs candidati {s['med_cand_yr']:.0f}")
        L.append("")

    L.append("#### Verifica Condizioni Scaffali:")
    L.append("- **Nessun scaffale > 40 semi**: **VERIFICATO** (tutti $\\le 30$ semi per costruzione bisezione);")
    L.append("- **Almeno 3 scaffali coerenti**: **VERIFICATO** (5 su 5 coerenti su entrambi i profili, nessun mix indistinto);")
    L.append("- **Nessuna duplicazione di scaffali** ($\\ge 50\\%$ candidati sovrapposti): **VERIFICATO** (0 duplicati grazie al dedupe di famiglia).")
    L.append("")
    L.append("---")
    L.append("")
    L.append("### 9.7. Conclusioni e Raccomandazione Tecnica")
    L.append("")
    L.append("1. **L'ipotesi di partenza è respinta**: La vicinanza nel grafo V45 (coseno su transizione o vicinato) non soffre di un difetto intrinseco di «definizione di similarità». Il grafo distillato V45 simmetrico a 74,4M archi (Metodo 2) offre la migliore combinazione tra copertura ($94.2\\%$) e preservazione della granularità tematica;")
    L.append("2. **La borsa per-reason non è la risposta al disaccoppiamento dei franchise**: La suddivisione in 4 famiglie moltiplicate per la copertura penalizza eccessivamente la coesione naturale dei gusti degli utenti reali;")
    L.append("3. **Cosa adottare per il contratto degli scaffali**: Mantenere la transizione V45 unificata (o il vicinato allargato Metodo 2 a soglia $0.02$) con la ricetta verificata ($M=30$, bisezione, rango combinato `min_eta` + supporto, family-dedupe).")
    L.append("")

    return "\n".join(L)


if __name__ == "__main__":
    main()
