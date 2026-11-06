"""Co-visione: calibrazione su campione + costruzione dell'artefatto.

  PYTHONPATH=services py -m graph.build.covision calibrate
  PYTHONPATH=services py -m graph.build.covision build --alpha 0.5 --kappa 3

Score per coppia, dentro una fonte:
    NPMI+ * log1p(Cw) * Cw/(Cw+kappa) * t
      w_u = 1/sqrt(k_u-1), k grezzo, media 1, tetto CAPx
      t   = 0.3 + 0.7*Cw_late/Cw se la finestra 365g e' osservabile, altrimenti 1
Fonti normalizzate sul proprio p99, fuse per MASSIMO, poi top-k per riga.
"""
import argparse
import datetime as dt
import glob
import json
import os
import pathlib
from collections import defaultdict

import numpy as np
import pandas as pd
import scipy.sparse as sp
from . import config as C, data as D

B = D.basic(); N = B['N']; RO = B['row_of']; TITLES = B['titoli']; IS_TV = B['is_tv']
RELEASE = np.load(os.environ.get('USCITE_ORDINALI', C.DATA / 'uscite-ordinali.npy')).astype(np.int64)
LAG = 365
CAP = 3.0
SEMPLICE = False
BLOCK = 400
OUT = str(C.BUILD_CACHE)
D_OUT_CAL = str(C.BUILD_CACHE / 'covision-calibration.md')


def item(key): return RO.get(key)


def day_iso(s):
    try: return dt.date.fromisoformat(str(s)[:10]).toordinal()
    except (ValueError, TypeError): return 0


# ---------------------------------------------------------------- caricamento

def _pack(users, raw_len):
    names = [u for u, xs in users.items() if xs]
    uid = {u: i for i, u in enumerate(names)}
    rr, cc = [], []
    for u in names:
        xs = users[u]
        rr.extend([uid[u]] * len(xs)); cc.extend(xs)
    X = sp.csr_matrix((np.ones(len(rr), np.float32), (rr, cc)), shape=(len(names), N), dtype=np.float32)
    X.sum_duplicates(); X.data[:] = 1.0; X.eliminate_zeros()
    k = np.asarray([raw_len.get(u, 1) for u in names], np.float64)
    return X, k, names


def load_trakt():
    users = defaultdict(set); raw = defaultdict(set); times = defaultdict(dict); files = 0; max_day = 0
    # ATTENZIONE: `TRAKT_CACHE` di build_graph.py e' il FILE npz compatto, non la cartella dei JSON.
    # Usarlo come cartella azzera la fonte Trakt (verificato: 0 file). La cartella si puo' cambiare
    # con `TRAKT_DIR`, che e' un nome distinto proprio per non confondere le due cose.
    _dir = os.environ.get('TRAKT_DIR', '.cache/trakt/users')
    for f in glob.glob(os.path.join(_dir, 'movie-*.json')) + glob.glob(os.path.join(_dir, 'show-*.json')):
        base = os.path.basename(f)[:-5]
        if base.startswith('movie-'): typ, user = 'movie', base[6:]
        elif base.startswith('show-'): typ, user = 'tv', base[5:]
        else: continue
        try: data = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        if not isinstance(data, list): continue
        files += 1
        for e in data:
            t = day_iso(e.get('last_watched_at') or e.get('watched_at'))
            if t > max_day: max_day = t
            tmdb = (e.get('movie') if typ == 'movie' else e.get('show') or {}).get('ids', {}).get('tmdb')
            if not tmdb: continue
            raw[user].add((typ, int(tmdb)))
            i = item(f'{typ}:{int(tmdb)}')
            if i is None: continue
            users[user].add(i)
            if t > times[i].get(user, 0): times[i][user] = t
    X, k, names = _pack(users, {u: len(v) for u, v in raw.items()})
    idx = {u: r for r, u in enumerate(names)}
    rr, cc = [], []
    for i, per_user in times.items():
        rel = int(RELEASE[i])
        if rel <= 0: continue
        thr = rel + LAG
        for u, t in per_user.items():
            r = idx.get(u)
            if r is not None and t > thr:
                rr.append(r); cc.append(i)
    Xl = sp.csr_matrix((np.ones(len(rr), np.float32), (rr, cc)), shape=X.shape, dtype=np.float32)
    Xl.sum_duplicates(); Xl.data[:] = 1.0; Xl.eliminate_zeros()
    return X, k, Xl, times, files, max_day


