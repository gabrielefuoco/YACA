"""aggiorna.py — l'aggancio tra il daemon TMDB e il grafo: aggiornamento notturno.

  PYTHONPATH=. py -m services.graph_dense.aggiorna --dry     # dice cosa entrerebbe, non tocca niente
  PYTHONPATH=. py -m services.graph_dense.aggiorna           # aggiorna davvero

COME SI AGGANCIA (la scoperta esiste gia', questa e' la presa)
  · `tmdb-daemon` scrive `movies.parquet`/`tv.parquet` sul volume `yaca_tmdb` e tiene un battito in
    `dump_status.json` (stale oltre 36 ore). Noi leggiamo QUEI parquet: nessuna fetch propria.
  · `anime-source` scrive lo stato `ln`; il flag ANIME del canone viene da `anime_mapping.json`
    (prodotto dall'anibridge), non dallo stato di messa in onda.
  · Il job notturno (`ops/yaca-grafo.timer`) chiama questo modulo.

COSA FA, IN ORDINE
  1. guardia: se il dump TMDB e' vecchio o assente, esce senza toccare niente;
  2. delta: i titoli eleggibili che il canone non ha (film/serie >= 50 voti, anime >= 10);
  3. se il delta e' vuoto, esce (la notte normale fa cosi');
  4. canone: aggiunge le righe IN CODA (indici vecchi intatti) e rifa' i metadati;
  5. trame: embedding dei soli titoli nuovi (`embed-trama2.py` riprende da dove era);
  6. feature: TF-IDF e blocchi (10-20 s, si rifanno interi: sono veloci e sempre coerenti);
  7. studente: **inferenza**, non riaddestramento — estende Z delle righe nuove;
  8. tipi di contenuto, quota, miscela, chiusura -> nuovo artefatto.

CIO' CHE NON FA (e va fatto a mano, di proposito)
  · riaddestrare lo studente: il suo spazio non cambia per poche decine di titoli al giorno;
  · ricostruire COVISION e LIST: i titoli nuovi non hanno spettatori, e rifarle costa 7 minuti
    (MovieLens 32M). Si rifanno a mano quando arrivano i dati, non ogni notte.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys

import numpy as np
import pandas as pd

from . import config as C
from . import data as D

RD = C.ROOT / '.scratch' / 'distillazione-grafo'
STATO_DUMP = pathlib.Path('/data/tmdb/dump_status.json')
ORE_STALE = 36


def _run(cmd, **kw):
    print(f'  $ {cmd}', flush=True)
    return subprocess.run(cmd, shell=True, check=True, cwd=C.ROOT, **kw)


def guardia(stato=None):
    """(ok, motivo). Se il file di stato non c'e' si prosegue: puo' essere una macchina di sviluppo
    senza daemon, e i parquet potrebbero essere comunque freschi."""
    p = pathlib.Path(stato) if stato else STATO_DUMP
    if not p.exists():
        return True, f'{p} assente (nessuna informazione: si prosegue)'
    try:
        d = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        return True, f'{p} illeggibile ({e}): si prosegue'
    if str(d.get('phase')) == 'stale':
        return False, 'il daemon dichiara phase=stale'
    ultimo = d.get('lastSync') or d.get('updatedAt') or ''
    if ultimo:
        try:
            t = pd.Timestamp(ultimo)
            eta = (pd.Timestamp.now(tz=t.tz) - t).total_seconds() / 3600
            if eta > ORE_STALE:
                return False, f'ultimo sync {eta:.0f} ore fa (soglia {ORE_STALE})'
        except Exception:
            pass
    return True, f'dump ok (phase={d.get("phase")})'


def _anime_keys():
    d = json.load(open(C.TMDB / 'anibridge-mappings.json', encoding='utf-8'))
    out = set()
    for v in d.values():
        if not isinstance(v, dict):
            continue
        for kk in v:
            m = re.match(r'tmdb_(show|movie):(\d+)', str(kk))
            if m:
                out.add(('tv' if m.group(1) == 'show' else 'movie') + ':' + m.group(2))
    return out


def delta(soglia=50, soglia_anime=10):
    """I titoli del parquet che il canone non ha e che superano la regola d'ingresso."""
    B = D.basic(); row_of = B['row_of']
    anime = _anime_keys()
    out = []
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'vote_count', 'adult'])
        d = d[~d.adult.fillna(False)]
        for r in d.itertuples(index=False):
            k = f'{tipo}:{int(r.id)}'
            if k in row_of:
                continue
            v = int(r.vote_count or 0)
            if v >= soglia or (k in anime and v >= soglia_anime):
                out.append((k, v, k in anime))
    out.sort(key=lambda x: -x[1])
    return out


