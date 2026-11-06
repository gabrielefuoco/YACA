"""mixer.py — somma i tipi di arco in un grafo V12 (nessuna potatura, salvo richiesta).

  PYTHONPATH=services py -m graph.build.mixer --modo somma
  PYTHONPATH=services py -m graph.build.mixer --modo rrf --pota 100

Legge i tipi gia' normalizzati e portati a quota 1 per riga in `tipi-pesi/`, applica i pesi da
`v12/pesi.json` (mancante -> tutti 1) e scrive `v12/MIX-<modo>.npz`.

  somma : M = sum_t w_t * M_t                     (il peso e' una quota di attenzione)
  rrf   : v = w_t / (60 + rango_t)                (fusiona le classifiche, indifferente alla scala)
"""
import argparse
import json
import os
import time

import numpy as np
import scipy.sparse as sp

import os as _os
SRC = _os.environ.get('PESI_OUT', 'services/graph/data/tipi-pesi')
RO_F = None
DST = _os.environ.get('MIX_OUT', 'services/graph/data/v12')
T0 = time.time()


def carica(n, N):
    z = np.load(f'{SRC}/{n}.npz')
    return sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))


def rrf(M, w, k=60, taglia=0):
    """Sostituisce ogni peso col suo rango: 1/(k + rango). Indifferente alla scala del tipo.

    `taglia` (handoff 5, §3) tronca il tipo ai primi `taglia` ranghi: un tipo specialistico non deve
    iniettare rumore nella coda. Con `k` corto e `taglia` corta il rango #0 di un tipo debole resta
    udibile (w/3 con k=3 invece di w/18 con k=15) senza che i ranghi 20-100 inquinino la fusione.
    """
    rows, cols, vals = [], [], []
    for i in range(M.shape[0]):
        r = M.getrow(i)
        if r.nnz == 0:
            continue
        o = np.argsort(-r.data)
        js = r.indices[o]
        if taglia:
            js = js[:taglia]
        rows.append(np.full(len(js), i, np.int32))
        cols.append(js.astype(np.int32))
        vals.append((w / (k + np.arange(len(js)))).astype(np.float32))
    if not rows:
        return sp.csr_matrix(M.shape)
    return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                         shape=M.shape)


def correggi_hub(A, beta):
    """Divide l'arco verso j per (numero di righe che puntano a j)^beta.

    E' la stessa correzione di V10 (`correggi_hub_2`, beta=0.25 in steps/02_partizione.py):
    un titolo che "riceve" da tutto (Nattrikken) smette di salire per popolarita' di ricezione.
    """
    A = A.tocsr()
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    return sp.csr_matrix(A.multiply((1.0 / np.maximum(ind, 1.0) ** beta)[None, :])).tocsr()


def gate_popolare_asimmetrico(M, voti, vave, runtime, k_pop=10.0, tau=2.0, slope=1.5,
                              vave_min=6.8, runtime_min=85):
    """Lo stesso cancello, ma con una direzione (ticket 04).

    Il cancello simmetrico tratta uguali due casi che non lo sono:
      · il candidato e' PIU' popolare del seme -> di solito e' il "solito noto" da evitare, si attenua;
      · il candidato e' MENO popolare -> puo' essere il cult che cerchiamo, oppure il cartone
        direct-to-video. Il discriminante non e' il numero di voti ma la **forma**: un lungometraggio
        cinematografico con voto alto (runtime >= 85', VAVE >= 6.8) passa indenne, un'appendice da 70'
        con voto 6,0 viene attenuata come prima.

    Misurato: il simmetrico con tau 3,0 tiene *Josie and the Pussycats* (400 voti) fuori da *Barbie*
    esattamente come tiene fuori *Barbie e lo Schiaccianoci* (150 voti).
    """
    C = M.tocoo()
    L = np.log1p(np.maximum(voti, 0))
    su = L[C.col] - L[C.row]                 # >0: il candidato e' piu' popolare del seme
    giu = -su
    f = np.ones(len(C.data), np.float32)
    # verso l'alto: soglia moltiplicativa (k_pop x voti) poi attenuazione
    m_su = su > np.log(k_pop)
    f[m_su] = np.exp(-(su[m_su] - np.log(k_pop)) / slope).astype(np.float32)
    # verso il basso: passa solo la "forma cinematografica"
    buono = (np.asarray(vave)[C.col] >= vave_min) & (np.asarray(runtime)[C.col] >= runtime_min)
    m_giu = (giu > tau) & ~buono
    f[m_giu] = np.exp(-(giu[m_giu] - tau) / slope).astype(np.float32)
    out = sp.csr_matrix((C.data * f, (C.row, C.col)), shape=M.shape).tocsr()
    print(f'  gate asimmetrico (k_pop {k_pop:g} · tau {tau:g} · vave {vave_min:g} · '
          f'runtime {runtime_min}\'): attenua {100*float((f < 0.95).mean()):.1f}% degli archi '
          f'(verso l alto {100*float(m_su.mean()):.1f}%, verso il basso {100*float(m_giu.mean()):.1f}%)',
          flush=True)
    out.setdiag(0)
    out.eliminate_zeros()
    return out


