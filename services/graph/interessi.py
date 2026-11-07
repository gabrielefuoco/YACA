"""interessi.py — Servizio di clustering degli interessi e generazione scaffali per profilo.

PERCHÉ ESISTE.
Le raccomandazioni piatte o le partizioni monolitiche non riflettono la varietà dei consumi
di un utente. Questo modulo implementa la ricetta congelata a 12 passi (V45 / Ticket 05 & 08):
1. Matrice di affinità: similarità coseno sulle borse top-100 vicini nel grafo V45 non potato (W = M + M.T);
2. Micro-clustering: hierarchical agglomerative clustering (Average Linkage) a soglia di distanza 0.02;
3. Macro-merge: aggregazione agglomerativa sui centroidi micro con arresto rigido a tau = 0.03;
4. Staple-diet split: bisezione ricorsiva di qualsiasi macro > 40 semi (eliminazione delle diete monolitiche);
5. Unnameable rule: bisezione dei macro non nominabili > 12 semi; i gruppi <= 12 semi rimangono come fallback;
6. Adaptive floor: soglia minima variabile soglia = min(4, max(2, ceil(semi_clusterizzati / 4)));
7. Eligibility: ammissibilità se interesse nominato (tassonomia) o piccolo gruppo (fallback «Perché hai visto»);
8. Medium: separazione film/serie per scaffale con waiver sui cluster ultra-piccoli (< 3 semi);
9. Ordering display: Slot 1 = interesse più fresco (min_eta minimo), Slot 2..N ordinati per rango combinato;
10. Budget N = 6: speso in modo ingordo (greedy) massimizzando i semi scoperti (con 1 voce per etichetta,
    family dedupe e overlap Jaccard < 0.5);
11. Naming: tassonomia curata a 36 voci e fallback trasparente «Perché hai visto <2-3 semi>»;
12. Catalog ID: identificatore stabile legato al contenuto `yaca_<top_representative_tmdbId>_<medium>`.
"""
from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import scipy.sparse as sp
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

from graph import canon as K
from graph import provenance as _PV
from graph.runtime import Engine
from graph.tassonomia import TASSONOMIA_36, TaxonomyEntry, assegna_etichetta_cluster, valuta_cluster


# ==============================================================================
# MODELLO DATI DELLO SCAFFALE
# ==============================================================================

@dataclass
class Shelf:
    """Rappresentazione di uno scaffale personale di interesse qualificato."""
    catalog_id: str
    nome: str
    nome_fonte: str  # "tassonomia" | "perche_hai_visto"
    confidenza: float
    medium: str  # "movie" | "series"
    semi_rappresentativi: list[dict[str, Any]]
    semi_membri: list[dict[str, Any]]
    titoli: list[dict[str, Any]] = field(default_factory=list)
    slot_position: int = 0
    min_eta: float = 0.0
    r_comb: float = 0.0
    consistenza: float = 0.0
    size: int = 0
    matched_entry: str | None = None
    seeds_indices: list[int] = field(default_factory=list, repr=False)
    top10_cands: set[str] = field(default_factory=set, repr=False)
    dom_coll: int | None = field(default=None, repr=False)

    def attach_titoli(self, titoli: list[dict[str, Any]]) -> Shelf:
        """Attacca la lista dei titoli raccomandati restituiti dalla camminata."""
        self.titoli = list(titoli)
        return self


# ==============================================================================
# LAZY LOADING ARTEFATTI E METADATI AUSILIARI
# ==============================================================================

_MATRICE_AFFINITA_CACHE: sp.csr_matrix | None = None
_TMDB_EXTRA_INFO_CACHE: dict[str, dict[str, Any]] | None = None
_TFIDF_KW_CACHE: tuple[list[str], sp.csr_matrix] | None = None

NOISE_KEYWORDS: frozenset[str] = frozenset({"duringcreditsstinger", "aftercreditsstinger"})


