"""valuta.py — misurare un grafo su TRE assi, con l'incertezza dichiarata.

PERCHE' ESISTE. Finora giudicavamo differenze di 0,003-0,008 su R@20 senza intervallo di confidenza.
Con 499 sorgenti curate l'unita' di ricampionamento e' la SORGENTE, non il link: l'MDE a potenza 80%
e' ~0,015, quindi meta' dei confronti degli ultimi mesi era rumore. E il banco curato e' sbilanciato
verso il popolare (collega serie di nicchia a film famosi): da solo non puo' arbitrare accuratezza
contro novita'.

I tre assi:
  banco      recall sui link curati a mano            -> accuratezza
  popolarita quota di titoli >5k voti in top-10       -> quanto e' ovvio
  snips      recall controfattuale sui log Trakt      -> accuratezza de-biasata (vedi trakt.py)

  PYTHONPATH=. py services/graph_dense/valuta.py <grafo.npz> [altri...]
  PYTHONPATH=. py services/graph_dense/valuta.py --confronta A.npz B.npz
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from . import data as D

KS = (5, 10, 20, 50)
BOOT = 10000
Z_ALFA = 1.96          # due code, 95%
Z_POTENZA = 0.84       # potenza 80%
SOGLIA_POP = 5000


def banco(gold: str | None = None):
    """[(riga_sorgente, [(riga_link, peso)])] dal banco curato."""
    p = Path(gold) if gold else Path('.scratch/ml-collaborativo/gold/cross-merged.json')
    d = json.load(open(p, encoding='utf-8'))
    B = D.basic()
    ro = B['row_of']
    casi = []
    for s in d['sources']:
        i = ro.get(s['id'])
        if i is None:
            continue
        links = [(ro[l['id']], float(l.get('w', 1))) for l in s['links'] if l['id'] in ro]
        if links:
            casi.append((i, links))
    return casi


def carica(path) -> sp.csr_matrix:
    from . import provenance as PV
    M, _ = PV.leggi(path)
    return M.tocsr().astype(np.float32)


def _ordine(M, i, taglia=3000):
    r = M.getrow(i)
    if r.nnz == 0:
        return []
    o = np.argsort(-r.data)
    return [int(j) for j in r.indices[o] if int(j) != i][:taglia]


def metriche_per_sorgente(M, casi, ks=KS):
    """Valori PER SORGENTE (serve al bootstrap). Denominatore fisso: un link non trovato vale 0."""
    out = {f'r{k}': [] for k in ks}
    out['rw20'] = []
    out['mrr'] = []
    for i, links in casi:
        rank = {j: k + 1 for k, j in enumerate(_ordine(M, i))}
        for k in ks:
            # CONTEGGIO di link trovati, non somma dei pesi: `rw20` e' l'unica metrica pesata.
            # Sommare i pesi qui gonfiava l'recall di ~2,4x (il peso medio della curatela).
            out[f'r{k}'].append(sum(1 for j, _ in links if rank.get(j, 10 ** 9) <= k) / len(links))
        out['rw20'].append(sum(w for j, w in links if rank.get(j, 10 ** 9) <= 20) /
                           max(sum(w for _, w in links), 1e-9))
        out['mrr'].append(sum(1.0 / rank.get(j, 10 ** 9) for j, _ in links) / len(links))
    return {k: np.asarray(v, np.float64) for k, v in out.items()}


def semi_popolari(n=200, seme=0):
    B = D.basic()
    pop = np.flatnonzero((~B['is_tv']) & (B['VOT'] > SOGLIA_POP))
    rng = np.random.default_rng(seme)
    return rng.choice(pop, min(n, len(pop)), replace=False)


def quota_popolare(M, semi, k=10):
    """Per ogni seme: quota dei primi k (film) sopra la soglia di voti."""
    B = D.basic(); VOT = B['VOT']; TV = B['is_tv']
    out = []
    for i in semi:
        ids = [j for j in _ordine(M, i, k * 4) if not TV[j]][:k]
        if ids:
            out.append(float((VOT[ids] > SOGLIA_POP).mean()))
    return np.asarray(out, np.float64)


def bootstrap_appaiato(a: np.ndarray, b: np.ndarray, replichi=BOOT, seme=20261021):
    """Differenza media b-a con IC 95% e MDE a potenza 80%, ricampionando le sorgenti."""
    a = np.asarray(a, np.float64); b = np.asarray(b, np.float64)
    n = min(len(a), len(b))
    d = b[:n] - a[:n]
    rng = np.random.default_rng(seme)
    idx = rng.integers(0, n, size=(replichi, n))
    medie = d[idx].mean(axis=1)
    delta = float(d.mean())
    lo, hi = np.percentile(medie, [2.5, 97.5])
    sd = float(d.std(ddof=1)) if n > 1 else 0.0
    mde = (Z_ALFA + Z_POTENZA) * sd / np.sqrt(max(n, 1))
    return {'n': n, 'delta': delta, 'lo': float(lo), 'hi': float(hi),
            'sd': sd, 'mde': float(mde), 'significativo': bool(lo > 0 or hi < 0),
            'sopra_mde': bool(abs(delta) >= mde)}


def _transizione(M):
    deg = np.asarray(M.sum(1)).ravel()
    deg[deg <= 0] = 1
    return sp.diags(1.0 / deg) @ M


def _ppr(Tr, semi, alpha=0.60, iterazioni=20):
    n = Tr.shape[0]
    e = np.zeros(n, np.float64)
    np.add.at(e, np.asarray(semi, np.int64), 1.0)
    e /= max(float(e.sum()), 1e-12)
    r = e.copy()
    for _ in range(iterazioni):
        r = alpha * e + (1 - alpha) * (r @ Tr)
    return r


def valuta_trakt(M, max_utenti=400, k=20, seme=0, alpha=0.60, iterazioni=20):
    """SNIPS-recall@k e surprise-recall@k sui log Trakt (split temporale).

    SNIPS: ogni hit pesa 1/p_j (gli item popolari valgono meno), normalizzato sulla somma dei pesi
    dei top-k. Surprise: ogni hit pesa -log p_j (l'auto-informazione), normalizzato sul futuro.
    """
    from . import trakt as TK
    U, I, T = TK.carica()
    casi = TK.split_temporale(U, I, T)
    if not casi:
        return {'snips': float('nan'), 'surprise': float('nan'), 'n': 0}
    prop = TK.propensioni(I)
    rng = np.random.default_rng(seme)
    if len(casi) > max_utenti:
        idx = rng.choice(len(casi), max_utenti, replace=False)
        casi = [casi[i] for i in idx]
    Tr = _transizione(M).tocsr()
    snips, surp = [], []
    for semi, futuro in casi:
        r = _ppr(Tr, semi, alpha, iterazioni)
        r[np.asarray(semi, np.int64)] = -np.inf
        top = np.argpartition(-r, k)[:k]
        top = top[np.argsort(-r[top])]
        w = 1.0 / np.maximum(prop[top], 1e-12)
        colpito = np.isin(top, futuro)
        snips.append(float((w * colpito).sum() / max(w.sum(), 1e-12)))
        info = -np.log(np.maximum(prop[top], 1e-12))
        info_fut = -np.log(np.maximum(prop[futuro], 1e-12))
        surp.append(float((info * colpito).sum() / max(info_fut.sum(), 1e-12)))
    return {'snips': float(np.mean(snips)), 'surprise': float(np.mean(surp)), 'n': len(casi),
            'snips_per': np.asarray(snips), 'surp_per': np.asarray(surp)}


def valuta(path, casi=None, semi=None):
    M = carica(path)
    casi = banco() if casi is None else casi
    semi = semi_popolari() if semi is None else semi
    m = metriche_per_sorgente(M, casi)
    q = quota_popolare(M, semi)
    return {'path': str(path), 'metriche': m, 'pop': q,
            'medie': {k: float(v.mean()) for k, v in m.items()} |
                     {'pop': float(q.mean()) if len(q) else float('nan')}}


def _riga(nome, r):
    e = r['medie']
    return (f"| {nome} | {e['r5']:.3f} | {e['r10']:.3f} | {e['r20']:.3f} | {e['r50']:.3f} | "
            f"{e['rw20']:.3f} | {e['mrr']:.4f} | {e['pop']:.1%} |")


def tabella(risultati, trakt=False):
    # le colonne SNIPS esistono solo se sono state calcolate: una tabella che le dichiara vuote
    # e' peggio di una tabella piu' corta.
    coda = ' SNIPS | surprise |' if trakt else ''
    print(f'| grafo | R@5 | R@10 | R@20 | R@50 | R@20w | MRR | >5k top-10 |{coda}')
    print('|---|---:|---:|---:|---:|---:|---:|---:|' + ('---:|---:|' if trakt else ''))
    for nome, r in risultati:
        riga = _riga(nome, r)
        if trakt:
            t = r.get('trakt') or {}
            riga += f" {t.get('snips', float('nan')):.3f} | {t.get('surprise', float('nan')):.3f} |"
        print(riga)


def confronto(a_nome, a, b_nome, b, chiave='r20'):
    st = bootstrap_appaiato(a['metriche'][chiave], b['metriche'][chiave])
    verso = 'sopra' if st['sopra_mde'] else 'SOTTO'
    print(f"\n{chiave}: {b_nome} - {a_nome} = {st['delta']:+.4f} "
          f"[IC95 {st['lo']:+.4f}, {st['hi']:+.4f}] · n={st['n']} · "
          f"MDE(80%)={st['mde']:.4f} · differenza {verso} l'MDE")
    if not st['significativo']:
        print('  -> non significativa: e\' rumore, non un risultato')
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grafi', nargs='+')
    ap.add_argument('--confronta', action='store_true', help='bootstrap appaiato fra il primo e gli altri')
    ap.add_argument('--chiave', default='r20', choices=[f'r{k}' for k in KS] + ['rw20', 'mrr'])
    ap.add_argument('--trakt', action='store_true', help='aggiunge SNIPS e surprise sui log Trakt')
    ap.add_argument('--utenti', type=int, default=400)
    a = ap.parse_args()
    casi = banco()
    semi = semi_popolari()
    risultati = []
    for p in a.grafi:
        nome = Path(p).parent.name or Path(p).stem
        r = valuta(p, casi, semi)
        if a.trakt:
            r['trakt'] = valuta_trakt(carica(p), max_utenti=a.utenti)
            print(f"  trakt: snips {r['trakt']['snips']:.4f} · surprise {r['trakt']['surprise']:.4f} "
                  f"· {r['trakt']['n']} utenti", flush=True)
        risultati.append((nome, r))
        print(f'  valutato {nome}', flush=True)
    print()
    tabella(risultati, trakt=a.trakt)
    if a.confronta and len(risultati) > 1:
        base_nome, base = risultati[0]
        for nome, r in risultati[1:]:
            confronto(base_nome, base, nome, r, a.chiave)
            if 'trakt' in base and 'trakt' in r:
                st = bootstrap_appaiato(base['trakt']['snips_per'], r['trakt']['snips_per'])
                print(f"SNIPS: {nome} - {base_nome} = {st['delta']:+.4f} "
                      f"[IC95 {st['lo']:+.4f}, {st['hi']:+.4f}] · n={st['n']} utenti · "
                      f"MDE(80%)={st['mde']:.4f} · "
                      f"{'sopra' if st['sopra_mde'] else 'SOTTO'} l'MDE")


if __name__ == '__main__':
    main()
