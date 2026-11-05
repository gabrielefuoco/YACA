"""confronto.py — 50 seed (30 film + 20 serie), i grafi fianco a fianco, per giudicare a occhio.

Perché esiste: il banco curato (499 sorgenti) è scritto da un curatore e ha i suoi gusti — e noi ci
abbiamo ottimizzato sopra. Qui non c'è metrica: c'è la lista vera, con anno e voti, da leggere.

  PYTHONPATH=. py .scratch/uscire-dal-plateau/confronto.py [--k 6]

Scrive un HTML con una tabella per seed: una riga per grafo.
"""
from __future__ import annotations

import argparse
import html
from pathlib import Path

import numpy as np

from services.graph_dense import data as D, provenance as PV

GRAFI = [
    ('V36 (base K=24)', 'services/graph/data/v36k24/bolle-eterogeneo-V36-p1.0-triangolo.npz'),
    ('V42 (RESID 1,2 · KWSEM 1,4)', 'services/graph/data/v42/bolle-eterogeneo-V42-p1.0-triangolo.npz'),
    ('V43 (RESID 1,2 · KWSEM 2,0)', 'services/graph/data/v43/bolle-eterogeneo-V43-p1.0-triangolo.npz'),
    ('V44 (RESID 1,2 · KWSEM 2,6)', 'services/graph/data/v44/bolle-eterogeneo-V44-p1.0-triangolo.npz'),
]

# 8 ancore discusse nel lavoro + 22 film e 20 serie stratificati (popolarità × decennio)
ANCORE_FILM = ['movie:346698', 'movie:792307', 'movie:933260', 'movie:545611', 'movie:64690',
               'movie:496243', 'movie:391713', 'movie:37165']
N_FILM_EXTRA, N_SERIE = 22, 20
SEME = 20261104


def semi(B, n_extra=N_FILM_EXTRA, n_serie=N_SERIE):
    """Campione stratificato: fasce di voti × decennio, più le ancore."""
    rng = np.random.default_rng(SEME)
    RO, VOT, YEAR, TV = B['row_of'], B['VOT'], B['year'], B['is_tv']
    fasce = [(300, 2_000), (2_000, 8_000), (8_000, 10 ** 9)]
    decenni = [(1950, 1979), (1980, 1999), (2000, 2014), (2015, 2030)]
    scelti = [RO[k] for k in ANCORE_FILM if k in RO]
    film = []
    for lo, hi in fasce:
        for d0, d1 in decenni:
            pool = np.flatnonzero((~TV) & (VOT >= lo) & (VOT < hi) & (YEAR >= d0) & (YEAR <= d1))
            pool = np.array([x for x in pool if int(x) not in set(scelti)])
            if len(pool):
                film.append(int(rng.choice(pool)))
    film = list(dict.fromkeys(scelti + film))[:len(ANCORE_FILM) + n_extra]
    serie = []
    for lo, hi in fasce:
        pool = np.flatnonzero(TV & (VOT >= lo) & (VOT < hi))
        if len(pool):
            for _ in range(2):
                serie.append(int(rng.choice(pool)))
    # riempimento: se la stratificazione non basta, si completa dal pool generale (chiesto 30+20)
    def riempi(gia, quanto, maschera):
        gia = list(gia)
        pool = np.flatnonzero(maschera & (VOT >= 300))
        rng.shuffle(pool)
        for x in pool:
            if len(gia) >= quanto:
                break
            if int(x) not in set(gia):
                gia.append(int(x))
        return gia[:quanto]
    film = riempi(film, len(ANCORE_FILM) + n_extra, ~TV)
    serie = riempi(serie, n_serie, TV)
    return film, serie


def topk(M, i, k, TV):
    if i >= M.shape[0]:          # V15 ha 66.259 righe: i titoli aggiunti dopo non ci sono
        return []
    r = M.getrow(i)
    if r.nnz == 0:
        return []
    o = np.argsort(-r.data)
    return [int(j) for j in r.indices[o] if not TV[j] and int(j) != i][:k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=6)
    a = ap.parse_args()
    B = D.basic()
    T, TV, YEAR, VOT, RO = B['titoli'], B['is_tv'], B['year'], B['VOT'], B['row_of']
    film, serie = semi(B)
    grafi = [(nome, PV.leggi(p)[0]) for nome, p in GRAFI if Path(p).exists()]

    def riga_seed(i, gruppo):
        out = [f'<section><h3>{html.escape(str(T[i]))} '
               f'<span class="meta">{gruppo} · {int(YEAR[i]) if YEAR[i] > 0 else "?"} · '
               f'{int(VOT[i]):,} voti</span></h3>',
               '<table><thead><tr><th>grafo</th>']
        out.append(''.join(f'<th>#{q}</th>' for q in range(1, a.k + 1)))
        out.append('</tr></thead><tbody>')
        for nome, M in grafi:
            celle = []
            for j in topk(M, i, a.k, TV):
                anno = int(YEAR[j]) if YEAR[j] > 0 else '?'
                celle.append(f'<td>{html.escape(str(T[j]))} '
                             f'<span class="anno">{anno}</span></td>')
            while len(celle) < a.k:
                celle.append('<td>—</td>')
            out.append(f'<tr><th>{html.escape(nome)}</th>{"".join(celle)}</tr>')
        out.append('</tbody></table></section>')
        return '\n'.join(out)

    corpo = [riga_seed(i, 'film') for i in film] + [riga_seed(i, 'serie') for i in serie]
    pagina = f'''<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confronto a occhio — 30 film + 20 serie</title>
<style>
:root{{color-scheme:dark}}body{{margin:0;background:#111318;color:#eef1f7;
 font:15px/1.4 system-ui,sans-serif}}
header{{max-width:1400px;margin:24px auto 8px;padding:0 18px}}
h1{{font-size:1.4rem;margin:0 0 6px}}h2{{max-width:1400px;margin:26px auto 8px;padding:0 18px;
 font-size:1.05rem;color:#8fb8ff;text-transform:uppercase;letter-spacing:.08em}}
section{{max-width:1400px;margin:0 auto 18px;padding:0 18px}}
h3{{font-size:1.05rem;margin:0 0 6px}}.meta{{color:#8b93a7;font-weight:400;font-size:.85rem}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}}
th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #262b36;vertical-align:top}}
thead th{{color:#8b93a7;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;
 font-weight:600}}
tbody th{{width:150px;color:#c8d0e0;font-weight:600;font-size:.82rem}}
.anno{{color:#7f8798;font-size:.78rem}}
tr:nth-child(even) td{{background:#161a22}}
@media(max-width:760px){{table{{table-layout:auto}}tbody th{{width:auto}}}}
</style></head><body>
<header><h1>Confronto a occhio</h1>
<p style="color:#8b93a7">{len(film)} film + {len(serie)} serie · top-{a.k} per grafo ·
nessuna metrica: le liste vere, con anno e voti. Le serie come candidati sono escluse.</p>
</header>
<h2>Film ({len(film)})</h2>
{''.join(corpo[:len(film)])}
<h2>Serie ({len(serie)})</h2>
{''.join(corpo[len(film):])}
</body></html>'''
    out = Path('.scratch/uscire-dal-plateau/confronto-50.html')
    out.write_text(pagina, encoding='utf-8')
    print(f'scritto {out} · {len(film)} film + {len(serie)} serie · {len(grafi)} grafi')


if __name__ == '__main__':
    main()