def carica_matrice_affinita(path: str | Path | None = None) -> sp.csr_matrix:
    """Carica lazily l'artefatto compatto precalcolato dei top-100 vicini non potati (7.6M archi, ~62 MB RAM).

    PERCHÉ È FONDAMENTALE (TASK MEMORIA DOCKER 512 MiB):
    In precedenza, questo metodo caricava il triangolo grezzo V45 non potato da 37,2M archi
    ('bolle-eterogeneo-V45-p1.0-triangolo.npz') e materializzava a runtime la matrice simmetrica da
    74,4M archi, generando un picco RSS di 1.007,6 MB che portava all'OOM istantaneo nel container
    di produzione vincolato a `mem_limit: 512m` (docker-compose.yml:74).
    
    CONCETTO CHIAVE:
    Per calcolare l'affinità iniziale dei semi di un profilo (~500 titoli al massimo), non serve
    mai l'intera matrice da 74M archi: per ciascun seme servono esclusivamente i suoi top-100 vicini.
    L'artefatto precalcolato `services/graph/data/v45-vicini100/vicini-top100.npz` contiene esattamente
    queste liste per ciascuna delle 76.497 righe del canone (shape 76497x76497, nnz ~7,65M).
    Caricandolo, il picco RSS del clustering scende da 1.007,6 MB a ~307 MB (misurato su warnok e pepsipex),
    rientrando stabilmente entro la soglia di sicurezza di 400 MB e lasciando ampio margine nel container.

    REGOLA CRITICA (INVARIANTE ARCHITETTURALE):
    È SEVERAMENTE VIETATO reintrodurre o caricare 'bolle-eterogeneo-V45-p1.0-triangolo.npz' nel percorso
    di clustering. Questo metodo solleva ValueError esplicito se viene passato il percorso del triangolo.
    """
    global _MATRICE_AFFINITA_CACHE
    if _MATRICE_AFFINITA_CACHE is not None:
        return _MATRICE_AFFINITA_CACHE

    if path is not None:
        p_str = str(path).replace("\\", "/")
        if "bolle-eterogeneo-V45-p1.0-triangolo.npz" in p_str:
            raise ValueError(
                "VIOLAZIONE ARCHITETTURALE: È severamente vietato caricare 'bolle-eterogeneo-V45-p1.0-triangolo.npz' "
                "nel clustering. Genera un picco RSS di 1.007,6 MB violando il vincolo mem_limit: 512m "
                "del container. Usare esclusivamente l'artefatto compatto precalcolato dei top-100 vicini "
                "('services/graph/data/v45-vicini100/vicini-top100.npz')."
            )
        cand_p = Path(path)
    else:
        cartella = Path(__file__).resolve().parent / "data" / "v45-vicini100"
        cand_p = cartella / "vicini-top100.npz"
        if not cand_p.is_file():
            files = sorted(cartella.glob("*.npz")) if cartella.is_dir() else []
            if files:
                cand_p = files[0]
            else:
                raise FileNotFoundError(
                    f"Artefatto top-100 vicini non trovato in {cartella}. "
                    "Eseguire prima: 'PYTHONPATH=services py -m graph.runtime.prepara --target vicini'."
                )

    if not cand_p.is_file():
        raise FileNotFoundError(f"Artefatto vicini non trovato: {cand_p}")

    W, prov = _PV.leggi(cand_p)
    if W.shape[0] != 76497:
        raise ValueError(f"Dimensione canone errata per vicini: atteso 76497, trovato {W.shape[0]}")

    # Verifica che la matrice sia effettivamente un vicinato top-100 (degree <= 100 per riga)
    diffs = np.diff(W.indptr)
    if (diffs > 100).any():
        raise ValueError(
            f"Artefatto {cand_p} non rispetta il vincolo top-100 vicini: "
            f"massimo grado per riga trovato = {int(diffs.max())}"
        )

    _MATRICE_AFFINITA_CACHE = W
    return W