def _animazione():
    """True per i titoli con genere Animation nei Parquet TMDB (0 = film, 1 = serie)."""
    import json as _json
    import pandas as pd
    from . import data as D
    B = D.basic(); RO = B['row_of']
    out = np.zeros(B['N'], bool)
    for f, pre in (('.cache/tmdb/movies.parquet', 'movie'), ('.cache/tmdb/tv.parquet', 'tv')):
        d = pd.read_parquet(f, columns=['id', 'genres'])
        for i, g in zip(d['id'], d['genres']):
            r = RO.get(f'{pre}:{int(i)}')
            if r is None:
                continue
            try:
                gs = {str(x.get('name', '')).lower() for x in _json.loads(g or '[]')
                      if isinstance(x, dict)}
            except Exception:
                gs = set()
            if 'animation' in gs:
                out[r] = True
    return out


def damp_animazione(M, ani, fattore=0.2):
    """Smorza gli archi che attraversano il confine animazione / live-action.

    PERCHE'. Un horror come *Dark Harvest* finiva con *Curioso come George* e *Topolino*: il genere
    «animation» e' un proxy grezzo del pubblico vero (bambini), ma e' l'unico campo affidabile che
    abbiamo, e il precedente dello smorzamento anime-saga dice che un fattore morbido funziona.
    Morbido e non duro: *Spider-Verse* accanto a *EEAAO* e *Fantastic Mr. Fox* accanto a *Asteroid
    City* sono ponti legittimi, e un divieto li taglierebbe tutti.
    """
    C = M.tocoo()
    traversa = ani[C.row] != ani[C.col]
    f = np.where(traversa, fattore, 1.0).astype(np.float32)
    out = sp.csr_matrix((C.data * f, (C.row, C.col)), shape=M.shape).tocsr()
    print(f'  damping animazione: {int(traversa.sum()):,} archi attraversano il confine '
          f'({100*float(traversa.mean()):.1f}%) -> x{fattore}', flush=True)
    out.setdiag(0)
    out.eliminate_zeros()
    return out


def _runtime():
    """Durata in minuti per riga del canone (0 = sconosciuta). I Parquet la hanno, i metadati no."""
    import pandas as pd
    from . import data as D
    B = D.basic(); RO = B['row_of']
    out = np.zeros(B['N'], np.float32)
    for f, pre in (('.cache/tmdb/movies.parquet', 'movie'), ('.cache/tmdb/tv.parquet', 'tv')):
        d = pd.read_parquet(f, columns=['id', 'runtime'])
        for i, rt in zip(d['id'], d['runtime']):
            r = RO.get(f'{pre}:{int(i)}')
            if r is not None and isinstance(rt, (int, float)) and rt == rt:
                out[r] = float(rt)
    return out


