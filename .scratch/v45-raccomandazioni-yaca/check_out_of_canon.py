import json
from pathlib import Path
from graph.runtime import Engine

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
tk = Path(".cache/trakt/users")
m = json.loads((tk / "movie-castoffcrown.json").read_text(encoding="utf-8"))
s = json.loads((tk / "show-castoffcrown.json").read_text(encoding="utf-8"))

out_m = [v["movie"]["title"] for v in m if f"movie:{v['movie']['ids'].get('tmdb')}" not in engine.row_of]
out_s = [v["show"]["title"] for v in s if f"tv:{v['show']['ids'].get('tmdb')}" not in engine.row_of]
print(f"Total raw items: {len(m) + len(s)} (movies: {len(m)}, shows: {len(s)})")
print(f"Out of canon: movies={len(out_m)}, shows={len(out_s)}")
print("Sample out movies:", out_m[:5])
print("Sample out shows:", out_s[:5])
