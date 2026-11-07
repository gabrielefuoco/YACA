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
from collections import Counter, defaultdict
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
# COSTANTI DI QUALITY-GATING E SOGLIE PROFILO
# ==============================================================================

# Soglia minima di qualità (ratio tra top-1 controparte e top-1 primario) per ammettere
# una riga di controparte dell'altro medium (GAP 4).
# Adottata deliberatamente permissiva (tau = 2.5%): blocca solo ciò che è chiaramente
# slegato (es. «Classici d'autore -> The Confession Tapes / American Gigolo» a 2.01%),
# preservando associazioni valide cross-medium come Marvel -> Peacemaker (4.34%),
# animazione -> Dragons (18.12%), horror -> Ash vs Evil Dead (25.98%).
# Costo misurato di un eventuale inasprimento futuro:
#   - a tau = 3.0%: 89 righe totali (invariato rispetto a 2.5% sui 10 profili)
#   - a tau = 4.5%: si perde Cinecomic -> Peacemaker su warnok (scende a 15 righe su warnok, 88 tot)
#   - a tau = 5.0%: si perde Cinecomic -> Peacemaker (88 righe tot)
#   - a tau = 10.0%: si scende a 85 righe tot
#   - a tau = 20.0%: si scende a 80 righe tot (perdita controparti horror/crime)
TAU_CONTROPARTE: float = 0.025  # 2.5% permissiva

