"""inspect_clusters.py — Analizza la composizione dei cluster per medium su tutti i 10 profili."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def main():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)
        print(f"\n=================== {p.upper()} ({len(chiavi)} semi, {len(shs)} scaffali) ===================")
        for s in shs:
            member_media = Counter(m["medium"] for m in s.semi_membri)
            cand_media = Counter(t["medium"] for t in s.titoli)
            has_mixed_members = len(member_media) > 1
            mixed_str = " *** MIXED MEMBERS! ***" if has_mixed_members else ""
            print(f"[{s.medium.upper()}] '{s.nome}' ({s.nome_fonte}, conf={s.confidenza:.2f})")
            print(f"   Membri ({len(s.semi_membri)}): {dict(member_media)}{mixed_str}")
            print(f"   Candidati ({len(s.titoli)}): {dict(cand_media)}")
            if has_mixed_members:
                print("   Titoli membri:")
                for m in s.semi_membri:
                    print(f"     - {m['medium']}: {m.get('titolo', m['tmdbId'])}")

if __name__ == "__main__":
    main()
