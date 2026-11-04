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
    # TRE NOMI, NON DUE. Il canone ha il titolo italiano, `original_title` ha la lingua d'origine
    # (l'ebraico per Waltz with Bashir, il francese per Les Quatre Cents Coups): senza `title_en`
    # si perdono i film famosi proposti col titolo inglese — ed erano 80.
    for tipo, f, campi in (('movie', 'movies.parquet', ['original_title', 'title_en']),
                           ('tv', 'tv.parquet', ['original_name', 'name_en'])):
        try:
            d = pd.read_parquet(C.TMDB / f, columns=['id'] + campi)
        except Exception:
            continue
        for riga in d.itertuples(index=False):
            r = B['row_of'].get(f'{tipo}:{int(riga.id)}')
            if r is None:
                continue
            for campo in campi:
                v = getattr(riga, campo, None)
                if isinstance(v, str) and v.strip():
                    idx[norm(v)].add(r)
    return {k: sorted(v) for k, v in idx.items()}


def varianti(titolo):
    """Le forme plausibili di un titolo scritto a parole.

    Gli agenti scrivono «Bella di giorno (Belle de jour)», «Memorie di un assassino - Memories of
    Murder», «L'Uomo Ombra (The Shadow)»: la parte utile è dentro, non fuori. Si provano tutte le
    varianti invece di perdere il titolo — è la differenza fra 92% e 98% di aggancio, e i titoli
    persi sono sistematicamente quelli doppi (cioè i non anglofoni).
    """
    t = str(titolo).strip()
    out = [t]
    # dentro le parentesi (il titolo originale) e fuori
    for dentro in re.findall(r'\(([^)]+)\)', t):
        out.append(dentro)
    fuori = re.sub(r'\([^)]*\)', ' ', t).strip(' -–—')
    out.append(fuori)
    # «X - Y» e «X: Y»: nei cataloghi italiani il sottotitolo è spesso il titolo vero
    for sep in (' - ', ' – ', ' — ', ': '):
        if sep in fuori:
            for pezzo in fuori.split(sep):
                out.append(pezzo.strip(' -–—'))
    # unico, in ordine, senza duplicati normalizzati
    visti, finali = set(), []
    for v in out:
        n = norm(v)
        if n and n not in visti:
            visti.add(n)
            finali.append(v)
    return finali


def aggancia(titolo, anno, idx, chiavi, Y, min_sim, max_diff_anno=1, alias=None):
    """La riga del canone per un titolo suggerito, o None. Anno usato per disambiguare, non obbligatorio."""
    if alias:
        n0 = norm(titolo)
        if n0 in alias:
            titolo = alias[n0]
    n = norm(titolo)
    if not n:
        return None, 'vuoto'
    cand = None
    for v in varianti(titolo):
        cand = idx.get(norm(v))
        if cand:
            n = norm(v)
            break
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
    ap.add_argument('--alias', default='.scratch/banco-casi/alias.json',
                    help='mappa "titolo suggerito" -> "titolo canonico" per le traslitterazioni')
    a = ap.parse_args()
    # I TITOLI IN ROMAJI SONO IL BUCO PIU' GROSSO: «Tonari no Totoro» non è «Il mio vicino Totoro»,
    # e il canone non ha il romaji da nessuna parte (il titolo originale TMDB di un anime è in
    # giapponese). Senza alias si perdono soprattutto i non anglofoni, cioè la diversità voluta.
    alias = {}
    if Path(a.alias).exists():
        alias = {norm(k): v for k, v in json.loads(Path(a.alias).read_text(encoding='utf-8')).items()}
        print(f'alias: {len(alias):,} titoli da rimappare')
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
                r, stato = aggancia(sug.get('titolo', ''), sug.get('anno'), idx, chiavi, Y, a.min_sim,
                                    alias=alias)
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
