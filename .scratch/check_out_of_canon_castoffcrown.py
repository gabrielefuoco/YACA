import json
from pathlib import Path
import pandas as pd
from graph.runtime import Engine

engine = Engine.carica_transizione('services/graph/data/v45-transizione/transizione-pota16.npz')
tk = Path('.cache/trakt/users')
m = json.loads((tk / 'movie-castoffcrown.json').read_text(encoding='utf-8'))
s = json.loads((tk / 'show-castoffcrown.json').read_text(encoding='utf-8'))

out_m_items = [v for v in m if f"movie:{v['movie']['ids'].get('tmdb')}" not in engine.row_of]
out_s_items = [v for v in s if f"tv:{v['show']['ids'].get('tmdb')}" not in engine.row_of]

print(f"Total: movies={len(m)}, shows={len(s)}, total={len(m)+len(s)}")
print(f"Out of canon: movies={len(out_m_items)}, shows={len(out_s_items)}, total={len(out_m_items)+len(out_s_items)}")

no_tmdb_m = [v for v in out_m_items if not v['movie']['ids'].get('tmdb')]
no_tmdb_s = [v for v in out_s_items if not v['show']['ids'].get('tmdb')]
print(f"No tmdb id: movies={len(no_tmdb_m)}, shows={len(no_tmdb_s)}")

with_tmdb_m = [v for v in out_m_items if v['movie']['ids'].get('tmdb')]
with_tmdb_s = [v for v in out_s_items if v['show']['ids'].get('tmdb')]
print(f"With tmdb id out of canon: movies={len(with_tmdb_m)}, shows={len(with_tmdb_s)}, total={len(with_tmdb_m)+len(with_tmdb_s)}")