def _carica_tmdb_extra() -> dict[str, dict[str, Any]]:
    """Carica lazily metadati linguistici e geografici da Parquet TMDB se presenti."""
    global _TMDB_EXTRA_INFO_CACHE
    if _TMDB_EXTRA_INFO_CACHE is not None:
        return _TMDB_EXTRA_INFO_CACHE

    extra_info: dict[str, dict[str, Any]] = {}
    tmdb_dir = Path(".cache/tmdb")
    if tmdb_dir.is_dir():
        for fn, tipo, id_col in [
            ("movies.parquet", "movie", "id"),
            ("tv.parquet", "tv", "id"),
            ("anime-extra-movies.parquet", "movie", "id"),
            ("anime-extra-tv.parquet", "tv", "id"),
        ]:
            p = tmdb_dir / fn
            if p.is_file():
                try:
                    import pandas as pd
                    df = pd.read_parquet(p, columns=[id_col, "original_language", "production_countries"])
                    for row in df.itertuples(index=False):
                        rd = row._asdict()
                        k_item = f"{tipo}:{int(rd[id_col])}"
                        p_c = rd.get("production_countries")
                        c_code = None
                        if p_c and isinstance(p_c, str):
                            try:
                                p_list = json.loads(p_c)
                                if isinstance(p_list, list) and p_list:
                                    c_code = p_list[0].get("iso_3166_1")
                            except Exception:
                                pass
                        extra_info[k_item] = {
                            "orig_lang": rd.get("original_language"),
                            "orig_country": c_code,
                        }
                except Exception:
                    pass

    _TMDB_EXTRA_INFO_CACHE = extra_info
    return extra_info


def _carica_tfidf_keywords() -> tuple[list[str], sp.csr_matrix] | None:
    """Carica lazily il vocabolario e la matrice TF-IDF delle keyword se presenti."""
    global _TFIDF_KW_CACHE
    if _TFIDF_KW_CACHE is not None:
        return _TFIDF_KW_CACHE

    vocab_p = Path("services/graph_dense/data/graph/05-vocab.json")
    tfidf_p = Path("services/graph_dense/data/graph/05-tfidf.npz")
    if vocab_p.is_file() and tfidf_p.is_file():
        try:
            with open(vocab_p, encoding="utf-8") as f:
                V = json.load(f)
            kw_items = [(t.split(":", 1)[1], c) for t, c in V.items() if t.startswith("kw:")]
            kw_names = [x[0] for x in kw_items]
            kw_cols = [x[1] for x in kw_items]
            X = sp.load_npz(tfidf_p).tocsr()
            X_kw = X[:, kw_cols].tocsr()
            _TFIDF_KW_CACHE = (kw_names, X_kw)
            return _TFIDF_KW_CACHE
        except Exception:
            pass

    return None


# ==============================================================================
# FUNZIONI CORE PER AFFINITÀ, CLUSTERING E BISEZIONE
# ==============================================================================

def calcola_adaptive_floor(n_semi_clusterizzati: int) -> int:
    """Calcola la soglia minima adattiva: min(4, max(2, ceil(semi_clusterizzati / 4)))."""
    if n_semi_clusterizzati <= 0:
        return 2
    return min(4, max(2, math.ceil(n_semi_clusterizzati / 4)))


def jaccard(s1: set, s2: set) -> float:
    """Coefficiente di Jaccard tra due insiemi di chiavi."""
    if not s1 and not s2:
        return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / float(u) if u > 0 else 0.0