def damp_anime_saga(M, anime, coll, titoli, fattore=0.15, max_df=400, min_len=4):
    """Smorza gli archi fra un film ANIME e un titolo della stessa saga (ticket 11).

    I film-appendice (riassunti, recap, compilation) monopolizzano i vicini degli anime e sono
    inutili per chi cerca una nuova opera. Restano utili come PONTI durante la diffusione, quindi
    non si cancellano: si abbassano di `fattore`. Il criterio e' strutturale (collezione TMDB
    condivisa, oppure un token raro del titolo in comune), non "genere animation".
    """
    import re
    from collections import defaultdict
    anime = np.asarray(anime, bool)
    toks = []
    for t in titoli:
        s = re.sub(r"[^0-9a-zàèéìòù']+", ' ', str(t).lower())
        toks.append({w for w in s.split() if len(w) >= min_len})
    df = defaultdict(int)
    for s in toks:
        for w in s:
            df[w] += 1
    gruppi = defaultdict(list)
    for i in np.flatnonzero(coll > 0):
        gruppi[int(coll[i])].append(int(i))
    coppie = defaultdict(set)
    for g in gruppi.values():
        for a in g:
            for b in g:
                if a != b:
                    coppie[a].add(b)
    for w, g in defaultdict(list, {w: [i for i, s in enumerate(toks) if w in s] for w in df}.items()).items():
        if len(g) < 2 or df[w] > max_df:
            continue
        for a in g:
            for b in g:
                if a != b:
                    coppie[a].add(b)
    M = M.tocsr()
    righe, colonne = [], []
    for a, cs in coppie.items():
        if not anime[a]:
            continue
        lo, hi = M.indptr[a], M.indptr[a + 1]
        idx = M.indices[lo:hi]
        arr = np.asarray(sorted(cs), np.int32)
        pos = np.searchsorted(idx, arr)
        v = pos < len(idx)
        if not v.any():
            continue
        pos, arr = pos[v], arr[v]
        hit = idx[pos] == arr
        pos = pos[hit]
        righe.extend([a] * len(pos)); colonne.extend(idx[pos].tolist())
    if not righe:
        return M, 0
    # IL MOLTIPLICATORE SI APPLICA UNA VOLTA PER ARCO: con `righe` duplicate l'assegnamento
    # indicizzato lascerebbe l'ultimo valore (o applicherebbe il fattore piu' volte).
    C = M.tocoo()
    chiave = set(zip(righe, colonne))
    f = np.ones(len(C.data), np.float32)
    for k, (r, c) in enumerate(zip(C.row.tolist(), C.col.tolist())):
        if (r, c) in chiave:
            f[k] = fattore
    out = sp.csr_matrix((C.data * f, (C.row, C.col)), shape=M.shape).tocsr()
    return out, len(chiave)


def gate_popolarita(M, voti, tau=3.0, slope=1.5, smooth=False):
    """Cancello sulla distanza di popolarita' fra i due titoli.

    peso <- peso * exp(-max(0, |log1p(voti_i) - log1p(voti_j)| - tau)/slope)
    Sotto `tau` (3,0 = ~20x di voti) non tocca nulla: e' l'arco "stessa lega". Sopra, attenua.
    Colpisce il filler da 40 voti accanto al blockbuster, lascia stare i vicini di pari livello.
    """
    C = M.tocoo()
    L = np.log1p(np.maximum(voti, 0))
    gap = np.abs(L[C.col] - L[C.row])
    if smooth:
        f = np.exp(-gap / slope).astype(np.float32)          # fattore continuo, nessuna soglia
    else:
        f = np.exp(-np.maximum(0.0, gap - tau) / slope).astype(np.float32)
    out = sp.csr_matrix((C.data * f, (C.row, C.col)), shape=M.shape).tocsr()
    forma = f'continuo tau={slope:g}' if smooth else f'cerniera tau={tau:g} · slope={slope:g}'
    print(f'  gate popolarita ({forma}): attenua {100*float((f<0.95).mean()):.1f}% degli archi', flush=True)
    out.setdiag(0)
    out.eliminate_zeros()
    return out


