"""Ticket 04 — il gate asimmetrico: attenuare solo dove serve."""
import importlib.util
from pathlib import Path

import numpy as np
import scipy.sparse as sp

_spec = importlib.util.spec_from_file_location(
    "mixer", Path(__file__).resolve().parents[3] / ".scratch" / "distillazione-grafo" / "mixer.py")
mixer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mixer)


def _grafo(righe):
    """Grafo diretto con un arco per riga indicata: (i, j, w)."""
    n = max(max(i, j) for i, j, _ in righe) + 1
    r = sp.lil_matrix((n, n), dtype=np.float32)
    for i, j, w in righe:
        r[i, j] = w
    return r.tocsr()


def _misura(**kw):
    # 0 = seme popolare (10.000 voti), 1 = blockbuster piu' popolare, 2 = cult buono, 3 = direct-to-video
    M = _grafo([(0, 1, 1.0), (0, 2, 1.0), (0, 3, 1.0)])
    voti = np.array([10000, 200000, 400, 150], np.float64)
    vave = np.array([7.0, 7.0, 7.2, 6.0], np.float64)
    runtime = np.array([110, 120, 102, 70], np.float64)
    out = mixer.gate_popolare_asimmetrico(M, voti, vave, runtime, **kw)
    return {j: float(out[0, j]) for j in (1, 2, 3)}


def test_il_cult_buono_passa_il_blockbuster_no():
    r = _misura(k_pop=10.0, tau=2.0, slope=1.5)
    assert r[2] > 0.999, f"il cult con voto alto non deve essere attenuato (peso {r[2]})"
    # 20x di voti: su=3,0, log(k_pop)=2,3 -> exp(-0,7/1,5) = 0,63 (attenuato ma non azzerato)
    assert r[1] < 0.7, f"il candidato 20x piu' popolare del seme va attenuato (peso {r[1]})"


def test_il_direct_to_video_viene_attenuato():
    r = _misura(k_pop=10.0, tau=2.0, slope=1.5)
    assert r[3] < 0.5, f"l'appendice da 150 voti e 70 minuti va attenuata (peso {r[3]})"


def test_la_soglia_su_vave_cambia_il_verdetto():
    a = _misura(vave_min=6.8)
    # abbasso ENTRAMBE le soglie: il direct-to-video (6,0 · 70') diventa "buono"
    b = _misura(vave_min=5.0, runtime_min=60)
    assert b[3] > a[3]


def test_il_simmetrico_invecchia_tutto():
    """Controprova: il gate simmetrico attenua anche il cult buono, ed e' il motivo del ticket."""
    M = _grafo([(0, 2, 1.0)])
    voti = np.array([10000, 0, 400], np.float64)
    out = mixer.gate_popolarita(M, voti, tau=3.0, slope=1.5)
    assert out[0, 2] == 0.0 or out[0, 2] < 1.0