def load_id_list(pattern, mapper):
    users = defaultdict(set); raw = defaultdict(set); files = entries = 0
    for f in glob.glob(pattern):
        if os.path.basename(f) == '_users.json': continue
        try: xs = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        if not isinstance(xs, list): continue
        files += 1; entries += len(xs); u = os.path.basename(f)[:-5]
        for x in xs:
            try: raw[u].add(int(x))
            except (ValueError, TypeError): pass
            i = mapper(x)
            if i is not None: users[u].add(i)
    X, k, _ = _pack(users, {u: len(v) for u, v in raw.items()})
    return X, k, files, entries


def load_anilist():
    art = json.load(open('.cache/tmdb/anime-mappings.json', encoding='utf-8'))
    mal_tmdb = {int(m): int(t) for m, t in art['malToTmdb']}
    runtime_map = pathlib.Path(os.environ.get('ANILIST_RUNTIME_MAP', C.RECIPES / 'anilist-runtime-map.json'))
    rt = json.load(open(runtime_map, encoding='utf-8'))
    mal_type = dict(rt['type'])
    def mapper(x):
        try: m = int(x)
        except (ValueError, TypeError): return None
        t = mal_tmdb.get(m); typ = mal_type.get(str(m))
        return item(f'{typ}:{t}') if t and typ in ('movie', 'tv') else None
    return load_id_list('.cache/anilist/users/*.json', mapper)


def load_serializd():
    def mapper(x):
        try: return item(f'tv:{int(x)}')
        except (ValueError, TypeError): return None
    return load_id_list('.cache/serializd/users/*.json', mapper)


