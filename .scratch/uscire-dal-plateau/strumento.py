"""strumento.py — il grafo-strumento per il dev set a 5 blocchi.

PERCHE' ESISTE (handoff 5, §2). Il dev set attuale e' cieco solo per 155 dei 775 autori di liste.
Per usare tutti i 736 casi bisogna che il grafo escluda da LIST e LISTSEM **tutti** gli autori:
allora nessun caso puo' essere ricordato dal tipo che legge le liste. Costa una ricostruzione di
LIST e LISTSEM, non cinque: gli altri 12 tipi sono gia' pronti e restano identici.

  PYTHONPATH=. py .scratch/uscire-dal-plateau/strumento.py v45 v45x
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BG = ROOT / 'services' / 'graph_dense' / 'build_graph.py'
LIST_SCRIPT = ROOT / '.scratch' / 'distillazione-grafo' / 'covision-list.py'
MIXER = ROOT / '.scratch' / 'distillazione-grafo' / 'mixer.py'
CHIUDI = ROOT / '.scratch' / 'distillazione-grafo' / 'chiudi.py'
TUTTI = ROOT / '.scratch' / 'banco-casi' / 'holdout-tutti.json'


def run(cmd, env):
    print('$', ' '.join(str(c) for c in cmd[-6:]), flush=True)
    p = subprocess.run([str(c) for c in cmd], cwd=ROOT, env=env)
    if p.returncode:
        raise SystemExit(f'fallito ({p.returncode})')


def main():
    base, nuovo = sys.argv[1], sys.argv[2]
    holdout = Path(sys.argv[3]) if len(sys.argv) > 3 else TUTTI
    src = ROOT / 'services' / 'graph' / 'data' / base
    dst = ROOT / 'services' / 'graph' / 'data' / nuovo
    aux = ROOT / 'services' / 'graph_dense' / 'data' / nuovo
    for p in (dst, aux):
        if p.exists():
            raise SystemExit(f'{p} esiste gia\'')
        (p / 'tipi2' if p is dst else p).mkdir(parents=True)
    (dst / 'tipi2-norm').mkdir(parents=True, exist_ok=True)
    (dst / 'tipi2-pesi').mkdir(parents=True, exist_ok=True)

    # gli altri tipi sono copiati: solo LIST e LISTSEM cambiano
    import shutil
    for f in (src / 'tipi2').glob('*.npz'):
        if f.stem not in ('LIST', 'LISTSEM'):
            shutil.copy2(f, dst / 'tipi2' / f.name)
    man = {}
    mp = src / 'tipi2' / 'manifest.json'
    if mp.exists():
        man = {k: v for k, v in __import__('json').loads(mp.read_text(encoding='utf-8')).items()
               if k not in ('LIST', 'LISTSEM')}
    (dst / 'tipi2' / 'manifest.json').write_text(
        __import__('json').dumps(man, ensure_ascii=False, indent=1), 'utf-8')
    (dst / 'pesi.json').write_text((src / 'pesi.json').read_text(encoding='utf-8'), 'utf-8')

    env = dict(os.environ, PYTHONPATH='.', TIPI_OUT=str(dst / 'tipi2'),
               NORM_OUT=str(dst / 'tipi2-norm'), PESI_OUT=str(dst / 'tipi2-pesi'),
               MIX_OUT=str(dst), HOLDOUT_AUTORI=str(holdout),
               LIST_OUT=str(aux / 'covision-list.npz'), LIST_MINSUP='2',
               LISTSEM_EMBEDDINGS=str(ROOT / 'services' / 'graph_dense' / 'data' /
                                      'embeddings' / 'listsem-qwen3-0.6b.npz'),
               HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')

    run([sys.executable, '-u', LIST_SCRIPT, 'build'], env)
    from services.graph_dense import build_graph as bg
    bg.registra_list(env, aux / 'covision-list.npz', dst / 'tipi2')
    run([sys.executable, '-u', '-m', 'services.graph_dense.listsem', '--k', '100',
         '--out', dst / 'tipi2' / 'LISTSEM.npz',
         '--manifest', dst / 'tipi2' / 'manifest.json'], env)

    pesi = __import__('json').loads((dst / 'pesi.json').read_text(encoding='utf-8'))
    tipi = ','.join(t for t in pesi if (dst / 'tipi2' / f'{t}.npz').exists())
    run([sys.executable, '-u', bg.TIPI_SCRIPT, 'norm'], env)
    run([sys.executable, '-u', bg.TIPI_SCRIPT, 'budget', '--pota', '100'], env)
    run([sys.executable, '-u', MIXER, '--modo', 'rrf', '--rrf-k', '15', '--damp-coll',
         '--damp-titolo', '--gate-asimmetrico', '--pop-gap', '2.0', '--pop-slope', '1.5',
         '--gate-k', '10', '--damp-animazione', '--damp-anim-fattore', '0.2', '--tipi', tipi], env)
    final = dst / f'bolle-eterogeneo-{nuovo.upper()}-p1.0-triangolo.npz'
    run([sys.executable, '-u', CHIUDI, dst / 'MIX-rrf-dc-dt-ga.npz', final, '--modo', 'log'], env)
    print(f'\npronta: {final}')


if __name__ == '__main__':
    main()
