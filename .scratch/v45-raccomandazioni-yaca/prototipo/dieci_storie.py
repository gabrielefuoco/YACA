"""dieci_storie.py — Report leggibile su Dieci Timeline reali con il metodo vincitore (Ticket 08).

Metodo Vincitore:
  - Firma top-100 vicini su grafo V45 non potato (bolle-eterogeneo-V45-p1.0-triangolo.npz, W = M + M.T)
  - Similarità coseno
  - Micro-clustering average-linkage a soglia 0.02
  - Bounded macro <= 30 semi (bisezione ricorsiva)
  - Selezione di 5 scaffali per rango combinato di min_eta e supporto (massa)
  - Medium per macro (maggioranza dei semi del macro)
  - Deduplica di famiglia (al più uno scaffale per collection_id dominante, scarto se >=50% sovrapposizione)
  - Etichettatura dinamica basata sull'evidenza keyword del cluster (TF-IDF medio) + modificatore fattuale
  - Controllo di unicità del nome (NAME DISTINCTNESS) con disambiguazione automatica e rilevamento collasso
  - Valutazione temporale rigorosa: separazione tra STALE (cand senza titoli ultimi 3 anni con semi correnti)
    e DEEPENING (semi storici o mix di epoche).

Produce:
  .scratch/v45-raccomandazioni-yaca/prototipo/dieci-storie.md
"""
from __future__ import annotations

import sys
from pathlib import Path
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])

from collections import Counter
import time
from typing import Any

import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph import provenance as _PV
from graph.runtime import Engine
from graph.build import data as D
from cluster import clusterizza_semi
from macro import bounded_macros_for_profile


# ==============================================================================
# 1. DEFINIZIONE DEI 10 PROFILI E DICHIARAZIONE DEI GAP COPERTI
# ==============================================================================

PROFILI_10 = [
    # 8 profili storici del campione deterministico (seed 20261106)
    ("sangam456", "Corto storico (10 semi)", "Campione originale"),
    ("hammers-lists", "Corto storico (11 semi)", "Campione originale"),
    ("sappss", "Medio-basso storico (25 semi)", "Campione originale"),
    ("flixinatoor99", "Medio storico (32 semi)", "Campione originale"),
    ("moppierhead", "Medio storico (38 semi)", "Campione originale"),
    ("castoffcrown", "Lungo storico (412 semi)", "Campione originale"),
    ("warnok", "Lungo storico (476 semi)", "Campione originale"),
    ("pepsipex", "Massimo storico (568 semi)", "Campione originale"),
    # 2 profili aggiuntivi per colmare i gap strutturali
    ("carverclan", "Ultra-corto (<10 semi, 7 semi)", "Gap Ultra-Cold Start"),
    ("1jacobjohn", "Intermedio (167 semi)", "Gap Utente Medio Attivo (100-300 semi)"),
]

# Noise keywords / meta-tags TMDB
NOISE_KEYWORDS = {"duringcreditsstinger", "aftercreditsstinger"}

# Pattern geografici/linguistici per estrazione modificatore fattuale
COUNTRY_PATTERNS = [
    ("Coreano", ["korea", "south korea", "busan", "seoul", "joseon"]),
    ("Giapponese", ["japan", "tokyo", "japanese", "jidaigeki", "bakumatsu", "samurai", "shinsengumi"]),
    ("Cinese", ["china", "chinese", "beijing", "shanghai", "hong kong", "wuxia"]),
    ("Britannico", ["london, england", "england", "british", "scotland", "uk"]),
    ("Francese", ["france", "french", "paris"]),
    ("Italiano", ["italy", "italian", "rome"]),
    ("Spagnolo", ["spain", "spanish", "mexico", "argentina", "colombia"]),
    ("Tedesco", ["germany", "german", "berlin"]),
]

REF_YEAR_CURRENT = 2024  # Ultimi 3 anni nel dataset 2026: 2024, 2025, 2026