def load_movielens():
    links = pd.read_csv('.cache/movielens/ml-32m/links.csv', usecols=['movieId', 'tmdbId'])
    m2r = {}
    for mid, tm in zip(links.movieId, links.tmdbId):
        if pd.notna(tm):
            i = item(f'movie:{int(tm)}')
            if i is not None: m2r[int(mid)] = i
    rrs, ccs, tts = [], [], []
    mu = md = 0
    for chunk in pd.read_csv('.cache/movielens/ml-32m/ratings.csv',
                             usecols=['userId', 'movieId', 'timestamp'], chunksize=4_000_000):
        ir = chunk.movieId.map(m2r); ok = ir.notna().to_numpy().copy()
        if ok.any():
            rrs.append(chunk.userId.to_numpy(np.int32)[ok] - 1)
            ccs.append(ir.to_numpy(np.int32, na_value=-1)[ok])
            tts.append((chunk.timestamp.to_numpy(np.int64)[ok] // 86400) + 719163)
        mu = max(mu, int(chunk.userId.max()))
        md = max(md, int(chunk.timestamp.max()) // 86400 + 719163)
        print(f'  MovieLens lette {sum(len(x) for x in rrs):,} righe', flush=True)
    rr = np.concatenate(rrs); cc = np.concatenate(ccs); tt = np.concatenate(tts)
    del rrs, ccs, tts
    X = sp.csr_matrix((np.ones(len(rr), np.float32), (rr, cc)), shape=(mu, N), dtype=np.float32)
    X.sum_duplicates(); X.data[:] = 1.0; X.eliminate_zeros()
    k = np.asarray(X.getnnz(axis=1)).ravel().astype(np.float64)
    # BUG (handoff 5, 5): `np.where(RELEASE[cc] > 0, RELEASE[cc], 0) + LAG` per un film senza data di
    # uscita dava soglia = giorno ordinale 365, cioe' considerava "tardiva" ogni visione. `load_trakt`
    # fa la cosa giusta (salta quei film): qui ci si allinea. Il damp temporale non era comunque
    # applicato a quelle coppie (`observable` richiede rel>0), quindi l'effetto sui numeri e' nullo:
    # era un'incongruenza fra i due loader, non la causa della differenza di COVISION fra build.
    keep = (RELEASE[cc] > 0) & (tt > RELEASE[cc] + LAG)
    Xl = sp.csr_matrix((np.ones(int(keep.sum()), np.float32), (rr[keep], cc[keep])), shape=(mu, N), dtype=np.float32)
    Xl.sum_duplicates(); Xl.data[:] = 1.0; Xl.eliminate_zeros()
    del rr, cc, tt, keep
    return X, k, Xl, md


def load_all():
    print('carico Trakt...', flush=True)
    Xt, kt, Xlt, times_t, trakt_files, trakt_max = load_trakt()
    print('carico MovieLens...', flush=True)
    Xm, km, Xlm, ml_max = load_movielens()
    print('carico AniList...', flush=True)
    Xa, ka, anilist_files, _ = load_anilist()
    print('carico Serializd...', flush=True)
    Xs, ks, serial_files, _ = load_serializd()
    src = {
        'MovieLens': dict(X=Xm, Xl=Xlm, k=km, max_day=ml_max),
        'Trakt': dict(X=Xt, Xl=Xlt, k=kt, max_day=trakt_max),
        'AniList': dict(X=Xa, Xl=None, k=ka, max_day=0),
        'Serializd': dict(X=Xs, Xl=None, k=ks, max_day=0),
    }
    for name, d in src.items():
        print(f'  {name}: {d["X"].shape[0]:,} utenti · {d["X"].nnz:,} coppie utente-item', flush=True)
    print(f'  file: trakt {trakt_files} · anilist {anilist_files} · serializd {serial_files}', flush=True)
    return src


# ---------------------------------------------------------------- pesi e score

def user_weights(k, alpha):
    w = np.zeros(len(k), np.float64)
    act = k > 0
    w[act] = 1.0
    if alpha:
        multi = act & (k > 1)
        w[multi] = np.power(k[multi] - 1.0, -alpha)
        w[act] /= w[act].mean()
        w[act] = np.minimum(w[act], CAP * w[act].mean())
    return w


def npmi(c, ci, cj, u):
    out = np.zeros(len(c))
    ok = (c > 0) & (ci > 0) & (cj > 0)
    if not ok.any(): return out
    pmi = np.log(c[ok] * u / (ci * np.maximum(cj[ok], 1e-12)))
    den = -np.log(np.minimum(c[ok] / u, 1 - 1e-12))
    good = den > 1e-12
    sub = np.zeros(len(pmi))
    sub[good] = np.maximum(pmi[good] / den[good], 0.0)
    out[ok] = sub
    return out


def score(cw, cwl, ci, cj, u, kappa, rel_i, rel_j, max_day):
    s = npmi(cw, ci, cj, u) * np.log1p(cw)
    if kappa: s = s * (cw / (cw + kappa))
    if cwl is None or SEMPLICE: return s
    thr = np.maximum(rel_i, rel_j) + LAG
    observable = (rel_i > 0) & (rel_j > 0) & (max_day > thr)
    ratio = np.where(cw > 0, cwl / np.maximum(cw, 1e-12), 0.0)
    return s * np.where(observable, 0.3 + 0.7 * ratio, 1.0)


def prepare(d, alpha):
    X = d['X']; w = user_weights(d['k'], alpha)
    Xt = X.T.tocsr()
    prep = dict(X=X, Xt=Xt, w=w, Xw=X.multiply(w[:, None]).tocsr(),
                marg=np.asarray(Xt @ w).ravel(), u=float(w.sum()),
                Xl=d['Xl'], max_day=d['max_day'])
    if d['Xl'] is not None:
        prep['Xlt'] = d['Xl'].T.tocsr()
        prep['Xlw'] = d['Xl'].multiply(w[:, None]).tocsr()
    return prep


def rows_topk(prep, rows, kappa, topk, minsup=1.0):
    Xw = prep['Xw']; marg = prep['marg']
    Xb = prep['Xt'][rows]
    Cb = (Xb @ Xw).tocsr()
    Clb = (prep['Xlt'][rows] @ prep['Xlw']).tocsr() if prep.get('Xlw') is not None else None
    res = {}
    for r, i in enumerate(rows):
        row = Cb.getrow(r); js = row.indices; cw = row.data.astype(np.float64)
        keep = (js != i) & (cw >= minsup)
        js = js[keep]; cw = cw[keep]
        if not len(js): continue
        if Clb is not None:
            lrow = Clb.getrow(r)
            pos = np.searchsorted(lrow.indices, js)
            hit = pos < len(lrow.indices)
            cwl = np.zeros(len(js))
            if hit.any():
                idx = pos[hit]
                valid = lrow.indices[idx] == js[hit]
                cwl[np.flatnonzero(hit)[valid]] = lrow.data[idx][valid]
        else:
            cwl = None
        sc = score(cw, cwl, marg[i], marg[js], prep['u'], kappa, RELEASE[i], RELEASE[js], prep['max_day'])
        sel = np.argpartition(-sc, min(topk, len(sc) - 1))[:topk] if len(sc) > topk else np.arange(len(sc))
        sel = sel[np.argsort(-sc[sel])]
        res[int(i)] = (js[sel].astype(np.int32), sc[sel].astype(np.float32))
    return res


def source_topk(d, rows, alpha, kappa, topk, minsup=1.0):
    prep = prepare(d, alpha)
    res = rows_topk(prep, rows, kappa, topk, minsup)
    return {i: list(zip(js.tolist(), sc.tolist())) for i, (js, sc) in res.items()}, prep['marg'], prep['u']


# ---------------------------------------------------------------- calibrazione

def v10():
    try: return D.triangle()
    except Exception as e:
        print(f'  (V10 non disponibile: {e})', flush=True); return None


def bubble_rate(top, rele, is_tv_seed):
    if is_tv_seed or rele <= 0: return None
    ok = [j for j, _ in top if RELEASE[j] > 0]
    if not ok: return None
    near = sum(1 for j in ok if abs(int(RELEASE[j]) - int(rele)) <= LAG)
    return near / len(ok)


def calibrate():
    src = load_all()
    S10 = v10()
    rng = np.random.default_rng(7)
    pop = np.flatnonzero(np.asarray(src['Trakt']['X'].T @ np.ones(src['Trakt']['X'].shape[0])).ravel() >= 5)
    films = [i for i in pop if not IS_TV[i]]
    series = [i for i in pop if IS_TV[i]]
    sample = list(rng.choice(films, 120, replace=False)) + list(rng.choice(series, 80, replace=False))
    for key in ('movie:346698', 'movie:872585', 'tv:1396', 'tv:63351', 'tv:1429', 'movie:496243'):
        i = item(key)
        if i is not None and i not in sample: sample.append(i)
    sample = np.array(sorted(set(int(x) for x in sample)))
    print(f'\ncampione: {len(sample)} seed ({sum(1 for i in sample if IS_TV[i])} serie)', flush=True)

    rows = []
    for alpha in (0.0, 0.5):
        for kappa, minsup in ((0.0, 1.0), (0.0, 2.0), (0.0, 3.0), (3.0, 1.0)):
            per_source = {}
            for name in ('MovieLens', 'Trakt', 'AniList', 'Serializd'):
                res, _, _ = source_topk(src[name], sample, alpha, kappa, 10, minsup)
                pool = np.array([v for vals in res.values() for _, v in vals])
                per_source[name] = (res, float(np.percentile(pool, 99)) if len(pool) else 1.0)

            def pool_of(names=None):
                def f(i):
                    acc = {}
                    for name, (res, p99) in per_source.items():
                        if names and name not in names: continue
                        for j, v in res.get(i, []):
                            acc[j] = max(acc.get(j, -1.0), v / p99)
                    return sorted(acc.items(), key=lambda kv: -kv[1])[:10]
                return f

            def evaluate(f):
                bubbles, overlaps = [], []
                for i in sample:
                    top = f(i)
                    if not top: continue
                    b = bubble_rate(top, int(RELEASE[i]), bool(IS_TV[i]))
                    if b is not None: bubbles.append(b)
                    if S10 is not None:
                        r = S10.getrow(i)
                        if r.nnz:
                            g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
                            ref = set(int(x) for x in np.argsort(-g)[:10])
                            cand = set(j for j, _ in top)
                            overlaps.append(len(ref & cand) / len(ref | cand))
                bm = float(np.mean(bubbles)) if bubbles else float('nan')
                bmed = float(np.median(bubbles)) if bubbles else float('nan')
                ov = float(np.mean(overlaps)) if overlaps else float('nan')
                return bm, bmed, ov

            bm, bmed, ov = evaluate(pool_of())
            _, _, ov_ml = evaluate(pool_of(['MovieLens']))
            _, _, ov_tr = evaluate(pool_of(['Trakt']))
            rows.append((alpha, kappa, minsup, bm, bmed, ov, ov_ml, ov_tr))
            print(f'  alpha={alpha} kappa={kappa:g} minsup={minsup:g} fatto', flush=True)

    header = '| alpha | kappa | minsup | bolla media | bolla mediana | Jaccard V10 fuse | solo MovieLens | solo Trakt |'
    sep = '|---|---|---|---|---|---|---|---|'
    print()
    print(header); print(sep)
    for a, kp, ms, bm, bmed, ov, ov_ml, ov_tr in rows:
        print(f'| {a} | {kp:g} | {ms:g} | {bm:.3f} | {bmed:.3f} | {ov:.3f} | {ov_ml:.3f} | {ov_tr:.3f} |')

    report = [
        '# Calibrazione co-visione', '',
        'Campione: 120 film + 80 serie con supporto Trakt>=5, piu 6 ancore.', '',
        'Bolla = quota di vicini top-10 entro 365 giorni dalla release del seed (solo seed film).', '',
        'Jaccard V10 = sovrapposizione top-10 con il triangolo V10 (riferimento comportamentale, non oracolo).', '',
        'Fonti normalizzate sul proprio p99, non sul massimo del seed.', '',
        header, sep,
    ]
    for a, kp, ms, bm, bmed, ov, ov_ml, ov_tr in rows:
        report.append(f'| {a} | {kp:g} | {ms:g} | {bm:.3f} | {bmed:.3f} | {ov:.3f} | {ov_ml:.3f} | {ov_tr:.3f} |')
    pathlib.Path(D_OUT_CAL).write_text(chr(10).join(report) + chr(10), encoding='utf-8')

def build(alpha, kappa, topk, minsup, topk_per_source=50):
    src = load_all()
    names = ['MovieLens', 'Trakt', 'AniList', 'Serializd']
    per = {n: (np.full((N, topk_per_source), -1, np.int32),
               np.zeros((N, topk_per_source), np.float32)) for n in names}
    for n in names:
        prep = prepare(src[n], alpha)
        print(f'  {n}: pesi pronti', flush=True)
        for st in range(0, N, BLOCK):
            rows = np.arange(st, min(st + BLOCK, N))
            res = rows_topk(prep, rows, kappa, topk_per_source, minsup)
            idx, val = per[n]
            for i, (js, sc) in res.items():
                idx[i, :len(js)] = js; val[i, :len(js)] = sc
            if st % (BLOCK * 40) == 0:
                print(f'    {n} {min(st + BLOCK, N)}/{N}', flush=True)
        per[n] = (idx, val)
        print(f'  {n}: fatto', flush=True)

    p99 = {}
    for n in names:
        idx, val = per[n]
        v = val[val > 0]
        p99[n] = float(np.percentile(v, 99)) if len(v) else 1.0
        print(f'  p99 {n}: {p99[n]:.3f}', flush=True)

    if SEMPLICE:
        # merge per massimo del punteggio grezzo: la prova piu' forte vince, nessuna scala inventata
        best = {}
        for n in names:
            idx, val = per[n]
            for i in range(N):
                for j, v in zip(idx[i], val[i]):
                    if j >= 0 and v > best.get((i, int(j)), -1):
                        best[(i, int(j))] = float(v)
        r0 = np.fromiter((k[0] for k in best), np.int32, len(best))
        c0 = np.fromiter((k[1] for k in best), np.int32, len(best))
        v0 = np.fromiter(best.values(), np.float32, len(best))
        W = sp.csr_matrix((v0, (r0, c0)), shape=(N, N))
        W.setdiag(0); W.eliminate_zeros()
        out = os.environ.get('COVISION_OUT', str(C.BUILD_CACHE / 'covision-semplice.npz'))
        np.savez_compressed(out, indptr=W.indptr, indices=W.indices, data=W.data,
                            p99=np.array([p99[n] for n in names]))
        print(f'scritto {out} · archi {W.nnz:,}', flush=True)
        return
    cand = {}
    for i in range(N):
        acc = {}
        for bit, n in enumerate(names):
            idx, val = per[n]
            for j, v in zip(idx[i], val[i]):
                if j < 0: continue
                s2 = min(float(v) / p99[n], 1.0)
                prev = acc.get(int(j))
                if prev is None or s2 > prev[0]:
                    acc[int(j)] = (s2, 1 << bit)
                else:
                    acc[int(j)] = (prev[0], prev[1] | (1 << bit))
        if acc: cand[i] = acc

    # simmetrizza i candidati PRIMA di troncare: un hub non accumula archi in entrata senza limite
    sym = {}
    for i, acc in cand.items():
        for j, (v, m) in acc.items():
            cur = sym.get((i, j))
            sym[(i, j)] = (v, m) if cur is None else (max(cur[0], v), cur[1] | m)
            cur = sym.get((j, i))
            sym[(j, i)] = (v, m) if cur is None else (max(cur[0], v), cur[1] | m)

    by_row = {}
    for (i, j), vm in sym.items():
        by_row.setdefault(i, []).append((j, vm))
    rows_out, cols_out, vals_out, mask_out = [], [], [], []
    for i, lst in by_row.items():
        top = sorted(lst, key=lambda kv: -kv[1][0])[:topk]
        for j, (v, m) in top:
            rows_out.append(i); cols_out.append(j); vals_out.append(v); mask_out.append(m)

    W = sp.csr_matrix((np.float32(vals_out), (np.int32(rows_out), np.int32(cols_out))), shape=(N, N))
    W.setdiag(0); W.eliminate_zeros()
    out = os.environ.get('COVISION_OUT', str(C.BUILD_CACHE / 'covision.npz'))
    np.savez_compressed(out, indptr=W.indptr, indices=W.indices, data=W.data,
                        p99=np.array([p99[n] for n in names]), mask=np.asarray(mask_out, np.uint8))
    print(f'scritto {out} · archi {W.nnz:,} · items con archi {int((np.diff(W.indptr) > 0).sum()):,}/{N}', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['calibrate', 'build'])
    ap.add_argument('--alpha', type=float, default=0.5)
    ap.add_argument('--kappa', type=float, default=3.0)
    ap.add_argument('--topk', type=int, default=20)
    ap.add_argument('--semplice', action='store_true')
    ap.add_argument('--minsup', type=float, default=2.0)
    a = ap.parse_args()
    SEMPLICE = bool(a.semplice)
    if a.mode == 'calibrate':
        calibrate()
    else:
        build(a.alpha, a.kappa, a.topk, a.minsup)
