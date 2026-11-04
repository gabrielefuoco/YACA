"""estendi-canone.py — allarga il canone senza toccare l'ordine e i vettori esistenti.

  PYTHONPATH=. py .scratch/distillazione-grafo/estendi-canone.py [--soglia 50] [--anime 10] [--dry]

Il canone (le righe di `spazi-trakt.npz`) e' fermo al 2023 sul lato film: i film entravano solo se
avevano una mappatura MovieLens, e MovieLens e' un dataset statico. Qui si AGGIUNGONO in coda:

  · film  del parquet con vote_count >= soglia (default 50), non gia' nel canone
  · serie del parquet con vote_count >= soglia
  · anime (anibridge) non gia' inclusi, con vote_count >= 10 (la distribuzione dei voti degli anime
    e' compressa: 50 taglierebbe 710 titoli su 762)

Le righe esistenti NON si toccano: Pc/Pb restano gli stessi vettori, byte per byte. Le righe nuove
hanno Pc e Pb a zero (nessun segnale MovieLens) e prendono i tipi di contenuto come tutti gli altri.

Scrive `spazi-trakt-v2.npz` e `titoli-canone-v2.txt` accanto agli originali: la sostituzione e'
un passo separato e reversibile.
"""
import argparse
import json
import re

import numpy as np
import pandas as pd

from services.graph_dense import config as C

SRC = C.SRC                      # graph_dense/data/graph
OUT_NPZ = SRC / 'spazi-trakt-v2.npz'
OUT_TXT = SRC / 'titoli-canone-v2.txt'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--soglia', type=int, default=50)
    ap.add_argument('--anime', type=int, default=10)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    z = np.load(SRC / 'spazi-trakt.npz', allow_pickle=True)
    tmdb, tipo = z['tmdb'].astype(np.int64), z['tipo'].astype(object)
    year, votes, coll = z['year'], z['votes'], z['coll']
    Pc, Pb = z['Pc'], z['Pb']
    chiavi = {f'{t}:{int(i)}' for t, i in zip(tipo, tmdb)}
    print(f'canone attuale: {len(tmdb):,} righe · Pc {Pc.shape} · Pb {Pb.shape}', flush=True)

    # --- chi entra ---
    mv = pd.read_parquet(C.TMDB / 'movies.parquet',
                         columns=['id', 'vote_count', 'release_date', 'collection_id', 'adult'])
    tv = pd.read_parquet(C.TMDB / 'tv.parquet',
                         columns=['id', 'vote_count', 'first_air_date', 'adult'])
    d = json.load(open(C.TMDB / 'anibridge-mappings.json', encoding='utf-8'))
    anime_keys = set()
    for v in d.values():
        if not isinstance(v, dict):
            continue
        for kk in v:
            m = re.match(r'tmdb_(show|movie):(\d+)', str(kk))
            if m:
                anime_keys.add(f"{'tv' if m.group(1) == 'show' else 'movie'}:{m.group(2)}")

    nuovi = []
    for rot, df, pre, col in (('movie', mv, 'movie', 'release_date'), ('tv', tv, 'tv', 'first_air_date')):
        df = df[~df.adult.fillna(False)].copy()
        df['key'] = pre + ':' + df.id.astype(str)
        df['anno'] = pd.to_datetime(df[col], errors='coerce').dt.year
        df = df[~df.key.isin(chiavi)]
        soglia = df.vote_count >= a.soglia
        # gli anime hanno una soglia piu' bassa
        anime = df.key.isin(anime_keys)
        prendi = df[soglia | (anime & (df.vote_count >= a.anime))]
        for r in prendi.itertuples(index=False):
            nuovi.append((str(r.key), int(r.id), pre, float(r.anno) if r.anno == r.anno else 0.0,
                          int(r.vote_count), getattr(r, 'collection_id', np.nan)))
        print(f'  {pre}: {len(prendi):,} nuovi (di cui anime {int((anime & ~soglia).sum()):,})', flush=True)

    # ordine deterministico: prima i film, poi le serie; dentro, per voti decrescenti
    nuovi.sort(key=lambda x: (x[2] != 'movie', -x[4], x[1]))
    print(f'\ntotale da aggiungere: {len(nuovi):,} → canone {len(tmdb):,} → {len(tmdb)+len(nuovi):,}', flush=True)
    if a.dry:
        return

    n = len(nuovi)
    tmdb2 = np.concatenate([tmdb, np.array([x[1] for x in nuovi], np.int64)])
    tipo2 = np.concatenate([tipo, np.array([x[2] for x in nuovi], object)])
    year2 = np.concatenate([year, np.array([x[3] for x in nuovi], np.float64)])
    votes2 = np.concatenate([votes, np.array([x[4] for x in nuovi], np.int64)])
    coll2 = np.concatenate([coll, np.array([x[5] for x in nuovi], np.float64)])
    Pc2 = np.vstack([Pc, np.zeros((n, Pc.shape[1]), np.float32)])
    Pb2 = np.vstack([Pb, np.zeros((n, Pb.shape[1]), np.float32)])

    np.savez_compressed(OUT_NPZ, Pc=Pc2, Pb=Pb2, tmdb=tmdb2, tipo=tipo2,
                        coll=coll2, year=year2, votes=votes2)
    righe = [f'{t}:{int(i)}' for t, i in zip(tipo2, tmdb2)]
    OUT_TXT.write_text('\n'.join(righe) + '\n', encoding='utf-8')
    print(f'scritti {OUT_NPZ.name} ({OUT_NPZ.stat().st_size/1e6:.1f} MB) e {OUT_TXT.name} '
          f'({len(righe):,} righe)', flush=True)


if __name__ == '__main__':
    main()