# Soglia sotto la quale l'intero profilo ha meno semi del floor di scaffali (n=8).
# In questi profili ultra-corti (GAP 3, es. carverclan con 7 semi o test con singolo seme),
# un cluster con 1+ semi omogenei per medium può essere servito come riga, purché ogni membro
# e ogni candidato raccomandato sia rigorosamente di quel medium.
TINY_PROFILE_FLOOR: int = 8



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
    nome_display: str | None = None
    slot_position: int = 0
    min_eta: float = 0.0
    r_comb: float = 0.0
    consistenza: float = 0.0
    size: int = 0
    matched_entry: str | None = None
    seeds_indices: list[int] = field(default_factory=list, repr=False)
    top10_cands: set[str] = field(default_factory=set, repr=False)
    dom_coll: int | None = field(default=None, repr=False)
    _other_indices: list[int] = field(default_factory=list, repr=False)
    _ratio: float = field(default=0.0, repr=False)

    def __post_init__(self) -> None:
        if self.nome_display is None:
            self.nome_display = self.nome

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
        global _MATRICE_AFFINITA_CACHE
        if _MATRICE_AFFINITA_CACHE is not None:
            return _MATRICE_AFFINITA_CACHE
        cartella = Path(__file__).resolve().parent / "data" / "v45-vicini100"
        cand_p = cartella / "vicini-top100.npz"
        if not cand_p.is_file():
            files = sorted(cartella.glob("*.npz")) if cartella.is_dir() else []
            if files:
                cand_p = files[0]
            else:
                raise FileNotFoundError(
                    "Artefatto vicini mancante: vicini-top100.npz. "
                    "Rigenerare con: PYTHONPATH=services python -m graph.runtime.prepara --target vicini"
                )

    if not cand_p.is_file():
        raise FileNotFoundError(
            "Artefatto vicini mancante: vicini-top100.npz. "
            "Rigenerare con: PYTHONPATH=services python -m graph.runtime.prepara --target vicini"
        )

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
    is_tiny_profile = n_seeds < TINY_PROFILE_FLOOR

    if not micros:
        if is_tiny_profile:
            # Profilo minuscolo (GAP 3, es. test con singolo seme): ciascun seme forma un micro-gruppo
            raw_macros = [[i] for i in range(n_seeds)]
        else:
            return []
    else:
        # 3. Macro-merge
        raw_macros = macro_merge(engine, righe_arr, micros, tau=0.03)

    # Conteggio semi clusterizzati per floor adattivo
    clustered_seeds = set(idx for m in raw_macros for idx in m)
    floor = calcola_adaptive_floor(len(clustered_seeds))
    # Regola GAP 3: quando l'intero profilo ha meno semi del floor di scaffali,
    # un cluster di 1+ semi omogenei per medium può essere servito come riga.
    min_cluster_size = 1 if is_tiny_profile else floor

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
            if sz >= min_cluster_size:
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
                if sz >= min_cluster_size:
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

    # Filtro o split per medium se richiesto con omogeneità rigorosa (nessuna eccezione)
    tassonomia_map = {e.nome: e for e in TASSONOMIA_36}
    shelves: list[Shelf] = []
    for item in eligible_raw:
        # Separa i semi per medium in modo rigoroso: ogni riga servita deve avere membri
        # rigorosamente omogenei rispetto al proprio medium (nessuna eccezione).
        raw_mov = [idx for idx in item["seeds"] if not engine.keys[righe_arr[idx]].startswith("tv:")]
        raw_ser = [idx for idx in item["seeds"] if engine.keys[righe_arr[idx]].startswith("tv:")]

        candidati_media: list[tuple[str, list[int], list[int]]] = []
        if medium == "movie":
            candidati_media = [("movie", raw_mov, raw_ser)]
        elif medium == "series":
            candidati_media = [("series", raw_ser, raw_mov)]
        else:
            # Policy P2 (Conditional): se il cluster possiede semi nel medium e raggiunge la dimensione minima
            candidati_media = [("movie", raw_mov, raw_ser), ("series", raw_ser, raw_mov)]

        for m_type, raw_indices, other_indices in candidati_media:
            if len(raw_indices) < min_cluster_size:
                continue

            m_indices = raw_indices

            # Filtro semi esclusi se il cluster ha un'etichetta tassonomica con clausole di esclusione
            entry_obj = tassonomia_map.get(item["nome"])
            if entry_obj and (entry_obj.excluded_keywords or entry_obj.excluded_languages):
                pruned_indices = []
                for s_idx in m_indices:
                    r = righe_arr[s_idx]
                    k_seme = engine.keys[r]
                    kws = get_member_kws(r)
                    lang = extra_info.get(k_seme, {}).get("orig_lang")
                    if entry_obj.excluded_languages and lang in entry_obj.excluded_languages:
                        continue
                    if entry_obj.excluded_keywords and any(k in entry_obj.excluded_keywords for k in kws):
                        continue
                    pruned_indices.append(s_idx)
                m_indices = pruned_indices

            if len(m_indices) < min_cluster_size:
                continue

            m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
            top_seed_idx = m_sorted[0]
            top_row = righe_arr[top_seed_idx]
            top_key = engine.keys[top_row]
            top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row

            catalog_id = f"yaca_{top_tmdb_id}_{m_type}"

            # Dominant collection
            dom_coll = None
            if coll is not None:
                c_coll = coll[righe_arr[m_indices]]
                pos = [x for x in c_coll if x > 0]
                if pos:
                    dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
                    if (dom_cnt / len(m_indices)) >= 0.5:
                        dom_coll = int(dom_cid)

            # Se il nome è un fallback 'Perché hai visto...', rigeneriamo il nome con i semi del medium specifico
            nome_scaffale = item["nome"]
            if item["nome_fonte"] == "perche_hai_visto":
                repr_titles = [str(titles[righe_arr[idx]]) for idx in m_sorted[:3]]
                if len(repr_titles) == 1:
                    nome_scaffale = f"Perché hai visto {repr_titles[0]}"
                elif len(repr_titles) == 2:
                    nome_scaffale = f"Perché hai visto {repr_titles[0]} e {repr_titles[1]}"
                elif len(repr_titles) >= 3:
                    nome_scaffale = f"Perché hai visto {repr_titles[0]}, {repr_titles[1]} e {repr_titles[2]}"

            semi_rappresentativi = []
            for idx in m_sorted[:3]:
                r = righe_arr[idx]
                k_seme = engine.keys[r]
                semi_rappresentativi.append({
                    "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                    "medium": m_type,
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
                    "medium": m_type,
                    "titolo": str(titles[r]) if titles is not None else k_seme,
                    "anno": int(years[r]) if years is not None else 0,
                })

            sh = Shelf(
                catalog_id=catalog_id,
                nome=nome_scaffale,
                nome_fonte=item["nome_fonte"],
                confidenza=round(float(item["conf"]), 3),
                medium=m_type,
                semi_rappresentativi=semi_rappresentativi,
                semi_membri=semi_membri,
                size=len(m_indices),
                min_eta=float(min(eta_arr[idx] for idx in m_indices)),
                matched_entry=item["matched_entry"],
                seeds_indices=m_indices,
                dom_coll=dom_coll,
                _other_indices=other_indices,
            )
            shelves.append(sh)

    return shelves


