"""test_two_tier_implementation.py — Prototype two-tier greedy and display ordering."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter
import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.interessi import jaccard, Shelf

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()

profs = [
    "sangam456",
    "hammers-lists",
    "sappss",
    "flixinatoor99",
    "moppierhead",
    "castoffcrown",
    "warnok",
    "pepsipex",
    "carverclan",
    "1jacobjohn",
]

def scaffali_two_tier(chiavi, n=8):
    # Risoluzione
    righe = []
    eta_list = []
    plays_list = []
    for idx, k in enumerate(chiavi):
        r = engine.row_of.get(k)
        if r is not None:
            righe.append(r)
            eta_list.append(float(idx))
            plays_list.append(1.0)
            
    righe_arr = np.asarray(righe, dtype=np.int64)
    plays_arr = np.asarray(plays_list, dtype=np.float32)
    eta_arr = np.asarray(eta_list, dtype=np.float32)

    eligible = I.clusters(engine, righe_arr, eta=eta_list, plays=plays_list, W_aff=W)
    if not eligible:
        return []

    S = I.calcola_sim_affinity(righe_arr, W)
    for sh in eligible:
        sz = len(sh.seeds_indices)
        if sz >= 2:
            sub = S[np.ix_(sh.seeds_indices, sh.seeds_indices)]
            iu = np.triu_indices(sz, k=1)
            sh.consistenza = round(float(np.mean(sub[iu])), 4)
        else:
            sh.consistenza = 0.0

    nep_arr = engine.nep[righe_arr] if len(engine.nep) > 0 else np.ones(len(righe_arr))
    is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
    seed_weights = np.where(
        is_tv_arr & (nep_arr > 1.0),
        1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
        np.minimum(plays_arr, 3.0),
    )
    for sh in eligible:
        sh.weighted_support = float(sum(seed_weights[idx] for idx in sh.seeds_indices))

    eligible.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(eligible):
        item._r_rec = r_idx + 1

    eligible.sort(key=lambda x: (-getattr(x, "weighted_support", float(x.size)), -x.consistenza))
    for r_idx, item in enumerate(eligible):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    def ensure_top10(cand: Shelf) -> None:
        if not cand.top10_cands:
            semi_rac = [
                {"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i])}
                for i in cand.seeds_indices
            ]
            racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
            cand.top10_cands = set(r["key"] for r in racs[:10])
            cand.titoli = racs[:10]

    # Two-tier greedy selection
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

            for cand in eligible:
                if cand.nome_fonte != tier_source:
                    continue
                if any(c is cand for c in chosen):
                    continue
                if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax_labels:
                    continue
                if cand.dom_coll is not None and cand.dom_coll in seen_colls:
                    continue

                uncovered_set = set(cand.seeds_indices) - covered_seeds
                if not uncovered_set:
                    continue

                uncovered_score = float(sum(seed_weights[i] for i in uncovered_set))
                cand_key = (uncovered_score, -cand.min_eta, cand.consistenza)
                if best_cand is not None and cand_key <= best_key:
                    continue

                ensure_top10(cand)
                if any(jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen):
                    continue

                best_cand = cand
                best_key = cand_key

            if best_cand is None:
                break

            ensure_top10(best_cand)
            chosen.append(best_cand)
            covered_seeds.update(best_cand.seeds_indices)
            if best_cand.nome_fonte == "tassonomia":
                seen_tax_labels.add(best_cand.nome)
            if best_cand.dom_coll is not None:
                seen_colls.add(best_cand.dom_coll)

    if not chosen:
        return []

    # Display ordering: slot 1 = freshest named shelf, rest of named by r_comb, unnamed last
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

    for slot_idx, sh in enumerate(ordered_shelves, 1):
        sh.slot_position = slot_idx

    return ordered_shelves

print("\n=== TWO-TIER SELECTION RESULTS (N=8) ===")
zero_unnamed_count = 0
for p in profs:
    k, r, pl, et = K.storia_trakt(p, ordine="recente")
    shs = scaffali_two_tier(k, n=8)
    named = [s for s in shs if s.nome_fonte == "tassonomia"]
    unnamed = [s for s in shs if s.nome_fonte == "perche_hai_visto"]
    if len(unnamed) == 0:
        zero_unnamed_count += 1
    print(f"{p:<15} | Tot: {len(shs)} | Named: {len(named)} | Unnamed: {len(unnamed)}")
    for s in shs:
        print(f"   [{s.slot_position}] {s.nome} (size={s.size}, mass={s.weighted_support:.1f}, eta={s.min_eta:.0f}) [{s.nome_fonte}]")

print(f"\nProfiles with ZERO unnamed rows: {zero_unnamed_count} / {len(profs)}")