def estendi_canone(keys):
    """Aggiunge le chiavi in coda al canone. Riusa `estendi-canone.py`, che ricalcola il delta da
    solo: qui si limita a verificare che il risultato contenga anche queste."""
    _run('py .scratch/distillazione-grafo/estendi-canone.py')
    for f in ('spazi-trakt', 'titoli-canone', 'metadati-canone'):
        for ext in ('.npz', '.txt'):
            src = C.SRC / f'{f}-v2{ext}'
            if src.exists():
                dst = C.SRC / f'{f}{ext}'
                if not (C.SRC / f'{dst.name}.v1.bak').exists():
                    _run(f'cp -n "{dst}" "{dst}.v1.bak"')
                _run(f'cp "{src}" "{dst}"')


def estendi_studente(vecchie_n, nuove_righe):
    """Z estesa per inferenza: le righe nuove prendono il vettore del modello. Nessun riaddestra."""
    from . import studente
    p = C.DATA / 'rrfstudent-v18.npz'
    z = dict(np.load(p))
    Z = z['Z']
    if Z.shape[0] < vecchie_n + len(nuove_righe):
        Z = np.vstack([Z, np.zeros((vecchie_n + len(nuove_righe) - Z.shape[0], Z.shape[1]), np.float32)])
    m = studente.carica()
    Z[nuove_righe] = m.codifica(nuove_righe)
    z['Z'] = Z
    np.savez_compressed(p, **z)
    print(f'  Z estesa: {Z.shape} · righe nuove codificate {len(nuove_righe)}', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='solo il delta, non tocca niente')
    ap.add_argument('--stato-dump', default=None)
    ap.add_argument('--soglia', type=int, default=50)
    ap.add_argument('--soglia-anime', type=int, default=10)
    a = ap.parse_args()

    ok, motivo = guardia(a.stato_dump)
    print(f'guardia: {motivo}', flush=True)
    if not ok:
        print('esce: il dump non e\' fresco, il grafo resta quello di ieri', flush=True)
        return 0

    det = delta(a.soglia, a.soglia_anime)
    print(f'delta: {len(det):,} titoli eleggibili non ancora nel canone', flush=True)
    if det:
        print('  per voti: ' + ', '.join(f'{k} ({v})' for k, v, _ in det[:8]), flush=True)
    if a.dry or not det:
        return 0

    n_vecchi = D.basic()['N']
    estendi_canone([k for k, _, _ in det])

    B = D.basic()
    nuove = [B['row_of'][k] for k, _, _ in det if k in B['row_of']]
    print(f'canone ora {B["N"]:,} · righe nuove {len(nuove):,}', flush=True)

    _run('py .scratch/distillazione-grafo/embed-trama2.py')
    _run('py .scratch/distillazione-grafo/tfidf-v2.py')
    _run('cp services/graph_dense/data/graph/05-tfidf-v2.npz services/graph_dense/data/graph/05-tfidf.npz')
    _run('cp services/graph_dense/data/graph/05-vocab-v2.json services/graph_dense/data/graph/05-vocab.json')
    _run('cp services/graph_dense/data/graph/05-idf-v2.npy services/graph_dense/data/graph/05-idf.npy')
    _run('py -m services.graph_dense.blocks')
    estendi_studente(n_vecchi, nuove)

    print('tipi, miscela e chiusura (build-v18.sh tipi + studente)…', flush=True)
    _run('bash .scratch/distillazione-grafo/build-v18.sh tipi')
    _run('bash .scratch/distillazione-grafo/build-v18.sh studente')
    print('aggiornamento completato', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