def unisci_cluster_tassonomia_identici(
    eligible: list[Shelf],
    righe_arr: np.ndarray,
    chiavi: list[str],
    plays_arr: np.ndarray,
    eta_arr: np.ndarray,
    cap: int = 40,
) -> list[Shelf]:
    """Unisce i cluster con identica etichetta tassonomica e medesimo medium prima del budget step, fino a cap.

    Args:
        eligible: Lista di scaffali candidati da clusters().
        righe_arr: Array degli indici di riga canonici per il profilo.
        chiavi: Lista delle chiavi item (es. 'movie:123', 'tv:456').
        plays_arr: Array dei play count per i semi.
        eta_arr: Array dei giorni di anzianità per i semi.
        cap: Dimensione massima ammessa per lo scaffale unito (default 40).

    Returns:
        Lista di scaffali con le etichette tassonomiche duplicate fuse fino a cap.
    """
    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    tax_groups: dict[tuple[str, str], list[Shelf]] = defaultdict(list)
    other_clusters: list[Shelf] = []

    for sh in eligible:
        if sh.nome_fonte == "tassonomia":
            tax_groups[(sh.nome, sh.medium)].append(sh)
        else:
            other_clusters.append(sh)

    merged: list[Shelf] = list(other_clusters)
    for (nome, m_med), sh_list in tax_groups.items():
        if len(sh_list) == 1:
            merged.append(sh_list[0])
            continue

        all_seeds: set[int] = set()
        for sh in sh_list:
            all_seeds.update(sh.seeds_indices)

        m_sorted = sorted(all_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        capped_seeds = m_sorted[:cap]

        top_s = capped_seeds[0]
        top_r = righe_arr[top_s]
        top_k = chiavi[top_s]
        top_tid = int(top_k.split(":")[1]) if ":" in top_k else top_r
        cat_id = f"yaca_{top_tid}_{m_med}"

        semi_rappresentativi = []
        for idx in capped_seeds[:3]:
            r = righe_arr[idx]
            k_seme = chiavi[idx]
            semi_rappresentativi.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": m_med,
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None else 0,
                "plays": float(plays_arr[idx]),
                "eta_giorni": float(eta_arr[idx]),
            })

        semi_membri = []
        for idx in capped_seeds:
            r = righe_arr[idx]
            k_seme = chiavi[idx]
            semi_membri.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": m_med,
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None else 0,
            })

        merged_sh = Shelf(
            catalog_id=cat_id,
            nome=nome,
            nome_fonte="tassonomia",
            confidenza=max(s.confidenza for s in sh_list),
            medium=m_med,
            semi_rappresentativi=semi_rappresentativi,
            semi_membri=semi_membri,
            size=len(capped_seeds),
            min_eta=min(eta_arr[idx] for idx in capped_seeds),
            matched_entry=sh_list[0].matched_entry,
            seeds_indices=capped_seeds,
            dom_coll=sh_list[0].dom_coll,
        )
        merged.append(merged_sh)

    return merged