def _attributi_produzione():
    """Per ogni titolo del canone: (regista, set attori, set case di produzione)."""
    import pandas as pd
    from . import data as D
    B = D.basic(); RO = B['row_of']
    out = {}
    for f, pre in (('.cache/tmdb/movies.parquet', 'movie'), ('.cache/tmdb/tv.parquet', 'tv')):
        d = pd.read_parquet(f)
        cols = set(d.columns)
        for row in d.itertuples():
            i = RO.get(f'{pre}:{int(row.id)}')
            if i is None: continue
            dire = 0
            for campo in ('directors', 'created_by'):
                if campo in cols:
                    v = getattr(row, campo, None)
                    if isinstance(v, str):
                        try:
                            lst = json.loads(v)
                        except Exception:
                            lst = []
                        for e in lst:
                            if isinstance(e, dict) and e.get('id') is not None:
                                dire = int(e['id']); break
                if dire: break
            def ids(campo):
                v = getattr(row, campo, None)
                if not isinstance(v, str): return set()
                try: lst = json.loads(v)
                except Exception: return set()
                return {int(e['id']) for e in lst if isinstance(e, dict) and e.get('id') is not None}
            out[i] = (dire, ids('cast'), ids('production_companies'))
    print(f'  attributi di produzione: {len(out):,} titoli', flush=True)
    return out