def calcola_sim_affinity(righe: np.ndarray, W: sp.csr_matrix) -> np.ndarray:
    """Step 1: Calcola la matrice di affinità coseno sulle borse top-100 vicini non potati."""
    n = len(righe)
    if n < 2:
        return np.eye(n, dtype=np.float32)

    n_canon = W.shape[0]
    rows_list: list[np.ndarray] = []
    cols_list: list[np.ndarray] = []
    data_list: list[np.ndarray] = []

    for i, r in enumerate(righe):
        s, e = W.indptr[r], W.indptr[r + 1]
        c_r = W.indices[s:e]
        v_r = W.data[s:e]
        if len(c_r) <= 100:
            top_cols = c_r
            top_vals = v_r
        else:
            top_idx = np.argpartition(-v_r, 100)[:100]
            top_cols = c_r[top_idx]
            top_vals = v_r[top_idx]

        k_len = len(top_cols)
        if k_len > 0:
            rows_list.append(np.full(k_len, i, dtype=np.int32))
            cols_list.append(top_cols.astype(np.int32, copy=False))
            data_list.append(top_vals.astype(np.float32, copy=False))

    if rows_list:
        rows_arr = np.concatenate(rows_list)
        cols_arr = np.concatenate(cols_list)
        data_arr = np.concatenate(data_list)
    else:
        rows_arr = np.empty(0, dtype=np.int32)
        cols_arr = np.empty(0, dtype=np.int32)
        data_arr = np.empty(0, dtype=np.float32)

    B = sp.csr_matrix((data_arr, (rows_arr, cols_arr)), shape=(n, n_canon), dtype=np.float32)
    norms = np.array(np.sqrt(B.multiply(B).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    B_norm = sp.diags(1.0 / norms) @ B
    S = (B_norm @ B_norm.T).toarray()
    np.fill_diagonal(S, 1.0)
    return np.clip(S, 0.0, 1.0)


def micro_clustering(sim: np.ndarray, min_affinity: float = 0.02) -> tuple[list[list[int]], list[int]]:
    """Step 2: Linkage gerarchico Average Linkage a soglia 0.02, min_size >= 2."""
    n = sim.shape[0]
    if n < 2:
        return [], list(range(n))

    sim_off = sim - np.eye(n)
    max_sim = np.max(sim_off, axis=1)
    connected = [i for i in range(n) if max_sim[i] >= min_affinity]
    isolated = [i for i in range(n) if max_sim[i] < min_affinity]

    if len(connected) < 2:
        return [], list(range(n))

    sub_sim = sim[np.ix_(connected, connected)]
    d = np.clip(1.0 - sub_sim, 0.0, 1.0)
    np.fill_diagonal(d, 0.0)

    Z = linkage(squareform(d), method="average")
    raw_labels = fcluster(Z, t=1.0 - min_affinity, criterion="distance")

    label_to_members: dict[int, list[int]] = {}
    for local_idx, label in enumerate(raw_labels):
        global_idx = connected[local_idx]
        label_to_members.setdefault(label, []).append(global_idx)

    valid = [members for members in label_to_members.values() if len(members) >= 2]
    singletons = [members[0] for members in label_to_members.values() if len(members) < 2]

    valid.sort(key=len, reverse=True)
    unclustered = sorted(isolated + singletons)
    return valid, unclustered


def macro_merge(
    engine: Engine,
    righe: np.ndarray,
    micros: list[list[int]],
    tau: float = 0.03,
) -> list[list[int]]:
    """Step 3: Aggregazione agglomerativa dei centroidi micro con arresto a tau = 0.03."""
    m = len(micros)
    if m <= 1:
        return [list(c) for c in micros]

    V = engine.Tr[righe, :]
    norms = np.array(np.sqrt(V.multiply(V).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    V_norm = sp.diags(1.0 / norms) @ V

    c_vecs = []
    for c in micros:
        v_c = np.array(V_norm[c, :].sum(axis=0)).ravel()
        norm_c = np.linalg.norm(v_c)
        if norm_c == 0:
            norm_c = 1.0
        c_vecs.append(v_c / norm_c)
    C_norm = np.array(c_vecs)

    S = C_norm @ C_norm.T
    d = np.clip(1.0 - S, 0.0, 1.0)
    np.fill_diagonal(d, 0.0)

    Z = linkage(squareform(d), method="average")
    labels = fcluster(Z, t=1.0 - tau, criterion="distance")

    groups: dict[int, list[int]] = {}
    for micro_idx, lbl in enumerate(labels):
        groups.setdefault(lbl, []).append(micro_idx)

    macros = []
    for micro_indices in groups.values():
        m_seeds: list[int] = []
        for mi in micro_indices:
            m_seeds.extend(micros[mi])
        macros.append(m_seeds)

    macros.sort(key=len, reverse=True)
    return macros


def bisect_cluster(engine: Engine, righe: np.ndarray, cluster_indices: list[int]) -> tuple[list[int], list[int]]:
    """Bisezione deterministica di un cluster sulla propria struttura coseno interna."""
    if len(cluster_indices) < 2:
        return list(cluster_indices), []
    sub_righe = righe[cluster_indices]
    V = engine.Tr[sub_righe, :]
    norms = np.array(np.sqrt(V.multiply(V).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    V_norm = sp.diags(1.0 / norms) @ V
    S = (V_norm @ V_norm.T).toarray()
    d = np.clip(1.0 - S, 0.0, 1.0)
    np.fill_diagonal(d, 0.0)

    Z = linkage(squareform(d), method="average")
    labels = fcluster(Z, t=2, criterion="maxclust")
    c1 = [cluster_indices[i] for i in range(len(cluster_indices)) if labels[i] == 1]
    c2 = [cluster_indices[i] for i in range(len(cluster_indices)) if labels[i] == 2]

    # Fallback deterministico nel caso degenere in cui un lato sia vuoto
    if len(c1) == 0 or len(c2) == 0:
        half = len(cluster_indices) // 2
        c1 = cluster_indices[:half]
        c2 = cluster_indices[half:]
    return c1, c2


# ==============================================================================
# STEP 1 - 8: GENERAZIONE DEI CLUSTER AMMISSIBILI
# ==============================================================================

def clusters(
    engine: Engine,
    righe: Sequence[int] | np.ndarray,
    medium: str | None = None,
    eta: Sequence[float] | None = None,
    plays: Sequence[float] | None = None,
    W_aff: sp.csr_matrix | None = None,
) -> list[Shelf]:
    """Genera la lista completa dei cluster/scaffali ammissibili (Steps 1-8 della ricetta).

    Args:
        engine: Istanza di Engine caricata (camminata PPR su grafo potato).
        righe: Indici di riga canonici dei semi nel grafo.
        medium: Filtro medium opzionale ("movie", "series", o None per entrambi).
        eta: Giorni trascorsi dall'interazione per ciascun seme (opzionale, default 0.0).
        plays: Numero di visualizzazioni per ciascun seme (opzionale, default 1.0).
        W_aff: Matrice non potata opzionale (se None, caricata lazily via `carica_matrice_affinita`).

    Returns:
        Lista di `Shelf` ammissibili (size >= floor, medium conforme, etichettati).
    """
    righe_arr = np.asarray(righe, dtype=np.int64)
    n_seeds = len(righe_arr)
    if n_seeds == 0:
        return []

    eta_arr = np.asarray(eta, dtype=np.float64) if eta is not None else np.zeros(n_seeds, dtype=np.float64)
    plays_arr = np.asarray(plays, dtype=np.float64) if plays is not None else np.ones(n_seeds, dtype=np.float64)

    # 1. Matrice di affinità
    if W_aff is None:
        W_aff = carica_matrice_affinita()
    S = calcola_sim_affinity(righe_arr, W_aff)

    # 2. Micro-clustering
    micros, _ = micro_clustering(S, min_affinity=0.02)
    if not micros:
        return []

    # 3. Macro-merge
    raw_macros = macro_merge(engine, righe_arr, micros, tau=0.03)

    # Conteggio semi clusterizzati per floor adattivo
    clustered_seeds = set(idx for m in raw_macros for idx in m)
    floor = calcola_adaptive_floor(len(clustered_seeds))

    # Carica metadati canone
    meta = K.metadati()
    coll = meta.get("COLL")
    anime_flags = meta.get("ANIME")
    adult_flags = meta.get("ADULTO")
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    extra_info = _carica_tmdb_extra()
    kw_tuple = _carica_tfidf_keywords()
    kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

    def get_member_kws(r_idx: int) -> set[str]:
        if X_kw is None:
            return set()
        s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
        cols = X_kw.indices[s:e]
        return set(kw_names[c] for c in cols if kw_names[c] not in NOISE_KEYWORDS)

    def build_evidence(m_indices: list[int]) -> tuple[dict[str, Any], str]:
        sz = len(m_indices)
        m_rows = righe_arr[m_indices]
        m_keys = [engine.keys[r] for r in m_rows]
        media_list = ["series" if k.startswith("tv:") else "movie" for k in m_keys]
        c_med = Counter(media_list)

        if c_med["series"] > c_med["movie"]:
            m_med = "series"
        elif c_med["movie"] > c_med["series"]:
            m_med = "movie"
        else:
            best_idx = max(m_indices, key=lambda idx: (plays_arr[idx], -eta_arr[idx]))
            m_med = "series" if m_keys[m_indices.index(best_idx)].startswith("tv:") else "movie"

        anime_pct = float(anime_flags[m_rows].mean()) if anime_flags is not None else 0.0
        adult_pct = float(adult_flags[m_rows].mean()) if adult_flags is not None else 0.0
        m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        repr_seeds = [str(titles[righe_arr[idx]]) for idx in m_sorted[:3]]

        ev = {
            "size": sz,
            "medium": m_med,
            "anime_pct": anime_pct,
            "adult_pct": adult_pct,
            "member_kws": [get_member_kws(r) for r in m_rows],
            "languages": Counter(extra_info.get(m_keys[i], {}).get("orig_lang") for i in range(sz) if extra_info.get(m_keys[i], {}).get("orig_lang")),
            "countries": Counter(extra_info.get(m_keys[i], {}).get("orig_country") for i in range(sz) if extra_info.get(m_keys[i], {}).get("orig_country")),
            "repr_seeds": repr_seeds,
            "is_piccolo": sz < 3,
        }
        return ev, m_med

    # Step 4 & 5: Staple Diet Split (>40) + Unnameable Rule (>12)
    def eval_macro(m_indices: list[int]) -> list[dict[str, Any]]:
        sz = len(m_indices)
        # Step 4: Staple-diet split: any macro > 40 is bisected recursively
        if sz > 40:
            c1, c2 = bisect_cluster(engine, righe_arr, m_indices)
            return eval_macro(c1) + eval_macro(c2)

        ev, macro_med = build_evidence(m_indices)
        nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(ev)

        if nome_fonte == "tassonomia":
            if sz >= floor:
                return [{
                    "seeds": m_indices,
                    "size": sz,
                    "medium": macro_med,
                    "nome": nome_base,
                    "nome_fonte": nome_fonte,
                    "conf": conf,
                    "matched_entry": matched_entry.nome if matched_entry else None,
                }]
            return []
        else:
            # Step 5: Unnameable rule (>12 bisected, <= 12 stays as fallback)
            if sz > 12:
                c1, c2 = bisect_cluster(engine, righe_arr, m_indices)
                return eval_macro(c1) + eval_macro(c2)
            else:
                if sz >= floor:
                    return [{
                        "seeds": m_indices,
                        "size": sz,
                        "medium": macro_med,
                        "nome": nome_base,
                        "nome_fonte": nome_fonte,
                        "conf": conf,
                        "matched_entry": None,
                    }]
                return []

    eligible_raw: list[dict[str, Any]] = []
    for m in raw_macros:
        eligible_raw.extend(eval_macro(m))

    # Filtro o split per medium se richiesto
    shelves: list[Shelf] = []
    for item in eligible_raw:
        if medium and item["medium"] != medium:
            continue

        m_indices = item["seeds"]
        m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        top_seed_idx = m_sorted[0]
        top_row = righe_arr[top_seed_idx]
        top_key = engine.keys[top_row]
        top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row

        catalog_id = f"yaca_{top_tmdb_id}_{item['medium']}"

        # Dominant collection
        dom_coll = None
        if coll is not None:
            c_coll = coll[righe_arr[m_indices]]
            pos = [x for x in c_coll if x > 0]
            if pos:
                dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
                if (dom_cnt / len(m_indices)) >= 0.5:
                    dom_coll = int(dom_cid)

        semi_rappresentativi = []
        for idx in m_sorted[:3]:
            r = righe_arr[idx]
            k_seme = engine.keys[r]
            semi_rappresentativi.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": "series" if k_seme.startswith("tv:") else "movie",
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None else 0,
                "plays": float(plays_arr[idx]),
                "eta_giorni": float(eta_arr[idx]),
            })

        semi_membri = []
        for idx in m_indices:
            r = righe_arr[idx]
            k_seme = engine.keys[r]
            semi_membri.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": "series" if k_seme.startswith("tv:") else "movie",
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None else 0,
            })

        sh = Shelf(
            catalog_id=catalog_id,
            nome=item["nome"],
            nome_fonte=item["nome_fonte"],
            confidenza=round(float(item["conf"]), 3),
            medium=item["medium"],
            semi_rappresentativi=semi_rappresentativi,
            semi_membri=semi_membri,
            size=item["size"],
            min_eta=float(min(eta_arr[idx] for idx in m_indices)),
            matched_entry=item["matched_entry"],
            seeds_indices=m_indices,
            dom_coll=dom_coll,
        )
        shelves.append(sh)

    return shelves


# ==============================================================================
# STEP 9 - 10: SELEZIONE GREEDY SUL BUDGET N ED ORDINAMENTO DISPLAY
# ==============================================================================

def scaffali(
    engine: Engine,
    semi: Sequence[Any],
    n: int = 6,
    medium: str | None = None,
    W_aff: sp.csr_matrix | None = None,
) -> list[Shelf]:
    """Genera gli scaffali serviti per il profilo spendendo il budget N per copertura (Steps 9-10).

    Args:
        engine: Istanza dell'Engine per calcolo raccomandazioni.
        semi: Lista di semi (possono essere dict TMDB, stringhe key o interi riga).
        n: Budget massimo di scaffali da servire (default 6).
        medium: Filtro medium opzionale ("movie", "series").
        W_aff: Matrice non potata opzionale per l'affinità.

    Returns:
        Lista di al più `n` oggetti `Shelf` ordinati per esposizione UI.
    """
    if not semi:
        return []

    # Risoluzione indici e metadati
    righe: list[int] = []
    eta_list: list[float] = []
    plays_list: list[float] = []
    chiavi: list[str] = []

    for idx, s in enumerate(semi):
        r_idx = None
        s_eta = float(idx)  # Fallback: ordine della sequenza
        s_plays = 1.0

        if isinstance(s, int):
            r_idx = s
        elif isinstance(s, str):
            r_idx = engine.row_of.get(s)
        elif isinstance(s, dict):
            k = s.get("key")
            if not k:
                tid = s.get("tmdbId") or s.get("tmdb_id")
                med = s.get("medium")
                if tid is not None:
                    pref = "tv" if med in ("tv", "series") else "movie"
                    k = f"{pref}:{int(tid)}"
            if k:
                r_idx = engine.row_of.get(k)
            s_eta = float(s.get("eta_giorni", s.get("eta", s.get("min_eta", idx))))
            s_plays = float(s.get("plays", 1.0))

        if r_idx is not None and 0 <= r_idx < engine.n:
            righe.append(r_idx)
            eta_list.append(s_eta)
            plays_list.append(s_plays)
            chiavi.append(engine.keys[r_idx])

    if not righe:
        return []

    righe_arr = np.asarray(righe, dtype=np.int64)

    # 1. Ottieni tutti i cluster ammissibili (Steps 1-8)
    eligible = clusters(
        engine,
        righe=righe_arr,
        medium=medium,
        eta=eta_list,
        plays=plays_list,
        W_aff=W_aff,
    )
    if not eligible:
        return []

    # 2. Precalcola top-10 raccomandazioni e consistenza per ciascuno scaffale
    seed_top10_cache: dict[tuple[str, str], set[str]] = {}

    def get_seed_top10(s_idx: int, med: str) -> set[str]:
        ckey = (chiavi[s_idx], med)
        if ckey not in seed_top10_cache:
            racs = engine.raccomanda([{"key": chiavi[s_idx], "tipo": "watched", "peso": 1.0}], cap=10, medium=med, esclusi=chiavi)
            seed_top10_cache[ckey] = set(r["key"] for r in racs[:10])
        return seed_top10_cache[ckey]

    for sh in eligible:
        sz = len(sh.seeds_indices)
        top10_members = [get_seed_top10(i, sh.medium) for i in sh.seeds_indices]
        pairs = [jaccard(top10_members[i], top10_members[j]) for i in range(sz) for j in range(i + 1, sz)]
        sh.consistenza = round(float(np.mean(pairs)), 4) if pairs else 0.0

        semi_rac = [
            {"key": chiavi[i], "tipo": "watched", "peso": 1.0}
            for i in sh.seeds_indices
        ]
        racs = engine.raccomanda(semi_rac, cap=10, medium=sh.medium, esclusi=chiavi)
        sh.top10_cands = set(r["key"] for r in racs[:10])
        sh.titoli = racs[:10]

    # Precalcolo ranghi per combined rank display
    eligible.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(eligible):
        item._r_rec = r_idx + 1

    eligible.sort(key=lambda x: (-x.size, -x.consistenza))
    for r_idx, item in enumerate(eligible):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    # Step 10: Selezione Greedy per Budget N
    chosen: list[Shelf] = []
    covered_seeds: set[int] = set()
    seen_tax_labels: set[str] = set()
    seen_colls: set[int] = set()

    while len(chosen) < n:
        best_cand: Shelf | None = None
        best_key: tuple[int, float, float] | None = None

        for cand in eligible:
            if cand in chosen:
                continue
            # (a) Al massimo 1 scaffale per etichetta tassonomica nel profilo
            if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax_labels:
                continue
            # (b) Family dedupe
            if cand.dom_coll is not None and cand.dom_coll in seen_colls:
                continue
            # (c) Overlap dedupe (Jaccard < 0.5 sui top-10 raccomandati)
            if any(jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen):
                continue

            uncovered_added = len(set(cand.seeds_indices) - covered_seeds)
            if uncovered_added <= 0:
                continue

            cand_key = (uncovered_added, -cand.min_eta, cand.consistenza)
            if best_cand is None or cand_key > best_key:
                best_cand = cand
                best_key = cand_key

        if best_cand is None:
            break

        chosen.append(best_cand)
        covered_seeds.update(best_cand.seeds_indices)
        if best_cand.nome_fonte == "tassonomia":
            seen_tax_labels.add(best_cand.nome)
        if best_cand.dom_coll is not None:
            seen_colls.add(best_cand.dom_coll)

    if not chosen:
        return []

    # Step 9: Ordinamento per esposizione UI (Slot 1 = freshest, Slot 2..N = r_comb)
    best_freshest = min(chosen, key=lambda x: (x.min_eta, x.r_comb))
    rem = [c for c in chosen if id(c) != id(best_freshest)]
    rem.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
    ordered_shelves = [best_freshest] + rem

    for slot_idx, sh in enumerate(ordered_shelves, 1):
        sh.slot_position = slot_idx

    return ordered_shelves