# ==============================================================================
# STEP 9 - 10: SELEZIONE GREEDY SUL BUDGET N ED ORDINAMENTO DISPLAY
# ==============================================================================

def scaffali(
    engine: Engine,
    semi: Sequence[Any],
    n: int = 8,
    medium: str | None = None,
    W_aff: sp.csr_matrix | None = None,
    label_merge: bool = False,
    cap: int = 60,
    cand_cap: int | None = None,
    weighted_support: bool = True,
    esclusi: Sequence[str] | None = None,
    tono: float = 0.0,
    complessita: float = 0.0,
) -> list[Shelf]:
    """Genera gli scaffali serviti per il profilo spendendo il budget N per copertura (Steps 9-10).

    Args:
        engine: Istanza dell'Engine per calcolo raccomandazioni.
        semi: Lista di semi (possono essere dict TMDB, stringhe key o interi riga).
        n: Budget massimo di scaffali base da servire (default 8).
        medium: Filtro medium opzionale ("movie", "series").
        W_aff: Matrice non potata opzionale per l'affinità.
        label_merge: Se True, fonde i cluster con la stessa etichetta tassonomica prima del budget step.
        cap: Cap massimo di candidati per riga servita (default 60, ammessi tra 20 e cap).
        cand_cap: Alias esplicito per il cap dei candidati per riga (se None, usa cap).
        weighted_support: Se True, la selezione greedy e il rank supporto usano il peso/interazioni dei semi.
        esclusi: Lista di chiavi escluse dalle raccomandazioni.

    Returns:
        Lista di oggetti `Shelf` ordinati per esposizione UI (righe primarie + controparti ammesse).
    """
    if cand_cap is None:
        cand_cap = cap
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
    plays_arr = np.asarray(plays_list, dtype=np.float32)
    eta_arr = np.asarray(eta_list, dtype=np.float32)

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

    # Label-merge opzionale prima del budget step
    if label_merge:
        eligible = unisci_cluster_tassonomia_identici(
            eligible=eligible,
            righe_arr=righe_arr,
            chiavi=chiavi,
            plays_arr=plays_arr,
            eta_arr=eta_arr,
            cap=cap,
        )

    # 2. Calcolo consistenza intra-cluster via coseno gratuito da W_aff
    if W_aff is None:
        W_aff = carica_matrice_affinita()
    S = calcola_sim_affinity(righe_arr, W_aff)

    for sh in eligible:
        sz = len(sh.seeds_indices)
        if sz >= 2:
            sub = S[np.ix_(sh.seeds_indices, sh.seeds_indices)]
            iu = np.triu_indices(sz, k=1)
            sh.consistenza = round(float(np.mean(sub[iu])), 4)
        else:
            sh.consistenza = 0.0

    # Calcolo pesi semi per eventuale modalità weighted_support
    if weighted_support:
        nep_arr = engine.nep[righe_arr] if len(engine.nep) > 0 else np.ones(len(righe_arr))
        is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
        seed_weights = np.where(
            is_tv_arr & (nep_arr > 1.0),
            1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
            np.minimum(plays_arr, 3.0),
        )
        for sh in eligible:
            sh.weighted_support = float(sum(seed_weights[idx] for idx in sh.seeds_indices))

    # Precalcolo ranghi per combined rank display
    eligible.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(eligible):
        item._r_rec = r_idx + 1

    if weighted_support:
        eligible.sort(key=lambda x: (-getattr(x, "weighted_support", float(x.size)), -x.consistenza))
    else:
        eligible.sort(key=lambda x: (-x.size, -x.consistenza))

    for r_idx, item in enumerate(eligible):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    # Restringi ai candidati top-K per massa (proxy con catalogo identico verificato per budget n)
    K_tax = max(16, 2 * n)
    K_perche = max(8, n)
    tax_cands = [s for s in eligible if s.nome_fonte == "tassonomia"][:K_tax]
    perche_cands = [s for s in eligible if s.nome_fonte == "perche_hai_visto"][:K_perche]
    eligible_cands = tax_cands + perche_cands

    tutti_esclusi = set(chiavi) | set(esclusi or [])

    # ONE BATCHED WALK: prepara semi per tutti i candidati ammissibili (primari + controparti)
    # prima della selezione greedy, così top10_cands e titoli finali derivano dalla stessa camminata.
    batch_semi_primaries = [
        [
            {"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i]) if weighted_support else 1.0}
            for i in sh.seeds_indices
        ]
        for sh in eligible_cands
    ]
    batch_medium_primaries = [sh.medium for sh in eligible_cands]

    m_cands = len(eligible_cands)
    if medium is None:
        batch_semi_counterparts = [
            [
                {"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i]) if weighted_support else 1.0}
                for i in sh.seeds_indices
            ]
            for sh in eligible_cands
        ]
        batch_medium_counterparts = ["series" if sh.medium == "movie" else "movie" for sh in eligible_cands]
        all_batch_semi = batch_semi_primaries + batch_semi_counterparts
        all_batch_medium = batch_medium_primaries + batch_medium_counterparts
    else:
        all_batch_semi = batch_semi_primaries
        all_batch_medium = batch_medium_primaries

    # UNA sola esecuzione PPR batched per tutti i candidati ammissibili
    all_recs = engine.raccomanda_multi(
        all_batch_semi,
        cap=cand_cap,
        medium=all_batch_medium,
        esclusi=tutti_esclusi,
        tono=tono,
        complessita=complessita,
    )

    # Assegna titoli e top10_cands ai candidati direttamente dall'unico batched PPR
    for i, sh in enumerate(eligible_cands):
        sh.titoli = all_recs[i]
        sh.top10_cands = set(r["key"] for r in sh.titoli[:10])
        if medium is None:
            sh._recs_counterpart = all_recs[m_cands + i]

    # Step 10: Selezione Greedy Two-Tier per Budget N
    # Tier 1: Scaffali con etichetta tassonomica (nome_fonte == "tassonomia")
    # Tier 2: Scaffali di fallback «Perché hai visto» (nome_fonte == "perche_hai_visto")
    chosen: list[Shelf] = []
    covered_seeds: set[int] = set()
    seen_tax_labels: set[str] = set()
    seen_colls: set[int] = set()

    for tier_source in ("tassonomia", "perche_hai_visto"):
        if len(chosen) >= n:
            break

        while len(chosen) < n:
            best_cand: Shelf | None = None
            best_key: tuple[float, float, float] | None = None

            for cand in eligible_cands:
                if cand.nome_fonte != tier_source:
                    continue
                if any(c is cand for c in chosen):
                    continue
                # (a) Al massimo 1 scaffale per etichetta tassonomica nel profilo
                if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax_labels:
                    continue
                # (b) Family dedupe
                if cand.dom_coll is not None and cand.dom_coll in seen_colls:
                    continue

                uncovered_set = set(cand.seeds_indices) - covered_seeds
                if not uncovered_set:
                    continue

                if weighted_support:
                    uncovered_score = float(sum(seed_weights[i] for i in uncovered_set))
                else:
                    uncovered_score = float(len(uncovered_set))

                cand_key = (uncovered_score, -cand.min_eta, cand.consistenza)
                if best_cand is not None and cand_key <= best_key:
                    continue

                # (c) Overlap dedupe immediato sui top10_cands già materializzati
                if any(jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen):
                    continue

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

    # Step 9: Ordinamento per esposizione UI:
    # Slot 1 = freshest named shelf, il resto dei named per r_comb;
    # gli scaffali senza nome («Perché hai visto»), se presenti, vanno in coda (ordinati per r_comb).
    named_shelves = [c for c in chosen if c.nome_fonte == "tassonomia"]
    unnamed_shelves = [c for c in chosen if c.nome_fonte == "perche_hai_visto"]

    if named_shelves:
        best_freshest = min(named_shelves, key=lambda x: (x.min_eta, x.r_comb))
        rem_named = [c for c in named_shelves if c is not best_freshest]
        rem_named.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
        unnamed_shelves.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
        ordered_shelves = [best_freshest] + rem_named + unnamed_shelves
    else:
        best_freshest = min(unnamed_shelves, key=lambda x: (x.min_eta, x.r_comb))
        rem = [c for c in unnamed_shelves if c is not best_freshest]
        rem.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
        ordered_shelves = [best_freshest] + rem

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    all_served: list[Shelf] = []
    if medium is None:
        for sh in ordered_shelves:
            recs_c = getattr(sh, "_recs_counterpart", [])
            c_med = "series" if sh.medium == "movie" else "movie"

            top1_p = sh.titoli[0]["punteggio"] if sh.titoli else 0.0
            top1_c = recs_c[0]["punteggio"] if recs_c else 0.0
            ratio = (top1_c / top1_p) if top1_p > 0 else 0.0

            if ratio >= TAU_CONTROPARTE and recs_c:
                other_indices = getattr(sh, "_other_indices", [])
                other_members = []
                other_rep = []
                if other_indices:
                    other_sorted = sorted(other_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
                    for idx in other_sorted:
                        r = righe_arr[idx]
                        k_seme = engine.keys[r]
                        other_members.append({
                            "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                            "medium": c_med,
                            "titolo": str(titles[r]) if titles is not None else k_seme,
                            "anno": int(years[r]) if years is not None else 0,
                        })
                    for idx in other_sorted[:3]:
                        r = righe_arr[idx]
                        k_seme = engine.keys[r]
                        other_rep.append({
                            "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                            "medium": c_med,
                            "titolo": str(titles[r]) if titles is not None else k_seme,
                            "anno": int(years[r]) if years is not None else 0,
                            "plays": float(plays_arr[idx]),
                            "eta_giorni": float(eta_arr[idx]),
                        })

                cat_prefix = sh.catalog_id.rsplit("_", 1)[0]
                sh_c = Shelf(
                    catalog_id=f"{cat_prefix}_{c_med}",
                    nome=sh.nome,
                    nome_fonte=sh.nome_fonte,
                    confidenza=sh.confidenza,
                    medium=c_med,
                    semi_rappresentativi=other_rep,
                    semi_membri=other_members,
                    size=len(other_indices),
                    min_eta=sh.min_eta,
                    matched_entry=sh.matched_entry,
                    seeds_indices=other_indices,
                    dom_coll=sh.dom_coll,
                    _ratio=ratio,
                )
                sh_c.titoli = recs_c

                # DEFECT 2: Il suffisso medium viene aggiunto SOLO quando la controparte esiste nel set servito
                sh.nome_display = f"{sh.nome} ({'film' if sh.medium == 'movie' else 'serie'})"
                sh_c.nome_display = f"{sh_c.nome} ({'film' if c_med == 'movie' else 'serie'})"

                # DEFECT 1: Adiacenza immediata (primario seguito immediatamente dalla sua controparte)
                all_served.append(sh)
                all_served.append(sh_c)
            else:
                # Nessuna controparte servita: nome pulito senza suffisso
                sh.nome_display = sh.nome
                all_served.append(sh)
    else:
        # Filtro medium specifico: solo primari già materializzati
        for sh in ordered_shelves:
            sh.nome_display = sh.nome
            all_served.append(sh)

    # Ceiling massimo di 16 righe servite per profilo
    all_served = all_served[:16]

    for slot_idx, sh in enumerate(all_served, 1):
        sh.slot_position = slot_idx

    return all_served
