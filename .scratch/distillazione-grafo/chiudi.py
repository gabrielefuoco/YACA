"""chiudi.py — applica il fattore di chiusura a un npz: S <- S .* (alpha0 + O).

  PYTHONPATH=. py .scratch/distillazione-grafo/chiudi.py <in.npz> <out.npz> [--modo attuale] [--alpha0 0.1]

ATTENZIONE, E' IL PUNTO CHE CI E' COSTATO TRE VERSIONI. Questa chiusura **non aggiunge archi**: moltra
ogni peso per un fattore che dipende dai vicini comuni. Sul grafo V18 la riga di *Barbie* ha 532 archi
prima e 532 dopo, con moltiplicatori da 700 a 1211 per i vicini di cricca contro ~3 per un legame
autoriale: **390x di distorsione, applicata dopo la taratura dei pesi**. Da qui il plateau.

  attuale       O = |vicini comuni| (conteggio binario)          <- quello che ha prodotto i numeri V10-V18
  adamic-adar   O = somma su k di 1/log(1+grado(k))               <- pesa meno gli hub
  log           O = log(1 + |vicini comuni|)                      <- comprime la cricca: 390x -> ~4x
  nessuna       identita' (per misurare quanto la chiusura sta sostenendo il banco)

MISURATO su V18 (banco 499, bootstrap appaiato, IC95):
  nessuna     R@20 -0,0119 (sopra l'MDE) · >5k 73,2% · Lady Bird #10 in Barbie
  adamic-adar R@20 -0,0027 (sotto l'MDE) · >5k 68,0% · Lady Bird #63
  log         R@20 -0,0040 (sotto l'MDE) · >5k 72,3% · Lady Bird #19  <- DEFAULT
  attuale     riferimento                 · >5k 68,2% · Lady Bird #61
La forma del fattore conta piu' del peso: finche' moltiplica per i vicini comuni, l'arco autoriale
resta sepolto anche pesando meno gli hub.
"""
import argparse
import time

import numpy as np
import scipy.sparse as sp

from services.graph_dense import data as D
from services.graph_dense import provenance as PV

T0 = time.time()
MODI = ('attuale', 'adamic-adar', 'log', 'nessuna')


def fattore(S: sp.csr_matrix, modo: str, alpha0: float, blocco: int = 1024) -> sp.csr_matrix:
    """Moltiplicatore per arco. `nessuna` restituisce la matrice tal quale (il fattore non si applica)."""
    if modo == 'nessuna':
        return S
    Sb = (S > 0).astype(np.float32).tocsr()
    if modo == 'adamic-adar':
        grado = np.asarray(Sb.sum(1)).ravel()
        # 1/log(1+deg) invece di 1: un vicino comune che e' un hub dice poco, uno raro dice molto.
        w = (1.0 / np.log(1.0 + np.maximum(grado, 1.0))).astype(np.float32)
        St = (Sb.multiply(w[:, None])).T.tocsr()
    else:
        St = Sb.T.tocsr()
    out = []
    for i in range(0, S.shape[0], blocco):
        O = (Sb[i:i + blocco] @ St).tocsr()
        if modo == 'log':
            # il conteggio grezzo premia quadraticamente la cricca (561 vicini comuni -> x561);
            # il logaritmo la riduce a x6 e lascia intatto il segnale del secondo ordine.
            O.data = np.log1p(O.data).astype(np.float32)
        out.append((S[i:i + blocco].multiply(O) + alpha0 * S[i:i + blocco]).tocsr())
    return sp.vstack(out).tocsr()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sorgente')
    ap.add_argument('destinazione')
    ap.add_argument('--modo', choices=MODI, default='log')
    ap.add_argument('--alpha0', type=float, default=0.1)
    ap.add_argument('--blocco', type=int, default=1024)
    ap.add_argument('--legacy-ok', action='store_true',
                    help="accetta un input senza provenienza (artefatti precedenti al ticket 12)")
    a = ap.parse_args()
    B = D.basic(); N = B['N']

    legacy = False
    try:
        PV.verifica(a.sorgente, step='mixer')
    except ValueError as e:
        if not a.legacy_ok:
            raise
        legacy = True
        print(f'  ATTENZIONE: input senza provenienza, accettato con --legacy-ok ({e.args[0][:80]}...)',
              flush=True)

    S = PV.leggi(a.sorgente)[0].tocsr()
    if S.shape[0] != N:
        raise ValueError(f'{a.sorgente}: {S.shape[0]} righe su un canone di {N}')
    print(f'letto {a.sorgente}: {S.nnz:,} archi · massa {S.sum():,.0f} · '
          f'peso max {S.data.max():.2f} · modo {a.modo}', flush=True)

    M = fattore(S, a.modo, a.alpha0, a.blocco)
    M.setdiag(0)
    M.eliminate_zeros()
    nuovi = M.nnz - S.nnz
    prov = PV.scrivi(a.destinazione, M, step='chiusura',
                     params={'modo': a.modo, 'alpha0': a.alpha0, 'blocco': a.blocco,
                             'legacy_input': legacy},
                     inputs={'sorgente': PV.sha256_file(a.sorgente)}, canon_len=N)
    rs = np.asarray(M.sum(1)).ravel(); pos = rs[rs > 0]
    print(f'scritto {a.destinazione} · archi {M.nnz:,} ({nuovi:+,}) · massa {M.sum():,.0f} · '
          f'riga mediana {np.median(pos):.1f} · peso max {M.data.max():.2f} · '
          f'peso mediano {np.median(M.data):.4f} · prov {prov["sha256"][:12]} ({time.time()-T0:.0f}s)',
          flush=True)


if __name__ == '__main__':
    main()
