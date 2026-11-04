"""studente.py — lo studente come MOTORE DI INFERENZA, non come file di vettori.

Il training produce `rrfstudent-v18.npz` (i vettori di tutti i nodi) e `rrfstudent-v18.pt` (il
modello). I vettori servono a costruire il tipo RRFST; il modello serve a **collocare un titolo che
non esisteva** quando il grafo e' stato costruito.

    from services.graph_dense import studente
    m = studente.carica()                       # una volta
    Z = studente.codifica(m, [riga1, riga2])    # vettori per quelle righe del canone

La validazione: `codifica` su una riga vecchia riproduce il vettore salvato (differenza ~1e-6).
Se un giorno non lo riproduce piu', significa che `blocks.npz` o il TF-IDF sono cambiati sotto i
piedi e i vettori salvati non valgono piu': meglio accorgersene qui che servendo un grafo storto.
"""
from __future__ import annotations

import json
import pathlib

import numpy as np
import torch

from . import config as C
from . import data as D
from .train_b1 import BlockStudent, _batch_meta

MODELLO = 'rrfstudent-v18.pt'


class Studente:
    def __init__(self, percorso=None, device=None):
        p = pathlib.Path(percorso) if percorso else C.DATA / MODELLO
        if not p.exists():
            raise FileNotFoundError(
                f'manca il modello dello studente: {p}. Serve `train-studente.py` (salva .pt e .npz).')
        s = torch.load(p, map_location='cpu', weights_only=False)
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.meta = s
        self.dim_meta = int(s['dim'])          # il blocco meta (512); il vettore e' la concatenazione
        B = D.basic()
        self.N = B['N']
        self.row_of = B['row_of']
        zbl = np.load(C.DATA / 'blocks.npz')
        self.keep = zbl['keep']
        self.Bp = zbl['Bp'].astype(np.float32)
        self.Bk = zbl['Bk'].astype(np.float32)
        self.X = D.features(B, extra=True)[:, self.keep].tocsr()
        if self.X.shape[1] != int(s['dim_meta']):
            raise ValueError(
                f'lo studente e\' addestrato su {s["dim_meta"]:,} colonne meta, '
                f'le feature ne hanno {self.X.shape[1]:,}: TF-IDF o blocks sono cambiati, '
                f'va riaddestrato')
        self.model = BlockStudent(self.X.shape[1], d_meta=self.dim_meta, wp=s['wp'], wk=s['wk'],
                                  wm=s['wm']).to(self.device)
        self.model.load_state_dict(s['state_dict'])
        self.model.eval()

    def codifica(self, righe, lotto=512):
        """Vettori (len(righe) x dim) per le righe del canone indicate."""
        righe = np.asarray(righe).astype(np.int64)
        out = np.zeros((len(righe), self.Bp.shape[1] + self.Bk.shape[1] + self.dim_meta), np.float32)
        rng = np.random.default_rng(0)
        Bp = torch.from_numpy(self.Bp).to(self.device)
        Bk = torch.from_numpy(self.Bk).to(self.device)
        with torch.inference_mode():
            for st in range(0, len(righe), lotto):
                r = righe[st:st + lotto]
                rt = torch.from_numpy(r).to(self.device)
                idx, off, val = _batch_meta(self.X, r, rng, drop=False)
                z = self.model(idx.to(self.device), off.to(self.device), val.to(self.device),
                               Bp[rt], Bk[rt])
                out[st:st + lotto] = z.float().cpu().numpy()
        return out

    def colloca(self, righe, k=100, escludi=None):
        """Per ogni riga nuova, i k vicini esistenti per coseno: sono i suoi archi RRFST.

        `escludi` = insieme di righe da non proporre (di norma i nodi nuovi stessi).
        Ritorna (righe, colonne, pesi) pronte per una csr.
        """
        Z = np.load(C.DATA / 'rrfstudent-v18.npz')['Z'].astype(np.float32)
        if Z.shape[0] < self.N:
            Z = np.vstack([Z, np.zeros((self.N - Z.shape[0], Z.shape[1]), np.float32)])
        Z /= (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
        nuovo = self.codifica(righe)
        nuovo /= (np.linalg.norm(nuovo, axis=1, keepdims=True) + 1e-9)
        band = set(int(x) for x in (escludi if escludi is not None else righe))
        rr, cc, vv = [], [], []
        for i, riga in enumerate(righe):
            s = Z @ nuovo[i]
            if band:
                s[list(band)] = -9.0
            o = np.argpartition(-s, k)[:k]
            w = s[o]
            ok = w > 0
            rr.extend([int(riga)] * int(ok.sum()))
            cc.extend(o[ok].tolist())
            vv.extend(w[ok].tolist())
        return rr, cc, vv


_CACHE = {}


def carica(percorso=None):
    """Carica (e tiene in memoria) lo studente. Chiamare una volta per processo."""
    chiave = str(percorso or 'default')
    if chiave not in _CACHE:
        _CACHE[chiave] = Studente(percorso)
    return _CACHE[chiave]
