"""ingestione.py — dalle risposte degli slave a un banco utilizzabile da `valuta.py`.

Il problema pratico: i titoli arrivano scritti a parole («Povere creature!», «Poor Things», «La
favorita»), il canone ha una sua stringa. Serve un aggancio robusto, e **onesto**: se un titolo non si
aggancia, si scarta e si dichiara, non si tira a indovinare.

  PYTHONPATH=. py .scratch/banco-casi/ingestione.py [--min-sim 0.82]

Produce:
  .scratch/banco-casi/banco.json       schema identico a cross-merged.json (per valuta.py)
  .scratch/banco-casi/report.json      copertura per blocco, titoli non agganciati, duplicati
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

from services.graph_dense import config as C, data as D

OUT = Path('.scratch/banco-casi')
STOP = {'the', 'a', 'an', 'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'of', 'el',
        'los', 'las', 'der', 'die', 'das', 'les', 'des'}


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", ' ', s)
    return ' '.join(w for w in s.split() if w and w not in STOP)


def indice(B):
    """(titolo normalizzato -> righe) usando il titolo del canone E il titolo originale TMDB."""
    idx = defaultdict(set)
    for i, t in enumerate(B['titoli']):
        idx[norm(t)].add(i)
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        cols = ['id', 'original_title'] if tipo == 'movie' else ['id', 'original_name']
        try:
            d = pd.read_parquet(C.TMDB / f, columns=cols)
        except Exception:
            continue
        for i, ot in zip(d.id, d[cols[1]]):
            r = B['row_of'].get(f'{tipo}:{int(i)}')
            if r is not None and isinstance(ot, str) and ot.strip():
                idx[norm(ot)].add(r)
    return {k: sorted(v) for k, v in idx.items()}


def aggancia(titolo, anno, idx, chiavi, Y, min_sim, max_diff_anno=1):
    """La riga del canone per un titolo suggerito, o None. Anno usato per disambiguare, non obbligatorio."""
    n = norm(titolo)
    if not n:
        return None, 'vuoto'
    cand = idx.get(n)
    if not cand:
        # seconda chance: somiglianza alta sul titolo normalizzato (refuso, articolo, titolo tradotto)
        vicini = difflib.get_close_matches(n, chiavi, n=3, cutoff=min_sim)
        for v in vicini:
            cand = idx.get(v)
            if cand:
                break
    if not cand:
        return None, 'non in canone'
    if len(cand) == 1:
        return cand[0], 'ok'
    if anno:
        stretti = [r for r in cand if Y[r] > 0 and abs(Y[r] - anno) <= max_diff_anno]
        if len(stretti) == 1:
            return stretti[0], 'ok-anno'
        if stretti:
            return stretti[0], 'ambiguo-anno'
    return cand[0], 'ambiguo'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--min-sim', type=float, default=0.82)
    a = ap.parse_args()
    B = D.basic()
    Y, KEYS = B['year'], B['keys']
    idx = indice(B)
    chiavi = sorted(idx)
    print(f'indice: {len(chiavi):,} titoli normalizzati (canone + titoli originali)')

    fonti, report = [], {'blocchi': [], 'non_agganciati': Counter(), 'stati': Counter(),
                         'duplicati_tra_semi': 0}
    for f in sorted(OUT.glob('risposte-*.json')):
        try:
            dati = json.loads(f.read_text(encoding='utf-8'))
        except Exception as e:
            report['blocchi'].append({'file': f.name, 'errore': f'JSON non valido: {e}'})
            print(f'  {f.name}: JSON NON VALIDO ({e})')
            continue
        n_link, stati_b = 0, Counter()
        for s in dati:
            seed_key = s.get('seed')
            if seed_key not in B['row_of']:
                stati_b['seme fuori canone'] += 1
                continue
            links = []
            for sug in s.get('suggerimenti', []):
                r, stato = aggancia(sug.get('titolo', ''), sug.get('anno'), idx, chiavi, Y, a.min_sim)
                stati_b[stato] += 1
                report['stati'][stato] += 1
                if r is None:
                    report['non_agganciati'][str(sug.get('titolo'))] += 1
                    continue
                if KEYS[r] == seed_key:
                    continue                      # il seme stesso non è un suggerimento
                links.append({'id': KEYS[r], 'w': 1.0})
                n_link += 1
            if links:
                fonti.append({'id': seed_key, 'links': links})
        report['blocchi'].append({'file': f.name, 'semi': len(dati), 'link': n_link,
                                  'stati': dict(stati_b)})
        print(f'  {f.name}: {len(dati)} semi · {n_link} link agganciati · {dict(stati_b)}')

    # duplicati: due semi diversi possono ricevere lo stesso suggerimento — è lecito, si conta
    visti = Counter()
    for s in fonti:
        for l in s['links']:
            visti[l['id']] += 1
    report['duplicati_tra_semi'] = sum(1 for v in visti.values() if v > 1)

    OUT.joinpath('banco.json').write_text(json.dumps({'sources': fonti}, ensure_ascii=False), 'utf-8')
    OUT.joinpath('report.json').write_text(json.dumps(
        {**report, 'non_agganciati': dict(report['non_agganciati'].most_common(80))},
        ensure_ascii=False, indent=1), 'utf-8')
    tot = sum(len(s['links']) for s in fonti)
    print(f"\nbanco: {len(fonti)} semi · {tot:,} link · "
          f"matching {report['stati'].get('ok', 0) + report['stati'].get('ok-anno', 0):,} puliti · "
          f"{sum(v for k, v in report['stati'].items() if k.startswith('ambiguo')):,} ambigui · "
          f"{report['stati'].get('non in canone', 0):,} fuori canone")


if __name__ == '__main__':
    main()
