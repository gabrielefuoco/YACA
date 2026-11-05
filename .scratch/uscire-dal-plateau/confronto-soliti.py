"""confronto-soliti.py — i soliti 30 film + 10 serie, V30/V32/V33 a confronto (top-6)."""
import html
from pathlib import Path
import numpy as np
from services.graph_dense import data as D, provenance as PV, valuta as V

FILM = [346698, 64690, 76341, 27205, 11216, 157336, 329, 603, 419430, 496243, 422, 807, 240, 582, 1417,
        406, 11093, 62215, 97370, 329865, 264660, 152601, 210577, 146233, 242582, 273481, 18148, 490, 797, 5156]
SERIE = [1438, 1920, 87108, 42009, 62560, 70523, 76331, 61222, 60574, 71446]
GRAFI = [('V36 (base, K=24)', 'services/graph/data/v36k24/bolle-eterogeneo-V36-p1.0-triangolo.npz'),
         ('V38 (keyword pesate)', 'services/graph/data/v38/bolle-eterogeneo-V37-p1.0-triangolo.npz'),
         ('V42 (co-gradimento residuo)', 'services/graph/data/v42/bolle-eterogeneo-V42-p1.0-triangolo.npz')]
B = D.basic(); T, TV, Y, RO = B['titoli'], B['is_tv'], B['year'], B['row_of']
g = [(n, PV.leggi(p)[0]) for n, p in GRAFI]

def riga(i):
    out = [f'<section><h3>{html.escape(str(T[i]))} <span class="m">'
           f'{"serie" if TV[i] else "film"} · {int(Y[i]) if Y[i]==Y[i] and Y[i]>0 else "?"}</span></h3>'
           '<table>']
    for n, M in g:
        celle = ''.join(f'<td>{html.escape(str(T[j])[:30])}</td>' for j in V._ordine(M, i, 6))
        out.append(f'<tr><th>{html.escape(n)}</th>{celle}</tr>')
    out.append('</table></section>')
    return ''.join(out)

semi = [RO[f'movie:{t}'] for t in FILM if f'movie:{t}' in RO] + \
       [RO[f'tv:{t}'] for t in SERIE if f'tv:{t}' in RO]
pagina = f'''<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Soliti 40 — V30/V32/V33</title>
<style>:root{{color-scheme:dark}}body{{margin:0;background:#111318;color:#eef1f7;font:14px/1.4 system-ui}}
h1{{max-width:1500px;margin:22px auto 4px;padding:0 16px;font-size:1.3rem}}
p.n{{max-width:1500px;margin:0 auto 14px;padding:0 16px;color:#8b93a7}}
section{{max-width:1500px;margin:0 auto 16px;padding:0 16px}}
h3{{font-size:.98rem;margin:0 0 5px}}.m{{color:#8b93a7;font-weight:400;font-size:.82rem}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}}
th,td{{text-align:left;padding:5px 7px;border-bottom:1px solid #262b36;font-size:.86rem}}
tbody th{{width:190px;color:#c8d0e0}}tr:nth-child(even) td{{background:#161a22}}</style></head><body>
<h1>I soliti 30 film + 10 serie — V30 / V32 / V33</h1>
<p class="n">Top-6 per grafo. Nessuna metrica: le liste, da leggere.</p>
{''.join(riga(i) for i in semi)}</body></html>'''
Path('.scratch/uscire-dal-plateau/confronto-soliti.html').write_text(pagina, encoding='utf-8')
print(f'scritto · {len(semi)} seed')