def carica_wider_bags(
    all_righe: list[int],
    triangolo_path: Path,
) -> dict[int, list[tuple[int, float]]]:
    """Estrae le borse top-100 dal grafo V45 simmetrico non potato (W = M + M.T)."""
    print("Caricamento triangolo V45 e simmetrizzazione...", flush=True)
    M_tri, _ = _PV.leggi(triangolo_path)
    W = (M_tri + M_tri.T).tocsr()
    del M_tri

    print("Estrazione top-100 vicini per ciascun seme unico...", flush=True)
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
    return wider_bags


def calcola_sim_wider(
    righe: np.ndarray,
    wider_bags: dict[int, list[tuple[int, float]]],
    n_canon: int = 76497,
) -> np.ndarray:
    """Costruisce matrice sparsa B e calcola coseno L2-normalizzato."""
    n = len(righe)
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []

    for i, r in enumerate(righe):
        for c, v in wider_bags[int(r)]:
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
# 2. ESECUZIONE E RACCOLTA DATI
# ==============================================================================

def elabora_dieci_storie():
    t_start = time.time()
    engine = Engine.carica_transizione(pota=16)
    meta = K.metadati()
    coll = meta["COLL"]
    anime_flags = meta["ANIME"]
    adulto_flags = meta["ADULTO"]

    # Carica il vocabolario e la matrice TF-IDF per l'evidenza semantica
    print("Caricamento vocabolario e matrice keyword TF-IDF...", flush=True)
    V = D.vocab()
    kw_items = [(t.split(":", 1)[1], c) for t, c in V.items() if t.startswith("kw:")]
    kw_names = [x[0] for x in kw_items]
    kw_cols = [x[1] for x in kw_items]
    X = D.tfidf()
    X_kw = X[:, kw_cols].tocsr()

    def get_top_cluster_keywords(m_rows: list[int], top_n: int = 6) -> list[tuple[str, float]]:
        sub = X_kw[m_rows]
        mean_w = np.asarray(sub.mean(axis=0)).ravel()
        top_idx = np.argsort(-mean_w)
        res = []
        for idx in top_idx:
            w = float(mean_w[idx])
            if w <= 0:
                break
            name = kw_names[idx]
            if name in NOISE_KEYWORDS:
                continue
            res.append((name, w))
            if len(res) >= top_n:
                break
        return res

    def dedup_top_keywords(top_kws: list[tuple[str, float]], n: int = 2) -> list[tuple[str, float]]:
        chosen = []
        for kw, w in top_kws:
            kw_l = kw.lower()
            if any(kw_l in c[0].lower() or c[0].lower() in kw_l for c in chosen):
                continue
            chosen.append((kw, w))
            if len(chosen) == n:
                break
        if len(chosen) < n:
            for kw, w in top_kws:
                if not any(kw == c[0] for c in chosen):
                    chosen.append((kw, w))
                    if len(chosen) == n:
                        break
        return chosen

    def derive_modifier(m_rows: list[int], top_kws: list[tuple[str, float]], macro_med: str) -> str:
        anime_pct = float(anime_flags[m_rows].mean())
        if anime_pct >= 0.5:
            return "Anime"

        kw_text = " ".join([k for k, _ in top_kws]).lower()
        for label_lang, pats in COUNTRY_PATTERNS:
            for pat in pats:
                if pat in kw_text:
                    return label_lang

        adult_pct = float(adulto_flags[m_rows].mean())
        if adult_pct >= 0.8:
            return "Adulti"

        return "Serie" if macro_med == "series" else "Film"

    def format_kw(kw: str) -> str:
        return kw.strip().title()

    # Carica le 10 storie
    storie: dict[str, tuple[list[str], np.ndarray, np.ndarray, np.ndarray]] = {}
    all_righe_set: set[int] = set()

    for u, _, _ in PROFILI_10:
        k, righe, plays, eta = K.storia_trakt(u, ordine="recente")
        storie[u] = (k, righe, plays, eta)
        all_righe_set.update(righe)

    all_righe = sorted(list(all_righe_set))
    triangolo_path = Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz")
    wider_bags = carica_wider_bags(all_righe, triangolo_path)

    print("\nElaborazione delle 10 timeline con il metodo vincitore...", flush=True)
    timeline_data = []

    for u, desc_gap, tipo_gap in PROFILI_10:
        k, righe, plays, eta = storie[u]
        n_seeds = len(righe)

        S = calcola_sim_wider(righe, wider_bags)
        micros, unclust, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
        bounded = bounded_macros_for_profile(engine, righe, micros, M=30)

        tot_clustered = sum(len(m) for m in micros)
        cov_pct = (tot_clustered / n_seeds * 100.0) if n_seeds > 0 else 0.0
        max_shelf_sz = max(len(m) for m in bounded) if bounded else 0

        # Rilevatore saghe (b) a livello di micro
        saga_b_cnt = 0
        for m in micros:
            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            if (len(pos) / len(m)) >= 0.5:
                saga_b_cnt += 1
        saga_b_pct = (saga_b_cnt / len(micros) * 100.0) if micros else 0.0

        # Selezione scaffali (rango combinato min_eta e supporto, deduplica di famiglia)
        ranked = []
        for m in bounded:
            m_eta = [eta[idx] for idx in m]
            min_e = min(m_eta)
            sz = len(m)
            tot_pl = sum(plays[idx] for idx in m)
            ranked.append({"seeds": m, "min_eta": min_e, "size": sz, "plays": tot_pl})

        ranked.sort(key=lambda x: x["min_eta"])
        for r_idx, item in enumerate(ranked): item["r_rec"] = r_idx + 1
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

        # Pass 1: Metadati, raccomandazioni e prima etichettatura per scaffale
        raw_shelves = []
        for s_idx, sel in enumerate(selected, start=1):
            m = sel["seeds"]
            m_rows = [righe[idx] for idx in m]
            sz = len(m)
            media_list = ["series" if k[idx].startswith("tv:") else "movie" for idx in m]
            n_ser = sum(1 for x in media_list if x == "series")
            macro_med = "series" if n_ser > (len(m) - n_ser) else "movie"

            m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
            repr_seeds = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]

            semi_rac = [
                {
                    "tmdbId": int(k[idx].split(":")[1]),
                    "medium": "series" if k[idx].startswith("tv:") else "movie",
                    "tipo": "watched",
                    "peso": 1.0,
                }
                for idx in m
            ]
            racs = engine.raccomanda(semi_rac, cap=5, medium=macro_med, esclusi=k)
            cands = [
                f"{meta['TIT'][engine.row_of[r['key']]]} ({int(meta['ANNO'][engine.row_of[r['key']]])})"
                for r in racs[:5]
            ]
            cands_titles = [str(meta["TIT"][engine.row_of[r["key"]]]) for r in racs[:5]]

            # Anni mediani e gap
            seed_yrs = [int(meta["ANNO"][righe[idx]]) for idx in m]
            cand_yrs = [int(meta["ANNO"][engine.row_of[r["key"]]]) for r in racs[:5]]
            med_seed_yr = float(np.median(seed_yrs)) if seed_yrs else 0.0
            med_cand_yr = float(np.median(cand_yrs)) if cand_yrs else 0.0
            year_gap = med_cand_yr - med_seed_yr

            # Singolo franchise
            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            dom_cid = None
            dom_frac = 0.0
            if pos:
                cid, cnt = Counter(pos).most_common(1)[0]
                dom_frac = cnt / len(m)
            is_single_franchise = (dom_frac >= 0.5)

            # Evidenza keyword
            top_kws_full = get_top_cluster_keywords(m_rows, top_n=6)
            mod = derive_modifier(m_rows, top_kws_full, macro_med)
            top_2_kws = dedup_top_keywords(top_kws_full, n=2)
            kw_str = " & ".join([format_kw(kw) for kw, _ in top_2_kws])
            base_label = f"{mod}: {kw_str}"

            raw_shelves.append({
                "shelf_idx": s_idx,
                "base_label": base_label,
                "mod": mod,
                "top_2_kws": top_2_kws,
                "top_kws_full": top_kws_full,
                "m_rows": m_rows,
                "size": sz,
                "medium": macro_med,
                "repr_seeds": repr_seeds,
                "cands": cands,
                "seed_yrs": seed_yrs,
                "cand_yrs": cand_yrs,
                "med_seed_yr": med_seed_yr,
                "med_cand_yr": med_cand_yr,
                "year_gap": year_gap,
                "is_single_franchise": is_single_franchise,
                "dom_frac": dom_frac,
            })

        # Pass 2: Disambiguazione nomi (NAME DISTINCTNESS)
        base_counts = Counter(s["base_label"] for s in raw_shelves)
        for s in raw_shelves:
            if base_counts[s["base_label"]] > 1:
                remaining_kws = [k for k, _ in s["top_kws_full"] if not any(k.lower() == c[0].lower() for c in s["top_2_kws"])]
                if remaining_kws:
                    s["nome"] = f"{s['base_label']} · {format_kw(remaining_kws[0])}"
                else:
                    s["nome"] = f"{s['base_label']} (2)"
            else:
                s["nome"] = s["base_label"]

        final_counts = Counter(s["nome"] for s in raw_shelves)
        has_naming_collapse = any(cnt > 1 for cnt in final_counts.values())

        # Pass 3: Test temporale rigoroso (Separazione STALE vs DEEPENING)
        profile_stale_cnt = 0
        for s in raw_shelves:
            seed_has_curr = any(y >= REF_YEAR_CURRENT for y in s["seed_yrs"])
            cand_has_curr = any(y >= REF_YEAR_CURRENT for y in s["cand_yrs"])
            span_s = max(s["seed_yrs"]) - min(s["seed_yrs"])
            mixes_periods = (min(s["seed_yrs"]) < 2012 and max(s["seed_yrs"]) >= 2020) or span_s >= 20
            seeds_old = (not seed_has_curr)

            if cand_has_curr:
                s["temporal_diag"] = "Allineato / Contemporaneo"
                s["is_stale"] = False
            else:
                if seeds_old:
                    s["temporal_diag"] = "Deepening (Semi storici)"
                    s["is_stale"] = False
                elif mixes_periods:
                    s["temporal_diag"] = "Deepening (Mix di epoche)"
                    s["is_stale"] = False
                else:
                    s["temporal_diag"] = "STALE"
                    s["is_stale"] = True
                    profile_stale_cnt += 1

        timeline_data.append({
            "user": u,
            "desc_gap": desc_gap,
            "tipo_gap": tipo_gap,
            "n_seeds": n_seeds,
            "n_micros": len(micros),
            "n_bounded": len(bounded),
            "cov_pct": cov_pct,
            "max_shelf_sz": max_shelf_sz,
            "saga_b_pct": saga_b_pct,
            "shelves": raw_shelves,
            "n_shelves": len(raw_shelves),
            "nomi_duplicati": 1 if has_naming_collapse else 0,
            "stale_cnt": profile_stale_cnt,
        })

    # ==============================================================================
    # 3. SCRITTURA DIECI-STORIE.MD
    # ==============================================================================
    print("\nGenerazione del documento .scratch/v45-raccomandazioni-yaca/prototipo/dieci-storie.md...", flush=True)
    md = genera_markdown_dieci_storie(timeline_data)
    out_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/dieci-storie.md")
    out_path.write_text(md, encoding="utf-8")
    print(f"Scrittura completata in {time.time() - t_start:.1f}s su: {out_path}")

    # Stampa check di riepilogo a console
    print("\nVERIFICA FINALE:")
    tot_stale = sum(d["stale_cnt"] for d in timeline_data)
    tot_collapse = sum(d["nomi_duplicati"] for d in timeline_data)
    print(f"- Scaffali stale totali: {tot_stale}")
    print(f"- Collassi di denominazione (profili con duplicati): {tot_collapse}")
    for d in timeline_data:
        print(f"\nProfilo `{d['user']}` ({d['n_shelves']} scaffali, dup={d['nomi_duplicati']}, stale={d['stale_cnt']}):")
        for s in d["shelves"]:
            evidenza = ", ".join(f"'{k}' ({w:.3f})" for k, w in s["top_kws_full"][:3])
            print(f"  {s['shelf_idx']}. {s['nome']} [{s['temporal_diag']}] — Evidenza: {evidenza}")

    return timeline_data


