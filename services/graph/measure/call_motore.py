"""call_motore.py — Interfaccia diretta per raccomandazioni del grafo da Node.js/CLI."""
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import motore as MO
from graph import parametri as P

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--stdin':
        payload = json.loads(sys.stdin.read())
    elif len(sys.argv) > 1:
        payload = json.loads(sys.argv[1])
    else:
        payload = json.loads(sys.stdin.read())

    semi_raw = payload.get("semi", [])
    medium = payload.get("medium")
    cap = payload.get("cap", 10)

    storia = []
    for s in semi_raw:
        tmdb_id = s.get("tmdbId")
        if tmdb_id is None:
            continue
        med = s.get("medium", medium or "movie")
        pref = "tv" if med in ("tv", "series") else "movie"
        key = f"{pref}:{tmdb_id}"
        if key in B.ROW_OF:
            peso = float(s.get("peso", 1.0))
            tipo = s.get("tipo", "watched")
            storia.append((key, peso, tipo))

    motore = MO.Motore(silenzioso=True)
    res = motore.lista(storia, medium="series" if medium in ("tv", "series") else ("movie" if medium == "movie" else None), cap=cap)
    
    liste = res.get("liste", [])
    nicchia = next((l for l in liste if l["tipo"] == "nicchia_di_qualita"), None)
    
    out = {
        "ok": True,
        "nicchia_di_qualita": [],
        "mondi_attivi": [w["bolla"] for w in res.get("mondi", [])]
    }
    
    if nicchia:
        for ch, sc in nicchia["titoli"]:
            if ch in B.ROW_OF:
                r = B.ROW_OF[ch]
                med_tipo, tmdb = ch.split(":")
                out["nicchia_di_qualita"].append({
                    "id": ch,
                    "tmdbId": int(tmdb),
                    "medium": med_tipo,
                    "score": float(sc),
                    "popularity": float(motore.POP[r]),
                    "vote_average": float(motore.VAVE[r]),
                    "vote_count": float(motore.VOT[r]),
                    "bolla": int(motore.MEM[r])
                })
                
    sys.stdout.write(json.dumps(out))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
