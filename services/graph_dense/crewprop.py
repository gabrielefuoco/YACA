"""crewprop.py — il segnale autoriale che DIR e CAST non possono dare (ticket 06).

IL LIMITE DI OGGI. DIR e CAST sono archi a **0 hop di match esatto**: *Barbie* e' collegata solo agli
altri film di Greta Gerwig, e a *Povere creature!* (Lanthimos) o a *The Substance* (Fargeat) non c'e'
modo di arrivarci. Gli sceneggiatori non hanno nemmeno un tipo (Noah Baumbach, co-sceneggiatore di
*Barbie*, non esiste nel grafo).

L'IDEA. Ogni persona ha una **carriera**: il centroide (pesato) dei vettori dei film a cui ha lavorato.
Il vettore di carriera di un titolo e' la somma dei centroidi delle sue persone (regia, sceneggiatura,
top-3 cast), e collega il titolo ai film vicini a quella carriera.

DUE TRAPPOLE, GIA' PAGATE:
  · **leave-one-out obbligatorio**. Se il centroide di Gerwig contiene *Barbie* (9.000 voti), per
    *Barbie* il vettore restituisce *Barbie* e i blockbuster del 2023. Il centroide va calcolato
    **senza** il film stesso.
  · **peso log, non lineare**. Con `votes` lineare il centroide di Margot Robbie diventa al 90%
    *Suicide Squad* e qualunque comparsa in un cinecomic trasforma il film d'autore in un satellite
    dell'MCU. Si usa `log1p(voti) x fattore_ruolo`.

  PYTHONPATH=. py -m services.graph_dense.crewprop [--k 100] [--ruoli dir,wr,ca]
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import config as C, data as D

# il Parquet delle serie non ha `directors`/`writers`: ha `created_by` (gli autori della serie).
# Chiedere una colonna che non esiste fa fallire tutta la lettura, non una riga.
RUOLI = {'dir': ('directors', 1.0), 'wr': ('writers', 0.8), 'ca': ('cast', 0.4)}
RUOLI_TV = {'dir': ('created_by', 1.0), 'wr': ('created_by', 0.8), 'ca': ('cast', 0.4)}


def _persone(cell, ruolo):
    """Lista JSON TMDB -> [(id_persona)] (top-3 per il cast, tutti per regia/sceneggiatura)."""
    if not isinstance(cell, str) or not cell.strip():
        return []
    try:
        v = json.loads(cell)
    except Exception:
        return []
    if ruolo == 'ca':
        v = sorted((e for e in v if isinstance(e, dict)), key=lambda e: e.get('order', 999))[:3]
    return [int(e['id']) for e in v if isinstance(e, dict) and e.get('id') is not None]


def incidenza(B, ruoli=('dir', 'wr', 'ca')):
    """(films x persone, peso del ruolo) e (persone x films, peso log(voti))."""
    ro = B['row_of']
    N = B['N']
    per = {}                       # persona -> lista di (riga, ruolo)
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        mappa = RUOLI if tipo == 'movie' else RUOLI_TV
        campi = {mappa[r][0] for r in ruoli}
        d = pd.read_parquet(C.TMDB / f, columns=['id'] + sorted(campi))
        for r in d.itertuples(index=False):
            i = ro.get(f'{tipo}:{int(r.id)}')
            if i is None:
                continue
            for ruolo in ruoli:
                campo, peso = mappa[ruolo]
                for p in _persone(getattr(r, campo, None), ruolo):
                    per.setdefault(p, []).append((i, peso))
    pid = {p: k for k, p in enumerate(per)}
    pr, pc, pv = [], [], []
    for p, lst in per.items():
        for i, w in lst:
            pr.append(i); pc.append(pid[p]); pv.append(w)
    A = sp.csr_matrix((np.float32(pv), (np.int32(pr), np.int32(pc))), shape=(N, len(pid)))
    # la colonna della matrice e' un id DENSO, non l'id TMDB: serve la mappa inversa, altrimenti
    # `per[colonna]` cerca per id TMDB e va in KeyError (o, peggio, indicizza la persona sbagliata).
    col2p = [p for p, _ in sorted(pid.items(), key=lambda kv: kv[1])]
    print(f'  crewprop: {len(pid):,} persone · {A.nnz:,} incidenze', flush=True)
    return A, per, col2p


def costruisci_canone(B=None, k=100, ruoli=('dir', 'wr', 'ca'), z=None, max_stessi=2, dim=512):
    """CREWPROP vero: la carriera di un titolo cerca i vicini su TUTTO il canone.

    IL DIFETTO CHE CORREGGE (revisione esterna, 2026-11-04). La prima versione cercava i candidati
    solo dentro la filmografia delle persone del titolo: risultato, **20 vicini su 20 di *Barbie*
    condividevano una persona con lei** — un DIR+CAST ripesato, che per costruzione non puo' raggiungere
    *Povere creature!* (Lanthimos) o *The Substance* (Fargeat). Ed era esattamente cio' che l'utente
    non vuole: «altra roba dello stesso autore».

    Ora: si calcola il vettore di carriera LOO di ogni titolo, e si cercano i k vicini **su tutti i
    76.497**, con un tetto di `max_stessi` film che condividono gia' una persona (cosi' i primi due
    possono essere della stessa mano — *Lady Bird*, *Piccole donne* — ma il resto deve essere di
    **altri autori** con una carriera simile).
    """
    t0 = time.time()
    B = D.basic() if B is None else B
    N = B['N']
    if z is None:
        z = np.load(C.DATA / 'rrfstudent-v18.npz')['Z'].astype(np.float32)
    z = z / (np.linalg.norm(z, axis=1, keepdims=True) + 1e-9)
    # proiezione deterministica a `dim` colonne: conserva i coseni (Johnson-Lindenstrauss) e tiene
    # 76.497 x 512 in 156 MB invece di 627 MB. Il seme e' fisso: due run danno gli stessi numeri.
    if z.shape[1] > dim:
        rng = np.random.default_rng(20261104)
        R = rng.standard_normal((z.shape[1], dim)).astype(np.float32) / np.sqrt(dim)
        z = z @ R
        z /= (np.linalg.norm(z, axis=1, keepdims=True) + 1e-9)
    A, per, col2p = incidenza(B, ruoli)
    A = A.tocsr()
    vox = np.log1p(np.maximum(B['VOT'], 0)).astype(np.float32)

    # vettore di carriera LOO per ogni titolo
    car = np.zeros_like(z)
    for i in range(N):
        lo, hi = A.indptr[i], A.indptr[i + 1]
        if hi <= lo:
            continue
        acc = np.zeros(z.shape[1], np.float32)
        w_tot = 0.0
        for col, rp in zip(A.indices[lo:hi], A.data[lo:hi]):
            lst = per[col2p[int(col)]][:150]        # tetto: chi ha 300 film non deve dominare
            films = [j for (j, _) in lst if j != i]
            if not films:
                continue
            w = vox[films]
            acc += float(rp) * (w[:, None] * z[films]).sum(0)
            w_tot += rp * float(w.sum())
        if w_tot > 0:
            v = acc / w_tot
            n = float(np.linalg.norm(v))
            if n > 0:
                car[i] = v / n
    print(f'  crewprop: carriere calcolate ({time.time()-t0:.0f}s)', flush=True)

    # stesso autora/cast: per il tetto sui 1-hop
    stesso = (A @ A.T).tocsr()
    stesso.setdiag(0)

    righe, colonne, valori = [], [], []
    blocco = 256
    with_edges = 0
    for st in range(0, N, blocco):
        en = min(st + blocco, N)
        sim = car[st:en] @ z.T
        for r, i in enumerate(range(st, en)):
            if not car[i].any():
                continue
            sim[r, i] = -9.0
            cand = np.argpartition(-sim[r], min(4 * k, N - 1))[: 4 * k]
            cand = cand[np.argsort(-sim[r, cand])]
            suoi = set(stesso.getrow(i).indices.tolist())
            tenuti, pesi, n_stessi = [], [], 0
            for j in cand:
                w = float(sim[r, j])
                if w <= 0.05:
                    break
                if int(j) in suoi:
                    if n_stessi >= max_stessi:
                        continue
                    n_stessi += 1
                tenuti.append(int(j)); pesi.append(w)
                if len(tenuti) >= k:
                    break
            if tenuti:
                with_edges += 1
                righe.append(np.full(len(tenuti), i, np.int32))
                colonne.append(np.asarray(tenuti, np.int32))
                valori.append(np.asarray(pesi, np.float32))
        if (st // blocco) % 40 == 0:
            print(f'    ricerca {en:,}/{N:,} ({time.time()-t0:.0f}s)', flush=True)
    M = sp.csr_matrix((np.concatenate(valori), (np.concatenate(righe), np.concatenate(colonne))),
                      shape=(N, N))
    M.setdiag(0)
    M.eliminate_zeros()
    print(f'  crewprop: {M.nnz:,} archi · {with_edges:,} titoli con vicini ({time.time()-t0:.0f}s)',
          flush=True)
    return M


def costruisci(B=None, k=100, ruoli=('dir', 'wr', 'ca'), z=None, _A=None, _per=None, _col2p=None):
    """Il tipo CREWPROP: per ogni titolo, i vicini nella sua *carriera* (leave-one-out).

    `_A`/`_per` servono ai test per iniettare un'incidenza finta senza leggere i Parquet.
    """
    t0 = time.time()
    B = D.basic() if B is None else B
    N = B['N']
    if z is None:
        z = np.load(C.DATA / 'rrfstudent-v18.npz')['Z'].astype(np.float32)
    z = z / (np.linalg.norm(z, axis=1, keepdims=True) + 1e-9)
    if _A is None or _per is None:
        A, per, col2p = incidenza(B, ruoli)
    else:
        A, per, col2p = _A, _per, (_col2p or list(range(_A.shape[1])))
    A = A.tocsr()
    vox = np.log1p(np.maximum(B['VOT'], 0)).astype(np.float32)     # peso log: mai lineare

    righe, colonne, valori = [], [], []
    for i in range(N):
        lo, hi = A.indptr[i], A.indptr[i + 1]
        if hi <= lo:
            continue
        persone = A.indices[lo:hi]
        pesi_ruolo = A.data[lo:hi]
        # candidati: i film delle persone di i (escluso i)
        cand = set()
        for col in persone:
            for (j, _) in per[col2p[int(col)]]:
                if j != i:
                    cand.add(j)
        if not cand:
            continue
        cand = np.asarray(sorted(cand), np.int32)
        # carriera di i: media dei film delle sue persone, ciascuno pesato log(voti), LOO su i
        zc = np.zeros(z.shape[1], np.float32)
        wc = 0.0
        for col, rp in zip(persone, pesi_ruolo):
            for (j, _) in per[col2p[int(col)]]:
                if j == i:
                    continue
                w = vox[j]
                if w <= 0:
                    continue
                zc += (rp * w) * z[j]
                wc += rp * w
        if wc <= 0:
            continue
        zc /= wc
        nz = float(np.linalg.norm(zc))
        if nz <= 0:
            continue
        cos = (z[cand] @ zc) / nz
        if len(cos) > k:
            o = np.argpartition(-cos, k)[:k]
        else:
            o = np.arange(len(cos))
        o = o[cos[o] > 0]
        if len(o) == 0:
            continue
        righe.append(np.full(len(o), i, np.int32))
        colonne.append(cand[o])
        valori.append(cos[o].astype(np.float32))
        if i % 10000 == 0:
            print(f'    {i:,}/{N:,} ({time.time()-t0:.0f}s)', flush=True)
    M = sp.csr_matrix((np.concatenate(valori), (np.concatenate(righe), np.concatenate(colonne))),
                      shape=(N, N))
    M.setdiag(0)
    M.eliminate_zeros()
    print(f'  crewprop: {M.nnz:,} archi · copertura '
          f'{100*float((np.diff(M.indptr) > 0).mean()):.1f}% ({time.time()-t0:.0f}s)', flush=True)
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--ruoli', default='dir,wr,ca')
    ap.add_argument('--out', default='services/graph/data/tipi2/CREWPROP.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    ap.add_argument('--modo', choices=['canone', '1hop'], default='canone',
                    help="canone = ricerca su tutti i titoli (corretto); 1hop = vecchia versione")
    ap.add_argument('--max-stessi', type=int, default=2)
    a = ap.parse_args()
    from . import provenance as PV
    B = D.basic()
    if a.modo == 'canone':
        M = costruisci_canone(B, k=a.k, ruoli=tuple(a.ruoli.split(',')), max_stessi=a.max_stessi)
    else:
        M = costruisci(B, k=a.k, ruoli=tuple(a.ruoli.split(',')))
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'CREWPROP', 'modo': a.modo, 'k': a.k, 'ruoli': a.ruoli,
                             'max_stessi': a.max_stessi},
                     inputs={'rrfstudent': PV.sha256_file(C.DATA / 'rrfstudent-v18.npz')},
                     canon_len=B['N'])
    # IL MANIFEST VA AGGIORNATO QUI, non "da qualche parte": `tipi.py norm` e `budget` iterano su
    # `manifest.json`, quindi un tipo scritto senza voce semplicemente non esiste per la pipeline
    # (e il mixer fallisce a valle con un errore che non dice perche'). E' lo stesso difetto che il
    # senior ha trovato in `covision-list.py`.
    import os
    if os.path.exists(a.manifest):
        man = json.load(open(a.manifest, encoding='utf-8'))
    else:
        man = {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['CREWPROP'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                           grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                           riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                           ricetta=f'top-{a.k} coseno sulla carriera di regia/sceneggiatura/cast, '
                                   f'leave-one-out, peso log1p(voti), modo {a.modo}, '
                                   f'max {a.max_stessi} film della stessa persona',
                           khi={'k': a.k, 'ruoli': a.ruoli, 'modo': a.modo,
                                'max_stessi': a.max_stessi},
                           creato=time.strftime('%Y-%m-%d %H:%M'))
    json.dump(man, open(a.manifest, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'scritto {a.out} · prov {prov["sha256"][:12]} · manifest aggiornato')


if __name__ == '__main__':
    main()
