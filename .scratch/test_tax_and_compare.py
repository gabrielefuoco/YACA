"""Test new taxonomy with small_limit = 12 and compute mass coverage and top 3 mass share."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TaxonomyEntry, TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster
import graph.tassonomia as T

# Prepare updated taxonomy
new_entries = [e for e in TASSONOMIA_36 if e.nome != "Cinema d'autore"]

art_keywords = frozenset({
    'character study', 'existentialism', 'independent film', 'arthouse', 'slice of life',
    'slow cinema', 'surrealism', 'coming of age', 'social commentary', 'philosophical',
    'introspective', 'semi autobiographical', 'mumblecore', 'magic realism', 'reflective',
    'meditative', 'criterion collection', 'dark comedy', 'human nature', 'isolation',
    'alienation', 'identity', 'allegory', 'class differences', 'anti-capitalist',
    'father daughter relationship', 'mother son relationship', 'family relationships',
    'loss of loved one', 'loss of child', 'dysfunctional family', 'complex relationships',
    'obsession', 'neo-noir', 'fictional biography', 'grief'
})

classic_keywords = frozenset({
    'black and white', 'film noir', 'neo-noir', 'world war ii', 'expressionism',
    'german expressionism', 'italian neo realism', 'neo realism', 'new german cinema',
    'new hollywood', 'french resistance', 'pre-code', 'resistance', 'vichy regime',
    'historical fiction', 'psychological drama', 'character study', 'existentialism',
    'surrealism', 'classic', 'post war', 'children in wartime', 'nazi occupation',
    'fascism', 'holocaust (shoah)', 'road movie'
})

sports_doc_keywords = frozenset({
    'sports documentary', 'athlete', 'racing', 'formula 1', 'car race', 'football (soccer)',
    'soccer', 'tennis', 'olympic games', 'basketball', 'motorcycle race', 'extreme sport',
    'championship', 'world cup', 'boxing'
})

food_keywords = frozenset({
    'cooking', 'culinary', 'food', 'chef', 'restaurant', 'baking', 'gastronomy', 'foodie', 'cuisine'
})

wrestling_keywords = frozenset({
    'wrestling', 'sports entertainment', 'wwe', 'professional wrestling', 'sumo', 'prowrestling'
})

# Update existing and add new entries
updated_list = []
for e in new_entries:
    if e.nome == 'Documentari sportivi':
        updated_list.append(TaxonomyEntry(
            nome='Documentari sportivi',
            tema=e.tema,
            priorita=85,
            derived_from_data=True,
            data_note="Derivato dai dati: Formula 1, MotoGP, calcio e grandi atleti",
            keywords=sports_doc_keywords,
        ))
    elif e.nome == 'Wrestling':
        updated_list.append(TaxonomyEntry(
            nome='Wrestling',
            tema=e.tema,
            priorita=95,
            derived_from_data=True,
            data_note="Derivato dai dati: WWE, Sumo e wrestling professionale",
            keywords=wrestling_keywords,
        ))
    elif e.nome == "Animazione d'autore":
        updated_list.append(TaxonomyEntry(
            nome="Animazione d'autore",
            tema=e.tema,
            priorita=80,
            derived_from_data=True,
            data_note="Derivato dai dati: Studio Ghibli, Satoshi Kon, stop-motion e cinema d'animazione d'autore",
            keywords=frozenset({"studio ghibli", "philosophical", "author animation", "surrealism", "stop motion", "independent animation", "adult animation"}),
            anime=None,  # Ammette anche stop motion e animazione internazionale (es. Fantastic Mr. Fox, La sposa cadavere)
            medium="movie",
        ))
    else:
        updated_list.append(e)

updated_list.extend([
    TaxonomyEntry(
        nome="Cinema d'autore contemporaneo",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown arthouse contemporaneo (PTA, Wenders, Bong Joon-ho, Kore-eda, Guadagnino, Baker)",
        keywords=art_keywords,
        medium="movie",
        anime=False,
    ),
    TaxonomyEntry(
        nome="Classici d'autore",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown classici d'autore (Kassovitz, Scorsese, Lang, Malle, Tarkovsky, Melville, Hitchcock)",
        keywords=classic_keywords,
        medium="movie",
        anime=False,
    ),
    TaxonomyEntry(
        nome="Cucina & Food",
        tema="Sport & Documentari",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: serie e documentari gastronomici, chef e food",
        keywords=food_keywords,
    ),
])

T.TASSONOMIA_36 = tuple(updated_list)

from importlib.machinery import SourceFileLoader
mod = SourceFileLoader('compare', str(ROOT / '.scratch' / 'compare_shelf_selection.py')).load_module()
mod.TASSONOMIA_36 = tuple(updated_list)

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    print("Running with small_limit = 12 ...")
    res = mod.run_shelf_selection_experiment(engine, W, tau_m=0.05, small_limit=12, max_n=8)

    for p in ["castoffcrown", "warnok", "pepsipex"]:
        r = res[p]
        print(f"\n=======================================================")
        print(f"PROFILE: {p} (Total seeds: {r['n_seeds']})")
        print(f"Merges: Accepted={r['merges_acc']} | Rej_3plus={r['rej_3plus']} | Rej_unnameable={r['rej_unnameable']}")
        print(f"=======================================================")

        for mode in ["unweighted", "weighted"]:
            sh_list = r[mode]["chosen"]
            fails = r[mode]["fails"]
            cov_titles = r[mode]["cov"]

            # Calculate mass coverage and top 3 mass share
            chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
            righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
            plays_arr = np.asarray(plays, dtype=np.float32)
            nep_arr = engine.nep[righe_arr]
            is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
            seed_weights = np.where(
                is_tv_arr & (nep_arr > 1.0),
                1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
                np.minimum(plays_arr, 3.0)
            )
            tot_mass = float(np.sum(seed_weights))

            covered_indices = set()
            shelf_masses = []
            for sh in sh_list:
                sh_mass = float(sum(seed_weights[i] for i in sh.seeds_indices))
                shelf_masses.append(sh_mass)
                covered_indices.update(sh.seeds_indices)

            served_mass = float(sum(seed_weights[i] for i in covered_indices))
            mass_cov_pct = (served_mass / tot_mass) * 100.0 if tot_mass > 0 else 0.0

            # Top 3 shelves mass share
            # Note: cannibalisation is: share of total profile mass held by top 3 shelves
            # and/or share of served mass held by top 3 shelves. Let's report both!
            sorted_masses = sorted(shelf_masses, reverse=True)
            top3_mass = sum(sorted_masses[:3])
            top3_share_of_tot = (top3_mass / tot_mass) * 100.0 if tot_mass > 0 else 0.0
            top3_share_of_served = (top3_mass / served_mass) * 100.0 if served_mass > 0 else 0.0

            print(f"\n--- MODE: {mode.upper()} ---")
            print(f"  Shelves count: {len(sh_list)} | Verification FAILs: {fails}")
            print(f"  Title coverage: {len(covered_indices)}/{r['n_seeds']} = {cov_titles:.1f}%")
            print(f"  MASS coverage: {served_mass:.1f}/{tot_mass:.1f} = {mass_cov_pct:.1f}%")
            print(f"  Top-3 shelves mass: {top3_mass:.1f} ({top3_share_of_tot:.1f}% of total mass, {top3_share_of_served:.1f}% of served mass)")
            print("  Shelves:")
            for idx, sh in enumerate(sh_list, 1):
                ver = r[mode]["verifications"][idx-1][1]
                m_sh = float(sum(seed_weights[i] for i in sh.seeds_indices))
                print(f"    [{idx}] '{sh.nome}' ({sh.size} semi, mass={m_sh:.1f}, {m_sh/tot_mass*100:.1f}%) [{sh.nome_fonte}] -> {ver}")

if __name__ == "__main__":
    main()
