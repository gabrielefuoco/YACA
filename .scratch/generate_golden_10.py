import json
import sys
from pathlib import Path

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

engine = Engine.carica_transizione()
w_aff = I.carica_matrice_affinita()

users = [
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

golden = {}

for u in users:
    chiavi, _, plays, eta = K.storia_trakt(u, ordine="recente")
    semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
    shelves = I.scaffali(engine=engine, semi=semi, n=8, W_aff=w_aff)

    user_data = {
        "shelves": [
            {
                "nome": sh.nome,
                "nome_display": sh.nome_display,
                "medium": sh.medium,
                "titoli": [
                    {
                        "key": str(t["key"]),
                        "tmdbId": int(t["tmdbId"]),
                        "medium": str(t["medium"]),
                        "punteggio": float(t["punteggio"]),
                    }
                    for t in sh.titoli
                ],
            }
            for sh in shelves
        ]
    }
    golden[u] = user_data
    print(f"Captured golden for {u}: {len(shelves)} shelves")

out_path = Path(".scratch/golden_10_profiles.json")
out_path.write_text(json.dumps(golden, indent=2), encoding="utf-8")
print(f"Wrote golden to {out_path} ({out_path.stat().st_size} bytes)")
