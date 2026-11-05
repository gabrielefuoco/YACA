"""Riproduci V45 dal lock congelato, senza download né ri-training dello studente.

  PYTHONPATH=. py .scratch/uscire-dal-plateau/build-v45.py --check
  PYTHONPATH=. py .scratch/uscire-dal-plateau/build-v45.py --build --version v45-replay

La build scrive in una directory nuova; non sovrascrive mai `services/graph/data/v45`.
Se input, codice, uno qualsiasi dei 14 tipi, MIX o matrice finale differisce dal lock, esce
con errore lasciando l'output per diagnosi.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from services.graph_dense import config as C

ROOT = C.ROOT
LOCK = ROOT / '.scratch' / 'uscire-dal-plateau' / 'V45.lock.json'


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='verifica input/codice congelati, senza scrivere')
    mode.add_argument('--build', action='store_true', help='ricostruisce V45 in una directory nuova e verifica gli hash')
    ap.add_argument('--version', default='v45-replay', help='output nuovo, default v45-replay')
    a = ap.parse_args()
    lock = __import__('json').loads(LOCK.read_text(encoding='utf-8'))
    r = lock['recipe']
    cmd = [sys.executable, '-u', '-m', 'services.graph_dense.build_graph',
           '--recipe-lock', str(LOCK.relative_to(ROOT)), '--rrfst', r['rrfst']]
    if a.check:
        cmd += ['--check']
    else:
        if a.version == 'v45':
            ap.error('il replay non può sovrascrivere V45; scegli un nuovo --version')
        cmd += ['--build', '--version', a.version,
                '--tribu-seed', str(r['tribu_seed']), '--tribu-k', str(r['tribu_k']),
                '--tribu-top', str(r['tribu_top']), '--tribu-mainstream', str(r['tribu_mainstream']),
                '--tribu-beta', str(r['tribu_beta']), '--tribu-weight', str(r['tribu_weight']),
                '--covision-topk', str(r['covision_topk'])]
    subprocess.run(cmd, cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
