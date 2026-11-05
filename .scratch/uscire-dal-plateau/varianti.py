"""varianti.py — provare pesi e temperature SENZA ricostruire i tipi.

PERCHE' ESISTE. La build completa costa ~35 minuti, ma `tipi2-pesi/` e' gia' normalizzato e troncato:
cambiare pesi o `k` per tipo (temperatura) cambia solo la fusione (mixer, ~2 min) e la chiusura
(~5,5 min). Cosi' si confrontano cinque ipotesi in mezz'ora invece di tre ore.

  PYTHONPATH=. py .scratch/uscire-dal-plateau/varianti.py v45 --nome t1 \
      --pesi '{"LISTSEM":1.0,...}' --temperatura 'LISTSEM:3:15;CREWPROP:3:15'
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIXER = ROOT / '.scratch' / 'distillazione-grafo' / 'mixer.py'
CHIUDI = ROOT / '.scratch' / 'distillazione-grafo' / 'chiudi.py'


def run(cmd, env):
    print('$', ' '.join(str(c) for c in cmd[-8:]), flush=True)
    p = subprocess.run([str(c) for c in cmd], cwd=ROOT, env=env)
    if p.returncode:
        raise SystemExit(f'comando fallito ({p.returncode}): {" ".join(str(c) for c in cmd)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base', help='versione che contiene tipi2-pesi/ (es. v45)')
    ap.add_argument('--nome', required=True, help='suffisso: i risultati vanno in data/<base>-<nome>/')
    ap.add_argument('--pesi', default='', help='JSON dei pesi; vuoto = quelli della base')
    ap.add_argument('--temperatura', default='', help='es. "LISTSEM:3:15;LIST:5:40"')
    ap.add_argument('--rrf-k', type=int, default=15)
    ap.add_argument('--mixer-args', default='--damp-coll --damp-titolo --gate-asimmetrico '
                                             '--pop-gap 2.0 --pop-slope 1.5 --gate-k 10 '
                                             '--damp-animazione --damp-anim-fattore 0.2')
    a = ap.parse_args()

    base = ROOT / 'services' / 'graph' / 'data' / a.base
    pesi_dir = base / 'tipi2-pesi'
    src = base / 'pesi.json'
    pesi = json.loads(src.read_text(encoding='utf-8')) if src.exists() else {}
    if a.pesi:
        pesi.update(json.loads(a.pesi))
    out = ROOT / 'services' / 'graph' / 'data' / f'{a.base}-{a.nome}'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'pesi.json').write_text(json.dumps(pesi, indent=1), 'utf-8')

    env = dict(os.environ, PYTHONPATH='.', PESI_OUT=str(pesi_dir), MIX_OUT=str(out))
    tipi = ','.join(sorted(pesi))
    cmd = [sys.executable, '-u', MIXER, '--modo', 'rrf', '--rrf-k', str(a.rrf_k),
           '--tipi', tipi]
    if a.temperatura:
        cmd += ['--temperatura', a.temperatura]
    cmd += a.mixer_args.split()
    run(cmd, env)

    final = out / f'bolle-eterogeneo-{a.nome.upper()}-p1.0-triangolo.npz'
    run([sys.executable, '-u', CHIUDI, out / 'MIX-rrf-dc-dt-ga.npz', final, '--modo', 'log'], env)
    print(f'\npronta: {final}')


if __name__ == '__main__':
    main()