def damping_famiglia(M, titoli, coll, attr, max_df=400, min_len=4, pena=0.35):
    """Penalizza i legami di FAMIGLIA che non sono "stessa lavorazione".

    Candidati a famiglia: stessa collezione TMDB (>0) oppure un token raro condiviso nel titolo.
    Restano intatti se condividono regia, almeno un attore o una casa di produzione: cosi'
    John Wick 2, Il padrino II, Alien3 sopravvivono, mentre i cartoni Barbie (regista, cast e casa
    diversi) vengono abbassati.
    """
    import re
    from collections import defaultdict
    coppie = defaultdict(set)

    ids, counts = np.unique(coll[coll > 0], return_counts=True)
    size = dict(zip(ids.tolist(), counts.tolist()))
    gruppi_coll = defaultdict(list)
    for i in np.flatnonzero(coll > 0):
        gruppi_coll[int(coll[i])].append(int(i))
    for cid, g in gruppi_coll.items():
        for a in g:
            for b in g:
                if a != b: coppie[a].add(b)

    toks = []
    for t in titoli:
        s = re.sub(r"[^0-9a-zàèéìòù']+", ' ', str(t).lower())
        toks.append({w for w in s.split() if len(w) >= min_len})
    df = defaultdict(int)
    for s in toks:
        for w in s: df[w] += 1
    gruppi_tok = defaultdict(list)
    for i, s in enumerate(toks):
        for w in s:
            if df[w] <= max_df: gruppi_tok[w].append(i)
    for w, g in gruppi_tok.items():
        if len(g) < 2: continue
        for a in g:
            for b in g:
                if a != b: coppie[a].add(b)

    M = M.tocsr(); tot = 0
    for a, cs in coppie.items():
        ca = attr.get(a)
        if ca is None: continue
        start, end = M.indptr[a], M.indptr[a + 1]
        if start == end: continue
        idx = M.indices[start:end]
        arr = np.asarray(sorted(cs), np.int32)
        pos = np.searchsorted(idx, arr)
        v = pos < len(idx)
        if not v.any(): continue
        pos = pos[v]; arr = arr[v]
        hit = idx[pos] == arr
        if not hit.any(): continue
        pos = pos[hit]; arr = arr[hit]
        pena_mask = np.ones(len(arr), bool)
        for k, b in enumerate(arr):
            cb = attr.get(int(b))
            if cb is None: pena_mask[k] = False; continue
            # esente se stessa mano: regia comune o almeno un attore in comune.
            # La casa di produzione NON esenta: Mattel produce sia Barbie 2023 sia i cartoni.
            if ca[0] and ca[0] == cb[0]: pena_mask[k] = False; continue
            if ca[1] & cb[1]: pena_mask[k] = False; continue
        sel = pos[pena_mask]
        if len(sel):
            M.data[start + sel] *= pena
            tot += len(sel)
    M.eliminate_zeros()
    return M, tot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--modo', choices=['somma', 'rrf', 'potenza', 'quota'], default='somma')
    ap.add_argument('--alpha', type=float, default=0.4)
    ap.add_argument('--pota', type=int, default=0, help='0 = tieni tutto')
    ap.add_argument('--simmetrizza', action='store_true')
    ap.add_argument('--damp-coll', action='store_true')
    ap.add_argument('--hub-tipi', default='CAST,PROD')
    ap.add_argument('--hub-beta', type=float, default=0.25)
    ap.add_argument('--rrf-k', type=int, default=60)
    ap.add_argument('--temperatura', default='',
                    help='k e troncatura per tipo, es. "LISTSEM:3:15;CREWPROP:3:15;LIST:5:40"')
    ap.add_argument('--pop-gap', type=float, default=0.0)
    ap.add_argument('--pop-slope', type=float, default=1.5)
    ap.add_argument('--gate-asimmetrico', action='store_true',
                    help='ticket 04: attenua solo verso l alto, e verso il basso solo i direct-to-video')
    ap.add_argument('--gate-k', type=float, default=10.0)
    ap.add_argument('--gate-vave', type=float, default=6.8)
    ap.add_argument('--gate-runtime', type=float, default=85.0)
    ap.add_argument('--pop-smooth', action='store_true')
    ap.add_argument('--damp-titolo', action='store_true')
    ap.add_argument('--damp-animazione', action='store_true',
                    help='smorza gli archi animazione <-> live-action')
    ap.add_argument('--damp-anim-fattore', type=float, default=0.2)
    ap.add_argument('--damp-anime-saga', action='store_true',
                    help='ticket 11: smorza gli archi saga dentro gli anime (x0.15)')
    ap.add_argument('--tipi', default='')
    a = ap.parse_args()

    from . import data as D
    N = D.basic()['N']
    os.makedirs(DST, exist_ok=True)
    # BUG (handoff 5, 4): questo `open` era incondizionato e leggeva un percorso fisso, quindi su una
    # macchina senza `services/graph/data/tipi/` la build moriva prima di guardare `--tipi`.
    if a.tipi:
        tipi = [t.strip() for t in a.tipi.split(',') if t.strip()]
    else:
        tipi = sorted(json.load(open('services/graph/data/tipi/manifest.json', encoding='utf-8')))
    pf = f'{DST}/pesi.json'
    # NIENTE FALLBACK A 1,0 (ticket 12). Senza questo file una build intera e' passata con tutti i
    # pesi uguali e ce ne siamo accorti solo perche' il comportamento di DIR era strano: l'errore
    # silenzioso costa piu' di una build rifiutata.
    if not os.path.exists(pf):
        raise FileNotFoundError(
            f"pesi mancanti: {pf}\\n"
            f"  Il mixer NON assume pesi uguali: scrivi il file con i pesi dichiarati "
            f"(es. {{'COVISION': 1.0, 'KWSEM': 0.7, ...}}).")
    pesi = json.load(open(pf, encoding='utf-8'))
    assenti = [t for t in tipi if t not in pesi]
    if assenti:
        raise KeyError(f"{pf}: pesi assenti per {assenti} — un tipo senza peso dichiarato non entra")
    pesi = {t: float(pesi[t]) for t in tipi}
    print(f'modo {a.modo} · pesi ' + ' · '.join(f'{t}={pesi[t]:g}' for t in tipi), flush=True)

    M = None
    for t in tipi:
        A = carica(t, N)
        if a.hub_tipi and t in a.hub_tipi.split(','):
            A = correggi_hub(A, a.hub_beta)
        if a.modo == 'rrf':
            # `--temperatura TIPO:k:tronca` (ripetibile): k corto per i tipi specialistici.
            kt, tg = a.rrf_k, 0
            for spec in (a.temperatura or '').split(';'):
                if not spec.strip():
                    continue
                nome, _, resto = spec.partition(':')
                if nome.strip() != t:
                    continue
                pezzi = resto.split(':')
                kt = int(pezzi[0]) if pezzi and pezzi[0] else kt
                tg = int(pezzi[1]) if len(pezzi) > 1 and pezzi[1] else 0
            A = rrf(A, pesi[t], k=kt, taglia=tg)
        elif a.modo == 'potenza':
            A = A.copy()
            A.data = (np.power(A.data, a.alpha) * pesi[t]).astype(np.float32)
        elif a.modo == 'quota':
            A = A.copy()
            A.data = np.power(A.data, a.alpha).astype(np.float32)
            rs = np.asarray(A.sum(1)).ravel()
            inv = np.where(rs > 0, 1.0 / np.maximum(rs, 1e-12), 0.0)
            A = sp.diags(inv).dot(A).tocsr()
            A.data = (A.data * pesi[t]).astype(np.float32)
            A.eliminate_zeros()
        else:
            A = A.multiply(pesi[t]).tocsr()
        M = A if M is None else M + A
        print(f'  + {t:<9} {A.nnz:>10,} archi · massa {M.sum():,.0f} ({time.time()-T0:.0f}s)', flush=True)

    M = M.tocsr()
    M.setdiag(0)
    M.eliminate_zeros()
    if a.pota:
        rows, cols, vals = [], [], []
        for i in range(N):
            r = M.getrow(i)
            if r.nnz <= a.pota:
                rows.append(np.full(r.nnz, i, np.int32)); cols.append(r.indices.astype(np.int32))
                vals.append(r.data.astype(np.float32)); continue
            o = np.argpartition(-r.data, a.pota)[:a.pota]
            rows.append(np.full(a.pota, i, np.int32)); cols.append(r.indices[o].astype(np.int32))
            vals.append(r.data[o].astype(np.float32))
        M = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(N, N))
    if a.damp_coll or a.damp_titolo:
        attr = _attributi_produzione()
        M, n = damping_famiglia(M, D.basic()['titoli'], D.basic()['COLL'].astype(np.int64), attr)
        print(f'  damping famiglia: {n:,} archi di famiglia senza lavorazione comune penalizzati', flush=True)
    if a.damp_animazione:
        M = damp_animazione(M, _animazione(), a.damp_anim_fattore)
    if a.damp_anime_saga:
        B = D.basic()
        mMeta = np.load(D.C.SRC / D.C.META, allow_pickle=True)
        M, n_anime = damp_anime_saga(M, mMeta['ANIME'], B['COLL'].astype(np.int64), B['titoli'])
        print(f'  damping anime-saga: {n_anime:,} archi smorzati (x0.15)', flush=True)
    if a.pop_smooth:
        M = gate_popolarita(M, D.basic()['VOT'], 0.0, a.pop_slope, smooth=True)
    elif a.gate_asimmetrico:
        B = D.basic()
        M = gate_popolare_asimmetrico(M, B['VOT'], B['VAVE'], _runtime(),
                                      k_pop=a.gate_k, tau=a.pop_gap or 2.0, slope=a.pop_slope,
                                      vave_min=a.gate_vave, runtime_min=a.gate_runtime)
    elif a.pop_gap:
        M = gate_popolarita(M, D.basic()['VOT'], a.pop_gap, a.pop_slope)
    if a.simmetrizza:
        M = ((M + M.T) * 0.5).tocsr()
        M.setdiag(0); M.eliminate_zeros()

    suffisso = ('-dc' if a.damp_coll else '') + ('-dt' if a.damp_titolo else '') + ('-ga' if a.gate_asimmetrico else '')
    out = f'{DST}/MIX-{a.modo}{suffisso}.npz'
    from . import provenance as PV
    _params = {'modo': a.modo, 'alpha': a.alpha, 'pota': a.pota, 'simmetrizza': a.simmetrizza,
               'damp_coll': a.damp_coll, 'damp_titolo': a.damp_titolo, 'rrf_k': a.rrf_k,
               'temperatura': a.temperatura,
               'pop_gap': a.pop_gap, 'pop_slope': a.pop_slope, 'pop_smooth': a.pop_smooth,
               'gate_asimmetrico': a.gate_asimmetrico, 'gate_k': a.gate_k,
               'damp_animazione': a.damp_animazione, 'damp_anim_fattore': a.damp_anim_fattore, 'damp_anime_saga': a.damp_anime_saga,
               'gate_vave': a.gate_vave, 'gate_runtime': a.gate_runtime,
               'hub_tipi': a.hub_tipi, 'hub_beta': a.hub_beta, 'pesi': pesi, 'tipi': tipi}
    _inputs = {t: PV.sha256_file(f'{SRC}/{t}.npz') for t in tipi}
    PV.scrivi(out, M, step='mixer', params=_params, inputs=_inputs, canon_len=N)
    g = np.asarray((M > 0).sum(1)).ravel()
    print(f'scritto {out} · archi {M.nnz:,} · copertura {100*(g>0).mean():.1f}% · '
          f'grado mediano {int(np.median(g[g>0]))} · massa {M.sum():,.0f}', flush=True)


if __name__ == '__main__':
    main()
