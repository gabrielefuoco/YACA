"""macro.py — Seconda passata di clustering (micro -> macro) e selezione degli scaffali.

Modulo per Ticket 05 (Part 1 & Part 2).
Esegue il clustering agglomerativo (average-linkage) sui vettori di micro-cluster,
analizza il collasso topologico per target cardinalità {4, 6, 8, 12}, valuta
entrambi i detector di saghe (a e b), e confronta tre regole di selezione scaffali
(recency, support, combined) verificando a priori le condizioni di fallimento dichiarate.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import scipy.sparse as sp
from scipy.spatial.distance import squareform
from scipy.cluster.hierarchy import linkage

from graph.runtime import Engine
from graph import canon as K


def cut_linkage_exact_k(Z: np.ndarray, m: int, k: int) -> dict[int, list[int]]:
    """Taglia la gerarchia agglomerativa Z a esattamente min(m, k) componenti connesse."""
    if m <= k:
        return {i: [i] for i in range(m)}
    parent = list(range(2 * m))

    def find(i: int) -> int:
        path = []
        while parent[i] != i:
            path.append(i)
            i = parent[i]
        for node in path:
            parent[node] = i
        return i

    for step in range(m - k):
        c1, c2 = int(Z[step, 0]), int(Z[step, 1])
        new_node = m + step
        parent[find(c1)] = new_node
        parent[find(c2)] = new_node

    clusters: dict[int, list[int]] = {}
    for i in range(m):
        clusters.setdefault(find(i), []).append(i)
    return clusters


def aggrega_macro_cluster(
    engine: Engine,
    righe: np.ndarray,
    micro_clusters: list[list[int]],
    target_k: int,
) -> list[list[int]]:
    """Esegue la seconda passata agglomerativa (micro -> macro) sul coseno tra vettori L2-normalizzati.
    
    Ritorna la lista di macro-cluster (ciascuno contenente gli indici di riga originali dei semi).
    """
    m = len(micro_clusters)
    if m == 0:
        return []
    if m == 1:
        return [micro_clusters[0]]
    if m <= target_k:
        return [list(c) for c in micro_clusters]

    # Righe di transizione V45 L2-normalizzate
    V = engine.Tr[righe, :]
    norms = np.array(np.sqrt(V.multiply(V).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    V_norm = sp.diags(1.0 / norms) @ V

    # Vettore L2-normalizzato per ciascun micro-cluster (somma/media dei membri normalizzati)
    c_vecs = []
    for c in micro_clusters:
        v_c = np.array(V_norm[c, :].sum(axis=0)).ravel()
        norm_c = np.linalg.norm(v_c)
        if norm_c == 0:
            norm_c = 1.0
        c_vecs.append(v_c / norm_c)
    C_norm = np.array(c_vecs)

    # Similarità e distanza coseno
    S = C_norm @ C_norm.T
    d = np.clip(1.0 - S, 0.0, 1.0)
    np.fill_diagonal(d, 0.0)

    # Average-linkage agglomerativo
    Z = linkage(squareform(d), method="average")
    groups = cut_linkage_exact_k(Z, m, target_k)

    macros = []
    for micro_indices in groups.values():
        m_seeds: list[int] = []
        for mi in micro_indices:
            m_seeds.extend(micro_clusters[mi])
        macros.append(m_seeds)

    # Ordine iniziale per cardinalità decrescente
    macros.sort(key=len, reverse=True)
    return macros


def calcola_sweep_macro(
    engine: Engine,
    meta: dict[str, Any],
    profili: list[tuple[str, int]],
    storie: dict[str, tuple[list[str], np.ndarray, np.ndarray, np.ndarray]],
    micro_cache: dict[str, list[list[int]]],
    targets: list[int] = [4, 6, 8, 12],
) -> list[dict[str, Any]]:
    """Calcola la tabella Part 1 sui target cardinalità e gli 8 profili."""
    coll = meta["COLL"]
    risultati = []

    for target_k in targets:
        for u, L in profili:
            chiavi, righe, plays, eta = storie[u]
            micros = micro_cache[u]
            macros = aggrega_macro_cluster(engine, righe, micros, target_k)

            sizes = [len(m) for m in macros]
            tot_c = sum(sizes)
            cov = (tot_c / L * 100.0) if L > 0 else 0.0
            min_sz = min(sizes) if sizes else 0
            med_sz = float(np.median(sizes)) if sizes else 0.0
            max_sz = max(sizes) if sizes else 0
            collapse_share = (max_sz / L * 100.0) if L > 0 else 0.0

            saga_a = 0
            saga_b = 0
            for m_seeds in macros:
                c_coll = coll[righe[m_seeds]]
                pos = [x for x in c_coll if x > 0]
                if pos:
                    cid, cnt = Counter(pos).most_common(1)[0]
                    if (cnt / len(m_seeds)) >= 0.5:
                        saga_a += 1
                if (len(pos) / len(m_seeds)) >= 0.5:
                    saga_b += 1

            n_m = len(macros)
            pct_a = (saga_a / n_m * 100.0) if n_m > 0 else 0.0
            pct_b = (saga_b / n_m * 100.0) if n_m > 0 else 0.0

            risultati.append({
                "target": target_k,
                "user": u,
                "L": L,
                "n_macros": n_m,
                "min_sz": min_sz,
                "med_sz": med_sz,
                "max_sz": max_sz,
                "cov": cov,
                "pct_a": pct_a,
                "pct_b": pct_b,
                "collapse": collapse_share,
                "is_collapsed": collapse_share > 60.0,
            })

    return risultati


def analizza_scaffali_profilo(
    engine: Engine,
    meta: dict[str, Any],
    utente: str,
    chiavi: list[str],
    righe: np.ndarray,
    plays: np.ndarray,
    eta: np.ndarray,
    macros: list[list[int]],
) -> dict[str, Any]:
    """Valuta le tre regole di selezione per un profilo dato il set di macro-cluster."""
    coll = meta["COLL"]
    global_freshest_seed_idx = int(np.argmin(eta))

    macro_info = []
    for idx, m_seeds in enumerate(macros):
        med_eta = float(np.median([eta[i] for i in m_seeds]))
        min_e = float(np.min([eta[i] for i in m_seeds]))
        sz = len(m_seeds)
        tot_p = float(np.sum([plays[i] for i in m_seeds]))
        seed_years = [int(meta["ANNO"][righe[i]]) for i in m_seeds]
        med_yr = float(np.median(seed_years))

        n_mov = sum(1 for i in m_seeds if chiavi[i].startswith("movie"))
        n_tv = sum(1 for i in m_seeds if chiavi[i].startswith("tv"))
        med_type = "movie" if n_mov >= n_tv else "series"

        # saga detectors
        c_coll = coll[righe[m_seeds]]
        pos = [x for x in c_coll if x > 0]
        cid, cnt = Counter(pos).most_common(1)[0] if pos else (-1, 0)
        is_saga_a = (cnt / sz) >= 0.5
        is_saga_b = (len(pos) / sz) >= 0.5

        # semi rappresentativi (centralità coseno interna)
        if sz <= 3:
            rep_indices = list(range(sz))
        else:
            V_sub = engine.Tr[righe[m_seeds], :]
            norms_sub = np.array(np.sqrt(V_sub.multiply(V_sub).sum(axis=1))).ravel()
            norms_sub[norms_sub == 0] = 1.0
            V_norm_sub = sp.diags(1.0 / norms_sub) @ V_sub
            S_sub = (V_norm_sub @ V_norm_sub.T).toarray()
            cent = np.sum(S_sub, axis=1) - 1.0
            rep_indices = list(np.argsort(-cent)[:3])
        rep_titles = [f"{meta['TIT'][righe[m_seeds[ri]]]} ({int(meta['ANNO'][righe[m_seeds[ri]]])})" for ri in rep_indices]

        # Engine.raccomanda
        semi_rac = [{"key": chiavi[i], "plays": float(plays[i])} for i in m_seeds]
        racs = engine.raccomanda(semi_rac, cap=10, medium=med_type, esclusi=chiavi)
        cand_keys = [r["key"] for r in racs]
        cand_years = [int(meta["ANNO"][engine.row_of[r["key"]]]) for r in racs]
        cand_med_yr = float(np.median(cand_years)) if cand_years else 0.0
        cand_items = [
            {
                "key": r["key"],
                "title": str(meta["TIT"][engine.row_of[r["key"]]]),
                "year": int(meta["ANNO"][engine.row_of[r["key"]]]),
                "score": float(r["punteggio"]),
            }
            for r in racs
        ]

        macro_info.append({
            "id": idx,
            "seeds": m_seeds,
            "med_eta": med_eta,
            "min_eta": min_e,
            "size": sz,
            "tot_plays": tot_p,
            "med_year": med_yr,
            "medium": med_type,
            "is_saga_a": is_saga_a,
            "is_saga_b": is_saga_b,
            "rep_titles": rep_titles,
            "cand_keys": cand_keys,
            "cand_years": cand_years,
            "cand_med_year": cand_med_yr,
            "cand_items": cand_items,
        })

    # Freshest macro by min_eta (freshest seed among clustered seeds)
    freshest_macro_id = min(range(len(macros)), key=lambda i: macro_info[i]["min_eta"])

    # 1. Regola Recency: ordinamento per median eta crescente, tie-break min_eta crescente
    order_rec = sorted(range(len(macro_info)), key=lambda i: (macro_info[i]["med_eta"], macro_info[i]["min_eta"]))

    # 2. Regola Support: ordinamento per size decrescente, tie-break total plays decrescenti
    order_sup = sorted(range(len(macro_info)), key=lambda i: (-macro_info[i]["size"], -macro_info[i]["tot_plays"]))

    # 3. Regola Combined: media dei ranghi (1-based), tie-break su rank_sup
    rank_rec = {m_id: r + 1 for r, m_id in enumerate(order_rec)}
    rank_sup = {m_id: r + 1 for r, m_id in enumerate(order_sup)}
    order_comb = sorted(range(len(macro_info)), key=lambda i: ((rank_rec[i] + rank_sup[i]) / 2.0, rank_sup[i]))

    rules = [("recency", order_rec[:5]), ("support", order_sup[:5]), ("combined", order_comb[:5])]
    rule_results = {}

    for r_name, sel in rules:
        n_sel = len(sel)
        # 1. Shelf duplicata (>= 50% candidati condivisi con un altro scaffale selezionato)
        dup_count = 0
        for i_idx, m_i in enumerate(sel):
            keys_i = set(macro_info[m_i]["cand_keys"])
            is_dup = False
            for j_idx, m_j in enumerate(sel):
                if i_idx == j_idx:
                    continue
                keys_j = set(macro_info[m_j]["cand_keys"])
                overlap = len(keys_i & keys_j)
                if len(keys_i) > 0 and (overlap / len(keys_i)) >= 0.5:
                    is_dup = True
                    break
            if is_dup:
                dup_count += 1

        # 2. Saghe detector (b)
        saga_b_count = sum(1 for m_id in sel if macro_info[m_id]["is_saga_b"])

        # 3. Raccomanda il passato (mediana candidati < mediana semi)
        past_count = sum(1 for m_id in sel if macro_info[m_id]["cand_med_year"] < macro_info[m_id]["med_year"])

        # 4. Freshest macro presente?
        freshest_in = freshest_macro_id in sel

        fail_dup = dup_count >= 2
        fail_saga = saga_b_count >= 2
        fail_past = past_count > 0
        fail_fresh = (r_name == "recency" and not freshest_in)

        rule_results[r_name] = {
            "sel_ids": sel,
            "dup_count": dup_count,
            "saga_b_count": saga_b_count,
            "past_count": past_count,
            "freshest_in": freshest_in,
            "fail_dup": fail_dup,
            "fail_saga": fail_saga,
            "fail_past": fail_past,
            "fail_fresh": fail_fresh,
            "overall_fail": fail_dup or fail_saga or fail_past or fail_fresh,
        }

    return {
        "user": utente,
        "n_macros": len(macros),
        "freshest_macro_id": freshest_macro_id,
        "macro_info": macro_info,
        "rank_rec": rank_rec,
        "rank_sup": rank_sup,
        "rule_results": rule_results,
    }


def formatta_sezione_markdown(
    sweep_macro_results: list[dict[str, Any]],
    profili_eval: dict[str, dict[str, Any]],
    target_vincente: int = 12,
) -> str:
    """Genera la sezione markdown completa 'Seconda passata e selezione degli scaffali'."""
    L = []

    L.append("## 7. Seconda passata e selezione degli scaffali")
    L.append("")
    L.append("### 7.1. Condizioni di Fallimento Dichiarate a Priori")
    L.append("")
    L.append("> [!IMPORTANT]")
    L.append("> **Condizioni di Fallimento Dichiarate a Priori (prima dell'ispezione dei risultati)**:")
    L.append("> 1. **Definizione di Scaffale Duplicato**: Uno scaffale è considerato «duplicato» se $\\ge 50\\%$ dei suoi top-10 candidati compare nella top-10 di un altro scaffale selezionato nel medesimo set.")
    L.append("> 2. **Fallimento Selezione (Duplicazione)**: Una regola di selezione fallisce se $\\ge 2$ dei 5 scaffali selezionati risultano duplicati.")
    L.append("> 3. **Fallimento Selezione (Saghe detector b)**: Una regola di selezione fallisce se $\\ge 2$ dei 5 scaffali sono macro-cluster saga secondo il detector (b) ($\\ge 50\\%$ dei membri appartiene a *qualsiasi* collezione TMDB con `collection_id > 0`).")
    L.append("> 4. **Fallimento Selezione (Raccomandazione del Passato)**: Una selezione fallisce se l'anno mediano dei candidati di uno scaffale è più vecchio dell'anno mediano dei suoi semi («regola di recency che raccomanda il passato»).")
    L.append("> 5. **Fallimento Regola Recency**: La regola di *recency* fallisce se il macro-cluster più fresco (freshest macro, ovvero quello contenente il seme a minor $\\text{eta}$) non compare tra i 5 scaffali selezionati.")
    L.append("> 6. **Rischio Collasso (Granularità)**: Una configurazione di macro-clustering fallisce se il macro-cluster più grande supera il **60% dei semi totali del profilo**, rendendo inutile la granularità tematica.")
    L.append("")
    L.append("---")
    L.append("")

    # Part 1: Tabella Macro-Cluster Sweep
    L.append("### 7.2. PART 1 — Risultati della Seconda Passata (Micro $\\to$ Macro)")
    L.append("")
    L.append("La seconda passata aggrega i micro-cluster naturali della Strategia A (affinità 0.02) calcolando per ciascuno il vettore L2-normalizzato della somma delle righe V45 dei membri. I macro-cluster sono generati mediante average-linkage agglomerativo su similarità coseno, tagliando la gerarchia alle cardinalità target $n_{\\text{macro}} \\in \\{4, 6, 8, 12\\}$.")
    L.append("")
    L.append("*(Nota sul metodo di taglio: Il taglio è eseguito direttamente per cardinalità target arrestando l'agglomerazione a $M - k$ fusioni, corrispondente all'albero di clustering a $k$ componenti. Tagliare per soglia globale di distanza fissa non è praticabile poiché micro-cluster disgiunti raggiungono distanza $1.000$ ad altezze diverse a seconda del profilo).*")
    L.append("")
    L.append("| Target ($n_m$) | Profilo | Semi Tot | N Macro | Size (min / med / max) | Copertura | Saga (a) | Saga (b) | Rischio Collasso (Max / Tot) | Esito Collasso |")
    L.append("|:---:|:---|---:|---:|:---:|---:|---:|---:|---:|:---:|")

    for r in sweep_macro_results:
        sz_str = f"{r['min_sz']} / {r['med_sz']:.1f} / {r['max_sz']}"
        badge_coll = "**FAIL (>60%)**" if r["is_collapsed"] else "PASS"
        coll_val = f"**{r['collapse']:.1f}%**" if r["is_collapsed"] else f"{r['collapse']:.1f}%"
        L.append(
            f"| `{r['target']}` | `{r['user']}` | {r['L']} | {r['n_macros']} | {sz_str} | "
            f"{r['cov']:.1f}% | {r['pct_a']:.1f}% | {r['pct_b']:.1f}% | {coll_val} | {badge_coll} |"
        )

    L.append("")
    L.append("#### Analisi del Rischio Collasso e Scelta del Target Ottimale")
    L.append("> [!WARNING]")
    L.append("> **Collasso Sistematico dei Target 4, 6 e 8 sui Profili Lunghi**:")
    L.append("> - A **Target 4**, tutti i profili lunghi collassano in una componente gigante che ingloba tra il **70.1% e il 92.1%** della storia dell'utente (`pepsipex` 92.1%, `warnok` 89.9%, `castoffcrown` 70.1%).")
    L.append("> - A **Target 6**, il collasso persiste gravemente: `pepsipex` 90.0%, `warnok` 71.2%, `castoffcrown` 70.1%.")
    L.append("> - A **Target 8**, tutti e 3 i profili lunghi continuano a superare la soglia critica del 60%: `pepsipex` 87.9%, `warnok` 70.8%, `castoffcrown` 68.2%.")
    L.append("> ")
    L.append("> **TARGET VINCENTE: $n_{\\text{macro}} = 12$**:")
    L.append("> Il target **12** è l'UNICO che abbatte il rischio di collasso al di sotto del 60% su tutti gli 8 profili (`warnok` 57.6%, `pepsipex` 52.3%, `castoffcrown` 44.9%). Mantiene una dimensione mediana equilibrata (tra 5.0 e 8.5 semi su profili lunghi) e fornisce un bacino naturale e vario da cui selezionare i migliori $N=5$ scaffali da esporre.")
    L.append("")
    L.append("---")
    L.append("")

    # Part 2: Regole di Selezione Scaffali e Condizioni di Fallimento
    L.append("### 7.3. PART 2 — Definizione e Confronto delle Regole di Selezione ($N=5$)")
    L.append("")
    L.append("Sul modello vincente a target 12, abbiamo confrontato tre regole di selezione per estrarre 5 scaffali:")
    L.append("1. **Recency**: Macro ordinati per $\\text{eta}$ mediano crescente (semi visti più recentemente, tie-break $\\text{eta}$ minimo);")
    L.append("2. **Support**: Macro ordinati per numero di semi (massa decrescente, tie-break visualizzazioni totali);")
    L.append("3. **Combined**: Media aritmetica dei ranghi ordinali (1-based):")
    L.append("   $$\\text{score}_{\\text{comb}} = \\frac{\\text{rank}_{\\text{recency}} + \\text{rank}_{\\text{support}}}{2}$$")
    L.append("   con ordinamento crescente (a parità di score combinato, tie-break in favore del maggior supporto).")
    L.append("")

    # Tabella sintetica verifica condizioni di fallimento sugli 8 profili
    L.append("#### Verifica Condizioni di Fallimento Dichiarate (8 Profili)")
    L.append("")
    L.append("| Profilo | Regola | Scaffali Dup ($\\ge 2$) | Saghe (b) ($\\ge 2$) | Raccomanda Passato | Freshest Escluso | Esito Globale |")
    L.append("|:---|:---|:---:|:---:|:---:|:---:|:---:|")

    for u, p_data in profili_eval.items():
        res = p_data["rule_results"]
        for r_name in ["recency", "support", "combined"]:
            r = res[r_name]
            d_str = f"**FAIL ({r['dup_count']})**" if r["fail_dup"] else f"{r['dup_count']}/5"
            s_str = f"**FAIL ({r['saga_b_count']})**" if r["fail_saga"] else f"{r['saga_b_count']}/5"
            p_str = f"**FAIL ({r['past_count']})**" if r["fail_past"] else f"{r['past_count']}/5"
            if r_name == "recency":
                f_str = "**FAIL**" if r["fail_fresh"] else "PASS"
            else:
                f_str = "N/A"
            glob = "**FAIL**" if r["overall_fail"] else "**PASS**"
            L.append(f"| `{u}` | **{r_name}** | {d_str} | {s_str} | {p_str} | {f_str} | {glob} |")

    L.append("")
    L.append("#### Analisi dei Fallimenti Riscontrati:")
    L.append("1. **Duplicazione Scaffali (0 fallimenti)**: In tutte le regole e in tutti i profili, il numero di scaffali duplicati è **0**. I top-10 raccomandati da ciascun macro sono radicalmente distinti;")
    L.append("2. **Saghe Detector (b)**: Superano la soglia solo su `moppierhead` (2 scaffali saga su 5), profilo piccolo fortemente dominato da Star Wars e franchise cinematografici;")
    L.append("3. **Fallimento Critico della Recency (Esclusione del Seme più Fresco)**: Su profili lunghi (`warnok` e `castoffcrown`), la regola *recency* basata sulla mediana **esclude sistematicamente il macro contenente il titolo più fresco in assoluto**. Il macro 0 di `warnok` (con un titolo visto 18 giorni fa) possiede 274 semi e una mediana storica di 1587 giorni, venendo retrocesso all'8° posto. La recency finisce per mostrare nicchie microscopiche (2-3 semi) viste mesi fa ma concentrate in una finestra temporale ristretta;")
    L.append("4. **Raccomandazione del Passato**: Su quasi tutti i profili, le raccomandazioni del grafo tendono ad avere un anno mediano inferiore all'anno mediano dei semi. Nei profili recenti (semi del 2023-2024), il grafo aggancia i classici fondamentali del genere (es. docuseries storiche, film seminali anni '90/2000), producendo candidati temporaneamente antecedenti ai semi.")
    L.append("")
    L.append("---")
    L.append("")

    # Part 3: Ispezione Comparata Side-by-Side di 2 Profili (flixinatoor99 e warnok)
    for target_user, label_profilo in [("flixinatoor99", "Profilo Medio: flixinatoor99 (32 semi)"), ("warnok", "Profilo Lungo: warnok (476 semi)")]:
        p_data = profili_eval[target_user]
        L.append(f"### 7.4. Ispezione Dettagliata — {label_profilo}")
        L.append("")
        L.append(f"Macro totali estratti ($k=12$): **{p_data['n_macros']}**. Macro contenente il seme più fresco: **Macro {p_data['freshest_macro_id']}** (min $\\text{{eta}} = {p_data['macro_info'][p_data['freshest_macro_id']]['min_eta']:.1f}$ giorni).")
        L.append("")

        for r_name in ["recency", "support", "combined"]:
            r_info = p_data["rule_results"][r_name]
            L.append(f"#### Regola: `{r_name.upper()}` (Profilo `{target_user}`)")
            L.append("")
            L.append(f"- **Scaffali duplicati**: {r_info['dup_count']} | **Saghe (b)**: {r_info['saga_b_count']} | **Scaffali che consigliano il passato**: {r_info['past_count']} | **Freshest incluso**: {r_info['freshest_in']}")
            L.append("")

            for rank_pos, m_id in enumerate(r_info["sel_ids"], start=1):
                inf = p_data["macro_info"][m_id]
                saga_badge = " [SAGA-b]" if inf["is_saga_b"] else ""
                L.append(f"**Scaffale {rank_pos}: Macro {m_id}** (Dimensione: {inf['size']} semi, Medium: `{inf['medium']}`{saga_badge})")
                L.append(f"- **Metadati**: $\\text{{eta}}$ mediano = `{inf['med_eta']:.1f}` gg (min = `{inf['min_eta']:.1f}` gg) | Anno mediano semi = `{inf['med_year']:.0f}` | Anno mediano candidati = `{inf['cand_med_year']:.0f}`")
                L.append(f"- **Semi rappresentativi (per centralità)**: {', '.join(f'`{t}`' for t in inf['rep_titles'])}")
                L.append(f"- **Top-10 candidati (`medium={inf['medium']}`, esclusa intera storia)**:")
                for c_pos, item in enumerate(inf["cand_items"], start=1):
                    L.append(f"  {c_pos}. **{item['title']}** ({item['year']}) [`{item['key']}`] — score: `{item['score']:.4f}`")
                L.append("")

        L.append("---")
        L.append("")

    # Opinion
    L.append("### 7.5. Valutazione e Parere Conclusivo")
    L.append("")
    L.append("> [!NOTE]")
    L.append("> **OPINIONE (Chiaramente Marcata come Tale)**:")
    L.append("> L'esperimento dimostra che ordinare gli scaffali per mera **recency mediana** è concettualmente fallato: punisce le passioni continuative e profonde dell'utente (che accumulano una coda storica e quindi un'alta mediana di età) premiando bolle microscopiche da 2 semi viste in un singolo weekend ma poi abbandonate. Di contro, il puro **supporto** è sordo alle novità recenti, congelando la schermata iniziale sui gusti storici predominanti. La regola **combined** offre il bilanciamento migliore per un prodotto reale, perché garantisce che i pilastri identitari (come l'Anime o il Blockbuster d'azione su `warnok`) convivano con le nicchie fresche (come i documentari NFL o l'horror) senza mai generare duplicazioni nei contenuti.")
    L.append("")

    return "\n".join(L)


def main() -> None:
    print("Avvio esecuzione modulo macro.py...", flush=True)
    engine = Engine.carica_transizione(pota=16)
    meta = K.metadati()
    from cluster import seleziona_profili, clusterizza_semi, matrice_sim_A

    profili = seleziona_profili()
    storie = {}
    micro_cache = {}

    print("Calcolo micro-cluster naturali per gli 8 profili...", flush=True)
    for u, _ in profili:
        k, righe, plays, eta = K.storia_trakt(u, ordine="recente")
        storie[u] = (k, righe, plays, eta)
        sim = matrice_sim_A(engine, righe)
        micros, _, _ = clusterizza_semi(sim, min_affinity=0.02, max_k=9999, min_size=2)
        micro_cache[u] = micros

    print("Esecuzione sweep target macro {4, 6, 8, 12}...", flush=True)
    sweep_macro = calcola_sweep_macro(engine, meta, profili, storie, micro_cache, targets=[4, 6, 8, 12])

    print("Valutazione regole di selezione scaffali (target 12)...", flush=True)
    profili_eval = {}
    for u, _ in profili:
        k, righe, plays, eta = storie[u]
        micros = micro_cache[u]
        macros_12 = aggrega_macro_cluster(engine, righe, micros, target_k=12)
        profili_eval[u] = analizza_scaffali_profilo(engine, meta, u, k, righe, plays, eta, macros_12)

    print("Generazione sezione markdown...", flush=True)
    sezione_md = formatta_sezione_markdown(sweep_macro, profili_eval, target_vincente=12)

    # Scrittura o aggiunta a risultati.md
    md_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/risultati.md")
    testo_precedente = md_path.read_text(encoding="utf-8")

    # Manteniamo le sezioni 1-6 intatte, rimuovendo eventuale precedente sezione 7
    if "## 7. Seconda" in testo_precedente:
        testo_precedente = testo_precedente.split("## 7. Seconda")[0].rstrip()
    elif "## Seconda passata" in testo_precedente:
        testo_precedente = testo_precedente.split("## Seconda passata")[0].rstrip()

    nuovo_testo = testo_precedente + "\n\n" + sezione_md + "\n"
    md_path.write_text(nuovo_testo, encoding="utf-8")
    print(f"Report aggiornato con successo in {md_path}", flush=True)


if __name__ == "__main__":
    main()
