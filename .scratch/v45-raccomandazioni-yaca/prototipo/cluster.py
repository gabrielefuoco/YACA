"""cluster.py — Prototipo per cluster di interesse personali su storie Trakt reali (Ticket 05).

PERCHÉ ESISTE.
Con la rimozione della partizione globale in bolle del catalogo (V10), il motore ha bisogno di
individuare cluster personali di interesse all'interno della storia di ciascun profilo.
Questo prototipo confronta due strategie su 8 storie reali di utenti Trakt (campionamento stratificato
deterministico con seed fisso: 2 corte <20, 3 medie 20-80, 3 lunghe >80):
  - Strategia A ("affinità su grafo"): estrae le righe dei semi dalla transizione potata V45,
    calcola la similarità coseno a coppie sui vettori riga e raggruppa con clustering gerarchico (k in [2, 6]);
  - Strategia B ("vicinato condiviso"): per ogni seme estrae l'insieme dei vicini uscenti e raggruppa
    in base alla similarità di Jaccard tra i vicini (alternativa economica per capire se serve la diffusione).

Metriche calcolate:
  - Numero e cardinalità dei cluster;
  - 3 titoli seme rappresentativi per cluster;
  - Top-10 candidati da Engine.raccomanda ristretto ai soli semi del cluster (con filtro medium);
  - Distinctness: sovrapposizione media a coppie delle top-10 dei cluster (basso = liste disgiunte);
  - Coverage: quota di semi inclusi nei cluster (e conteggio semi non raggruppati);
  - Drift proxy: quota candidati con decade diversa dalla mediana del cluster, e quota serie.

Esecuzione:
  PYTHONPATH=services py .scratch/v45-raccomandazioni-yaca/prototipo/cluster.py
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import scipy.sparse as sp
from scipy.spatial.distance import squareform
from scipy.cluster.hierarchy import linkage, fcluster

from graph.runtime import Engine
from graph import canon as K

RNG_SEED = 20261106


def seleziona_profili(rng_seed: int = RNG_SEED) -> list[tuple[str, int]]:
    """Seleziona deterministicamente 8 profili Trakt stratificati per lunghezza storia."""
    rng = np.random.default_rng(rng_seed)
    utenti_dir = Path(".cache/trakt/users")
    all_users = sorted([p.name[6:-5] for p in utenti_dir.glob("movie-*.json")])
    perm = rng.permutation(all_users)

    short_users: list[tuple[str, int]] = []
    med_users: list[tuple[str, int]] = []
    long_users: list[tuple[str, int]] = []

    for u in perm:
        k, r, _, _ = K.storia_trakt(u, ordine="recente")
        L = len(k)
        if 5 <= L < 20 and len(short_users) < 2:
            short_users.append((str(u), L))
        elif 20 <= L <= 80 and len(med_users) < 3:
            med_users.append((str(u), L))
        elif L > 80 and len(long_users) < 3:
            long_users.append((str(u), L))

        if len(short_users) == 2 and len(med_users) == 3 and len(long_users) == 3:
            break

    return short_users + med_users + long_users


def matrice_sim_A(engine: Engine, righe: np.ndarray) -> np.ndarray:
    """Strategia A: Coseno a coppie sui vettori riga della transizione V45."""
    V = engine.Tr[righe, :]
    norms = np.array(np.sqrt(V.multiply(V).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    V_norm = sp.diags(1.0 / norms) @ V
    S = (V_norm @ V_norm.T).toarray()
    np.fill_diagonal(S, 1.0)
    return np.clip(S, 0.0, 1.0)


def matrice_sim_B(engine: Engine, righe: np.ndarray) -> np.ndarray:
    """Strategia B: Jaccard a coppie sugli insiemi di vicini uscenti."""
    nbrs = [set(engine.Tr.indices[engine.Tr.indptr[r]:engine.Tr.indptr[r+1]]) for r in righe]
    n = len(righe)
    S = np.zeros((n, n), dtype=np.float64)
    for i in range(n):
        S[i, i] = 1.0
        for j in range(i + 1, n):
            unione = len(nbrs[i] | nbrs[j])
            if unione > 0:
                jacc = len(nbrs[i] & nbrs[j]) / unione
                S[i, j] = S[j, i] = jacc
    return S


def clusterizza_semi(
    sim: np.ndarray,
    min_affinity: float = 0.06,
    max_k: int = 6,
    min_size: int = 2,
) -> tuple[list[list[int]], list[int]]:
    """Clustering gerarchico deterministico (Average Linkage) con soglia di affinità e k <= 6."""
    n = sim.shape[0]
    if n < 2:
        return [], list(range(n))

    # Identifica i semi con almeno una connessione significativa
    sim_off = sim - np.eye(n)
    max_sim = np.max(sim_off, axis=1)
    connected = [i for i in range(n) if max_sim[i] >= min_affinity]
    isolated = [i for i in range(n) if max_sim[i] < min_affinity]

    if len(connected) < 2:
        return [], list(range(n))

    sub_sim = sim[np.ix_(connected, connected)]
    d = np.clip(1.0 - sub_sim, 0.0, 1.0)
    np.fill_diagonal(d, 0)

    Z = linkage(squareform(d), method="average")
    raw_labels = fcluster(Z, t=1.0 - min_affinity, criterion="distance")

    label_to_members: dict[int, list[int]] = {}
    for local_idx, label in enumerate(raw_labels):
        global_idx = connected[local_idx]
        label_to_members.setdefault(label, []).append(global_idx)

    valid = [members for members in label_to_members.values() if len(members) >= min_size]
    singletons = [members[0] for members in label_to_members.values() if len(members) < min_size]

    valid.sort(key=len, reverse=True)
    if len(valid) > max_k:
        retained = valid[:max_k]
        for v in valid[max_k:]:
            isolated.extend(v)
    else:
        retained = valid

    unclustered = sorted(isolated + singletons)
    return retained, unclustered


def analizza_profilo(
    utente: str,
    engine: Engine,
    meta: dict[str, np.ndarray],
    strategia: str,
    min_affinity: float,
) -> dict[str, Any]:
    """Esegue clustering, raccomandazioni e metriche per un utente e una strategia."""
    chiavi, righe, plays, eta = K.storia_trakt(utente, ordine="recente")
    n_totale = len(chiavi)
    if n_totale == 0:
        return {}

    # Medium prevalente dell'utente
    n_series = sum(1 for r in righe if engine.is_tv[r])
    mostly_medium = "series" if n_series > (n_totale / 2) else "movie"

    # Similarità
    if strategia == "A":
        sim = matrice_sim_A(engine, righe)
    else:
        sim = matrice_sim_B(engine, righe)

    clusters_idx, unclustered_idx = clusterizza_semi(sim, min_affinity=min_affinity, max_k=6)
    k_clusters = len(clusters_idx)

    # Copertura
    n_in_cluster = sum(len(c) for c in clusters_idx)
    coverage = n_in_cluster / n_totale if n_totale > 0 else 0.0

    cluster_info = []
    top10_sets = []

    for c in clusters_idx:
        # Semi rappresentativi: calcola centralità interna (somma similarità verso altri membri)
        c_rows = righe[c]
        c_keys = [chiavi[i] for i in c]
        if len(c) > 2:
            sub = sim[np.ix_(c, c)]
            centrality = np.sum(sub, axis=1) - 1.0
            best_local_order = np.argsort(-centrality)
        else:
            best_local_order = list(range(len(c)))

        rep_keys = [c_keys[i] for i in best_local_order[:3]]
        rep_titles = [f"{meta['TIT'][c_rows[i]]} ({int(meta['ANNO'][c_rows[i]])})" for i in best_local_order[:3]]

        # Decade mediana dei semi del cluster
        decadi_semi = [(meta["ANNO"][r] // 10) * 10 for r in c_rows if meta["ANNO"][r] > 0]
        mediana_decade = float(np.median(decadi_semi)) if decadi_semi else 2000.0
        quota_film_semi = sum(1 for r in c_rows if not engine.is_tv[r]) / len(c)
        mostly_films_cluster = quota_film_semi >= 0.5

        # Raccomandazione ristretta ai soli semi del cluster
        semi_raccomanda = [{"key": k, "plays": float(plays[chiavi.index(k)])} for k in c_keys]
        # Esclude l'intera storia dell'utente per evitare raccomandazioni di titoli già visti
        racs = engine.raccomanda(semi_raccomanda, cap=10, medium=mostly_medium, esclusi=chiavi)

        top10_keys = [r["key"] for r in racs]
        top10_sets.append(set(top10_keys))

        # Drift proxy: quota candidati con decade diversa dalla mediana del cluster
        candidati_rows = [engine.row_of[r["key"]] for r in racs]
        candidati_decadi = [(meta["ANNO"][r] // 10) * 10 for r in candidati_rows if meta["ANNO"][r] > 0]
        if candidati_decadi:
            drift_decade = sum(1 for d in candidati_decadi if d != mediana_decade) / len(candidati_decadi)
        else:
            drift_decade = 0.0

        # Drift serie quando il cluster è prevalentemente film
        if mostly_films_cluster and racs:
            drift_serie = sum(1 for r in candidati_rows if engine.is_tv[r]) / len(racs)
        else:
            drift_serie = 0.0

        cluster_info.append({
            "size": len(c),
            "rep_titles": rep_titles,
            "rep_keys": rep_keys,
            "median_decade": int(mediana_decade),
            "top10": [
                {
                    "key": r["key"],
                    "title": str(meta["TIT"][engine.row_of[r["key"]]]),
                    "year": int(meta["ANNO"][engine.row_of[r["key"]]]),
                    "score": float(r["punteggio"]),
                }
                for r in racs
            ],
            "drift_decade": drift_decade,
            "drift_serie": drift_serie,
        })

    # Distinctness: sovrapposizione media a coppie dei top-10 (|A ∩ B| / 10.0)
    if k_clusters >= 2:
        overlaps = []
        for i in range(k_clusters):
            for j in range(i + 1, k_clusters):
                inter = len(top10_sets[i] & top10_sets[j])
                overlaps.append(inter / 10.0)
        distinctness = float(np.mean(overlaps))
    else:
        distinctness = 0.0

    # Medie drift
    mean_drift_decade = float(np.mean([ci["drift_decade"] for ci in cluster_info])) if cluster_info else 0.0
    mean_drift_serie = float(np.mean([ci["drift_serie"] for ci in cluster_info])) if cluster_info else 0.0

    return {
        "utente": utente,
        "n_semi": n_totale,
        "mostly_medium": mostly_medium,
        "strategia": strategia,
        "k_clusters": k_clusters,
        "sizes": [len(c) for c in clusters_idx],
        "coverage": coverage,
        "unclustered_count": len(unclustered_idx),
        "distinctness": distinctness,
        "mean_drift_decade": mean_drift_decade,
        "mean_drift_serie": mean_drift_serie,
        "cluster_info": cluster_info,
    }


def genera_markdown(risultati_A: list[dict], risultati_B: list[dict]) -> str:
    """Genera il report completo di benchmark e profili in Markdown."""
    lines = []
    lines.append("# Prototipo Cluster Personali di Interesse (Ticket 05)")
    lines.append("")
    lines.append("## 1. Obiettivo e Strategie a Confronto")
    lines.append("")
    lines.append("In sostituzione della partizione fissa globale in bolle (V10), questo prototipo "
                 "confronta due strategie per raggruppare i semi personali di ciascun profilo utente:")
    lines.append("- **Strategia A (Affinità su Grafo)**: similarità coseno sui vettori riga della transizione V45 potata (pota=16), seguita da clustering gerarchico deterministico con vincolo $k \\in [2, 6]$;")
    lines.append("- **Strategia B (Vicinato Condiviso)**: similarità di Jaccard tra gli insiemi di vicini uscenti top-16 (approccio leggero a costo zero di diffusione).")
    lines.append("")
    lines.append("Campione: 8 profili reali Trakt stratificati deterministicamente per lunghezza storia:")
    lines.append("- 2 corti (< 20 semi): `sangam456`, `hammers-lists`")
    lines.append("- 3 medi (20-80 semi): `sappss`, `moppierhead`, `flixinatoor99`")
    lines.append("- 3 lunghi (> 80 semi): `warnok`, `pepsipex`, `castoffcrown`")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 2. Tabella Comparativa Compatta (Tutti gli 8 Profili)")
    lines.append("")
    lines.append("| Utente | Semi | Medium | Strat. | Cluster (k) | Cardinalità | Copertura (%) | Non raggruppati | Distinctness (overlap top-10) | Drift Decade |")
    lines.append("|:-------|-----:|:-------|:------:|------------:|:------------|--------------:|----------------:|------------------------------:|-------------:|")

    for ra, rb in zip(risultati_A, risultati_B):
        u = ra["utente"]
        n = ra["n_semi"]
        med = ra["mostly_medium"]
        sizes_a = str(ra["sizes"])
        sizes_b = str(rb["sizes"])
        cov_a = f"{ra['coverage']*100:.1f}%"
        cov_b = f"{rb['coverage']*100:.1f}%"
        dist_a = f"{ra['distinctness']:.2f}"
        dist_b = f"{rb['distinctness']:.2f}"
        drift_a = f"{ra['mean_drift_decade']*100:.1f}%"
        drift_b = f"{rb['mean_drift_decade']*100:.1f}%"

        lines.append(f"| `{u}` | {n} | {med} | **A** | {ra['k_clusters']} | {sizes_a} | {cov_a} | {ra['unclustered_count']} | {dist_a} | {drift_a} |")
        lines.append(f"| `{u}` | {n} | {med} | **B** | {rb['k_clusters']} | {sizes_b} | {cov_b} | {rb['unclustered_count']} | {dist_b} | {drift_b} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 3. Dettaglio Approfondito su 2 Profili Rappresentativi")
    lines.append("")

    # Mostra i 2 profili in dettaglio: moppierhead (medio, 38 semi) e warnok (lungo, 476 semi)
    profili_dettaglio = [
        ("moppierhead", "Profilo Medio (38 semi)"),
        ("warnok", "Profilo Lungo (476 semi)"),
    ]

    for ut, titolo_sez in profili_dettaglio:
        ra = next(x for x in risultati_A if x["utente"] == ut)
        rb = next(x for x in risultati_B if x["utente"] == ut)

        lines.append(f"### {titolo_sez} — Utente `{ut}` ({ra['n_semi']} semi, prevalentemente `{ra['mostly_medium']}`)")
        lines.append("")

        for strat_nome, strat_res in [("Strategia A (Affinità Coseno su Grafo V45)", ra), ("Strategia B (Jaccard su Vicinato Condiviso)", rb)]:
            lines.append(f"#### {strat_nome}")
            lines.append(f"- **Cluster generati**: {strat_res['k_clusters']} (dimensioni: {strat_res['sizes']})")
            lines.append(f"- **Copertura semi**: {strat_res['coverage']*100:.1f}% ({strat_res['n_semi'] - strat_res['unclustered_count']}/{strat_res['n_semi']}) — non raggruppati: {strat_res['unclustered_count']}")
            lines.append(f"- **Distinctness (sovrapposizione media top-10)**: `{strat_res['distinctness']:.2f}` (più basso = liste più diversificate tra cluster)")
            lines.append(f"- **Drift di decade medio**: `{strat_res['mean_drift_decade']*100:.1f}%`")
            lines.append("")

            for c_idx, c in enumerate(strat_res["cluster_info"], start=1):
                reps_str = ", ".join(f"`{t}`" for t in c["rep_titles"])
                lines.append(f"**Cluster {c_idx}** ({c['size']} semi, decade mediana semi: {c['median_decade']})")
                lines.append(f"- *Semi rappresentativi*: {reps_str}")
                lines.append(f"- *Top-10 raccomandazioni generate*:")
                for r_idx, cand in enumerate(c["top10"], start=1):
                    lines.append(f"  {r_idx}. **{cand['title']}** ({cand['year']}) — score: `{cand['score']:.4f}`")
                lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    print("Avvio prototipo cluster personali di interesse (Ticket 05)...", flush=True)
    engine = Engine.carica_transizione(pota=16)
    meta = K.metadati()

    profili = seleziona_profili(RNG_SEED)
    print(f"Profili selezionati (N=8): {[u for u, _ in profili]}", flush=True)

    risultati_A = []
    risultati_B = []

    for u, l in profili:
        print(f"Analisi profilo {u:<15} (L={l})...", flush=True)
        res_a = analizza_profilo(u, engine, meta, strategia="A", min_affinity=0.06)
        res_b = analizza_profilo(u, engine, meta, strategia="B", min_affinity=0.04)
        risultati_A.append(res_a)
        risultati_B.append(res_b)

    # Scrittura report markdown
    out_dir = Path(".scratch/v45-raccomandazioni-yaca/prototipo")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_md = out_dir / "risultati.md"

    md_content = genera_markdown(risultati_A, risultati_B)
    out_md.write_text(md_content, encoding="utf-8")
    print(f"Report scritto con successo in: {out_md}", flush=True)

    # Stampa a video della tabella comparativa
    print("\n" + "=" * 110)
    print("TABELLA COMPARATIVA 8 PROFILI (STRATEGIA A vs STRATEGIA B)")
    print("=" * 110)
    print(f"{'Utente':<15} {'Semi':<5} {'Strat':<6} {'k':<3} {'Sizes':<28} {'Copertura':<10} {'Non-raggr':<10} {'Distinctness':<13} {'Drift Dec'}")
    print("-" * 110)
    for ra, rb in zip(risultati_A, risultati_B):
        u = ra["utente"]
        n = ra["n_semi"]
        print(f"{u:<15} {n:<5} {'A':<6} {ra['k_clusters']:<3} {str(ra['sizes']):<28} {ra['coverage']*100:>5.1f}%     {ra['unclustered_count']:<10} {ra['distinctness']:>7.2f}       {ra['mean_drift_decade']*100:>5.1f}%")
        print(f"{u:<15} {n:<5} {'B':<6} {rb['k_clusters']:<3} {str(rb['sizes']):<28} {rb['coverage']*100:>5.1f}%     {rb['unclustered_count']:<10} {rb['distinctness']:>7.2f}       {rb['mean_drift_decade']*100:>5.1f}%")
        print("-" * 110)


if __name__ == "__main__":
    main()