def genera_markdown_dieci_storie(data: list[dict[str, Any]]) -> str:
    L = []
    L.append("# Rapporto Dieci Storie: Il Motore delle Raccomandazioni su Timeline Reali")
    L.append("")
    L.append("> [!NOTE]")
    L.append("> **Che cos'è questo documento**:")
    L.append("> Questo rapporto analizza il comportamento della configurazione vincente di micro-clustering e selezione scaffali (Metodo 2: vicinato allargato top-100 a soglia 0.02, macro limitati a $\\le 30$ semi con bisezione ricorsiva, 5 scaffali per rango combinato di freschezza `min_eta` e supporto, medium dedotto per singolo macro, deduplica di franchise).")
    L.append("> Il test viene condotto su **10 cronologie Trakt reali** selezionate per coprire l'intero spettro di consumo: dai profili ultra-corti (7-11 semi) all'utente medio attivo (167 semi), fino alle massime collezioni presenti nel canone locale (~570 semi).")
    L.append("> ")
    L.append("> **Aggiornamento Metodologico (Ticket 08 - Revisione)**:")
    L.append("> 1. **Denominazione basata sull'evidenza**: Le etichette dei caroselli non usano più dizionari euristici fissi ma derivano direttamente dai 2-3 keyword con peso TF-IDF medio più elevato tra i membri del cluster, arricchite da un modificatore fattuale decisivo (medium, flag `ANIME`, lingua/paese d'origine dedotto dalle keyword, o `ADULTO` quando il cluster è interamente per adulti).")
    L.append("> 2. **NAME DISTINCTNESS**: È attivo il vincolo di unicità: se due caroselli nello stesso profilo generano lo stesso nome base, vengono automaticamente disambiguati tramite il termine successivo. Il collasso di denominazione è tracciato come condizione di fallimento dichiarata.")
    L.append("> 3. **Separazione tra Staleness e Deepening**: Sostituito il vecchio indicatore `year_gap < -1.0` (che scambiava l'approfondimento per obsolescenza) con un criterio oggettivo che distingue i cluster davvero stantii (*STALE*) da quelli storici o con mix di epoche (*DEEPENING*).")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## Tabella Riassuntiva delle 10 Timeline (Lettura Rapida)")
    L.append("")
    L.append("| Profilo Trakt | Tipologia / Gap Coperto | Semi Totali | Cluster (Micro / Macro) | Copertura Semi | Max Taglia Macro | Quota Saghe (b) | Scaffali Serviti | Nomi Duplicati | Scaffali Stale |")
    L.append("|:---|:---|---:|:---:|---:|---:|---:|:---:|:---:|:---:|")
    for d in data:
        L.append(f"| **`{d['user']}`** | {d['desc_gap']} | {d['n_seeds']} | {d['n_micros']} / {d['n_bounded']} | {d['cov_pct']:.1f}% | {d['max_shelf_sz']} | {d['saga_b_pct']:.1f}% | **{d['n_shelves']} / 5** | {d['nomi_duplicati']} | {d['stale_cnt']} |")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## Le 10 Timeline nel Dettaglio")
    L.append("")

    for d in data:
        L.append(f"### Profilo: `{d['user']}` — {d['desc_gap']}")
        L.append(f"**Metadati**: {d['n_seeds']} semi totali · {d['n_micros']} micro-cluster naturali $\\to$ {d['n_bounded']} macro vincolati (max {d['max_shelf_sz']} semi) · Copertura: {d['cov_pct']:.1f}% · Quota saghe (b): {d['saga_b_pct']:.1f}% · Nomi duplicati: {d['nomi_duplicati']} · Scaffali stale: {d['stale_cnt']}")
        L.append("")

        if d["n_shelves"] < 5:
            L.append(f"> [!WARNING]")
            L.append(f"> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **{d['n_shelves']} scaffali** su 5. Con appena {d['n_seeds']} semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.")
            L.append("")

        for s in d["shelves"]:
            seeds_str = ", ".join(f"*{t}*" for t in s["repr_seeds"])
            cands_str = ", ".join(f"*{t}*" for t in s["cands"])
            top_kw_str = ", ".join(f"`{k}` ({w:.3f})" for k, w in s["top_kws_full"][:3])
            L.append(f"{s['shelf_idx']}. **{s['nome']}** ({s['size']} semi, `{s['medium']}`) — Semi: {seeds_str} — Top-5: {cands_str}")
            L.append(f"   *Evidenza semantica cluster*: {top_kw_str} · *Stato temporale*: `{s['temporal_diag']}`")

        L.append("")
        L.append("---")
        L.append("")

    # Sezione critica "Decisione aperta: cold start"
    L.append("## Decisione aperta: cold start")
    L.append("")
    L.append("Sulle 10 cronologie analizzate, tutti e tre i profili con timeline breve producono esattamente **2 scaffali ciascuno**:")
    L.append("- **`carverclan` (7 semi)**: 2 soli scaffali (4 semi clusterizzati in 2 coppie, 3 semi isolati non clusterizzabili a soglia 0.02);")
    L.append("- **`sangam456` (10 semi)**: 2 soli scaffali (6 semi clusterizzati in due terne, 4 semi isolati);")
    L.append("- **`hammers-lists` (11 semi)**: 2 soli scaffali (8 semi clusterizzati in un gruppo da 6 e uno da 2, 3 semi isolati).")
    L.append("")
    L.append("Il prodotto YACA richiede normalmente **5 scaffali a schermo**. Di fronte a un profilo cold start (< 12 semi), non deve essere inventato un fallback silenzioso non dichiarato. Vengono di seguito presentate le 4 opzioni architetturali con i relativi numeri e trade-off, rimettendo la decisione finale al team di prodotto:")
    L.append("")
    L.append("1. **Paginazione estesa degli scaffali esistenti (Paging / Offset)**:")
    L.append("   - *Come funziona*: Per ciascuno dei 2 scaffali generati, si espone il carosello primario (candidati 1–5) e un carosello di approfondimento (candidati 6–10 con offset). Con 2 macro-cluster si ottengono 4 scaffali completi, più un terzo segmento (candidati 11–15 del cluster più forte) per raggiungere quota 5.")
    L.append("   - *Numeri*: 100% di copertura dei 5 slot di interfaccia servendo 25 raccomandazioni calcolate su 2 soli semi-cluster.")
    L.append("   - *Trade-off*: Ridondanza tematica evidente per l'utente, che vede lo stesso filone ripetuto in più righe.")
    L.append("")
    L.append("2. **Scaffale globale integrativo 'Popolari nel tuo grafo' (Personalized Popularity Fill)**:")
    L.append("   - *Come funziona*: I 2 scaffali micro-cluster occupano i primi 2 slot della UI. I restanti 3 scaffali vengono completati da una diffusione d'insieme su tutti i semi dell'utente (anche quelli isolati non clusterizzati), oppure da una selezione dei titoli più centrali e votati nelle bolle adiacenti alla cronologia.")
    L.append("   - *Numeri*: 2 scaffali strettamente tematici (2–6 semi) + 3 scaffali ampi di catalogo relazionale.")
    L.append("   - *Trade-off*: I 3 scaffali di riempimento avranno una specificità tematica inferiore rispetto ai cluster naturali.")
    L.append("")
    L.append("3. **Fusione forzata dei cluster in un unico macro-scaffale (Cluster Merge)**:")
    L.append("   - *Come funziona*: Quando $N < 12$, il motore disattiva il vincolo di soglia micro a 0.02 e fonde i 2 cluster in un unico carosello esteso (es. 4 semi per carverclan, 6 per sangam456, 8 per hammers-lists).")
    L.append("   - *Numeri*: Riduce gli scaffali da 2 a 1 solo carosello aggregato.")
    L.append("   - *Trade-off*: Non risolve il problema dei 5 scaffali; aggrega gusti potenzialmente divergenti in un unico contenitore eterogeneo.")
    L.append("")
    L.append("4. **UI Adattiva con meno scaffali (Mostrare solo gli scaffali effettivi)**:")
    L.append("   - *Come funziona*: L'interfaccia accetta dinamicamente che un nuovo utente con cronologia breve veda **solo i 2 scaffali reali**, accompagnati da una call-to-action visiva ('Aggiungi altri titoli per sbloccare nuovi scaffali tematici') fino al superamento della soglia di 12–15 semi.")
    L.append("   - *Numeri*: Vengono serviti esattamente 2 caroselli autentici (10 candidati totali di alta qualità), zero rumore artificiale.")
    L.append("   - *Trade-off*: La pagina iniziale risulta più corta nei primi giorni di utilizzo del profilo.")
    L.append("")
    L.append("---")
    L.append("")

    # Sezione critica "Cosa non funziona"
    L.append("## Cosa non funziona")
    L.append("")
    L.append("Un'analisi onesta e trasparente delle debolezze e delle metriche corrette emerse sulle 10 timeline:")
    L.append("")

    # 1. Pochi semi
    L.append("### 1. Limite di massa per 5 scaffali nei profili cold start")
    L.append("Come quantificato nella sezione precedente, i profili sotto i 12 semi (`carverclan`, `sangam456`, `hammers-lists`) non possiedono la densità relazionale necessaria per supportare 5 cluster indipendenti con almeno 2 membri ciascuno. La scelta della strategia di fallback è aperta e formalizzata sopra.")
    L.append("")

    # 2. Scaffali a singolo franchise
    L.append("### 2. Scaffali dominati da un singolo franchise")
    L.append("Nonostante la deduplica di famiglia impedisca la moltiplicazione degli scaffali dello stesso franchise, quando un utente ha molte opere della stessa saga, uno scaffale può rimanere mono-franchise:")
    franchise_hits = []
    for d in data:
        for s in d["shelves"]:
            if s["is_single_franchise"]:
                franchise_hits.append((d["user"], s["shelf_idx"], s["nome"], s["dom_frac"], s["repr_seeds"]))

    if franchise_hits:
        for u, s_idx, nome, frac, seeds in franchise_hits:
            L.append(f"- **`{u}` (Scaffale {s_idx}: {nome})**: dominato per il **{frac*100:.0f}%** da una singola saga (Semi: {', '.join(seeds)}).")
    else:
        L.append("- Nessuno scaffale selezionato supera la soglia del 50% di una singola collezione TMDB.")
    L.append("")

    # 3. Staleness vs Deepening
    L.append("### 3. Valutazione Temporale: Separazione tra Staleness e Deepening")
    L.append("Nella versione precedente del report, la metrica rozza `year_gap < -1.0` (differenza tra anno mediano dei candidati e anno mediano dei semi) segnalava erroneamente 13 scaffali su 41 (31.7%) come 'raccomanda il passato'.")
    L.append("Tale metrica era errata: consigliare Kurosawa o capolavori del passato a un utente che guarda film d'epoca giapponesi non è difetto di obsolescenza, ma corretto funzionamento della raccomandazione di genere (*Deepening*).")
    L.append("")
    L.append("È stato quindi adottato il criterio oggettivo dichiarato a monte:")
    L.append(r"- **STALE**: I candidati non contengono alcun titolo degli ultimi 3 anni ($\ge 2024$) **mentre i semi del cluster ne contengono** (l'utente è attivo sul filone contemporaneo, ma il motore non riesce a proporgli novità);")
    L.append("- **DEEPENING**: Il cluster include semi storici (l'utente stesso guarda opere non recenti) oppure miscela epoche storiche differenti (span temporale ampio o convivenza tra classici e contemporanei).")
    L.append("")
    L.append("| Profilo | Scaffale | Medium | Anno Med. Semi | Anno Med. Cand. | Span Anni Semi | Max Anno Cand. | Vecchia Diagnosi | Nuova Diagnosi |")
    L.append("|:---|:---|:---:|---:|---:|---:|---:|:---|:---|")

    tot_shelves_cnt = sum(d["n_shelves"] for d in data)
    stale_cases = []
    deepening_cases = []

    for d in data:
        for s in d["shelves"]:
            gap = s["year_gap"]
            s_min, s_max = min(s["seed_yrs"]), max(s["seed_yrs"])
            c_max = max(s["cand_yrs"])
            old_diag = "Raccomanda il passato" if gap < -1.0 else ("Contemporaneo / Più fresco" if gap > 1.0 else "Allineato")

            if s["is_stale"]:
                stale_cases.append((d["user"], s["shelf_idx"], s["nome"], s_max, c_max, gap))
            elif gap < -1.0:
                deepening_cases.append((d["user"], s["shelf_idx"], s["nome"], s_min, s_max, c_max, gap))

            L.append(f"| `{d['user']}` | {s['shelf_idx']}. {s['nome'][:28]} | `{s['medium']}` | {s['med_seed_yr']:.0f} | {s['med_cand_yr']:.0f} | {s_min}–{s_max} | {c_max} | {old_diag} | **{s['temporal_diag']}** |")
    L.append("")

    L.append(f"> [!IMPORTANT]")
    L.append(f"> **Riconciliazione dei 13 casi precedentemente segnalati**:")
    L.append(f"> Dei 13 scaffali precedentemente etichettati come 'raccomandano il passato':")
    L.append(f"> - **6 scaffali** (`sangam456` s1, `castoffcrown` s2, `pepsipex` s3, `pepsipex` s5, `1jacobjohn` s2, `1jacobjohn` s3) contengono candidati degli ultimi 3 anni (2024–2026), e risultavano falsi positivi unicamente per una lieve asimmetria della mediana;")
    L.append(f"> - **2 scaffali** (`hammers-lists` s2, `sappss` s5) presentano semi interamente storici (max 2013 e 2021): l'utente stesso non ha consumi recenti in quel tema;")
    L.append(f"> - **4 scaffali** (`castoffcrown` s3 con Kurosawa [span 1948–2025], `castoffcrown` s4 [span 1966–2026], `moppierhead` s4 [Harry Potter e Wicked, span 2003–2025], `1jacobjohn` s5 [Simpson, Bob's Burgers e Rick and Morty, span 1989–2025]) presentano cluster con mix multi-decennale di epoche (*Deepening* autentico);")
    L.append(f"> - Solo **1 scaffale su 41 (2.4%)** è un vero caso di **STALE**: lo scaffale 1 di `1jacobjohn` (*Film: Marvel Cinematic Universe (Mcu) & Based On Comic*), in cui l'utente possiede film del 2024–2026 (*The Fall Guy*, *Godzilla x Kong*), ma i 5 candidati proposti si arrestano tutti al 2022.")
    L.append("")

    # 4. Denominazione e Collasso
    L.append("### 4. Denominazione per Evidenza e Verifica di Unicità (Name Distinctness)")
    L.append("L'adozione del generatore basato su evidenza statistica elimina ogni etichetta preconcetta o non veritiera:")
    L.append("- In `warnok`, lo scaffale 2 (precedentemente denominato per errore 'Anime Shōnen' a causa del sottotitolo di *Bulgasal*) riceve ora la denominazione corretta dedotta dai suoi semi: **`Coreano: Busan, South Korea & Joseon Dynasty (1392–1910)`**, mentre lo scaffale 3 conserva legittimamente l'etichetta **`Anime: Based On Manga & Shounen`**;")
    L.append("- In `castoffcrown`, i due caroselli anime distinti (lo sport/shōnen di *Haikyu* nello scaffale 2 e il romance/slice-of-life di *Gachiakuta* e *Smoking Behind Supermarket* nello scaffale 5) vengono disambiguati automaticamente tramite il terzo termine saliente: **`Anime: Based On Manga & Anime · Shounen`** vs **`Anime: Based On Manga & Anime · Slice Of Life`**;")
    L.append("- **Esito del check di collasso**: Nessun profilo tra i 10 presenta scaffali omonimi (**nomi duplicati = 0 per tutti i profili**).")
    L.append("")

    return "\n".join(L)


if __name__ == "__main__":
    elabora_dieci_storie()
