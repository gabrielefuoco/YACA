"""Ablazione marginale TRIBU su V42: stessi altri tipi, cambia solo la matrice/il peso TRIBU.

Usa gli output V42 già congelati come input; non scarica dati né tocca V42. La matrice TRIBU
sostitutiva deve essere già stata costruita con `tribu_gusto.py --seme ...`.

  PYTHONPATH=. py .scratch/uscire-dal-plateau/tribu-ablation.py .cache/tribu-v42d-b.npz
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / '.scratch/uscire-dal-plateau/V42.lock.json'
SOURCE = ROOT / 'services/graph/data/tipi2'
PESI_BASE = ROOT / 'services/graph/data/v42/pesi.json'
TIPI = ROOT / '.scratch/distillazione-grafo/tipi.py'
MIXER = ROOT / '.scratch/distillazione-grafo/mixer.py'
CHIUDI = ROOT / '.scratch/distillazione-grafo/chiudi.py'


def run(cmd, env):
    print('\n$ ' + ' '.join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), cwd=ROOT, env=env, check=True)


def main():
    if len(sys.argv) != 2:
        raise SystemExit('uso: tribu-ablation.py TRIBU-deterministica.npz')
    tribu = Path(sys.argv[1]).resolve()
    if not tribu.exists():
        raise SystemExit(f'manca {tribu}')
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    names = lock['tipi']
    out = ROOT / '.cache' / 'tribu-ablation-v42'
    if out.exists():
        shutil.rmtree(out)
    raw, norm, budget = out / 'tipi', out / 'norm', out / 'budget'
    raw.mkdir(parents=True); norm.mkdir(); budget.mkdir()
    manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    (raw / 'manifest.json').write_text(
        json.dumps({t: manifest[t] for t in names}, ensure_ascii=False, indent=1), encoding='utf-8')
    for t in names:
        shutil.copy2(SOURCE / f'{t}.npz', raw / f'{t}.npz')
    shutil.copy2(tribu, raw / 'TRIBU.npz')
    env = dict(os.environ, PYTHONPATH='.', TIPI_OUT=str(raw), NORM_OUT=str(norm),
               PESI_OUT=str(budget))
    run([sys.executable, '-u', TIPI, 'norm'], env)
    run([sys.executable, '-u', TIPI, 'budget', '--pota', '100'], env)
    base = json.loads(PESI_BASE.read_text(encoding='utf-8'))
    cli = ['--modo', 'rrf', '--rrf-k', '15', '--damp-coll', '--damp-titolo',
           '--gate-asimmetrico', '--pop-gap', '2.0', '--pop-slope', '1.5', '--gate-k', '10',
           '--damp-animazione', '--damp-anim-fattore', '0.2', '--tipi', ','.join(names)]
    for label, weight in (('tribu-015', 0.15), ('senza-tribu', 0.0), ('tribu-030', 0.30)):
        dest = out / label; dest.mkdir()
        pesi = dict(base); pesi['TRIBU'] = weight
        (dest / 'pesi.json').write_text(json.dumps(pesi, indent=1), encoding='utf-8')
        env_mix = dict(env, MIX_OUT=str(dest))
        run([sys.executable, '-u', MIXER, *cli], env_mix)
        run([sys.executable, '-u', CHIUDI, dest / 'MIX-rrf-dc-dt-ga.npz',
             dest / f'bolle-eterogeneo-{label}.npz', '--modo', 'log'], env_mix)
    print(f'\nGrafi ablation: {out}')


if __name__ == '__main__':
    main()
