"""Ricostruisce la fusione congelata V42 dai tipi top-100 gia' normalizzati e pesati.

Uso (dalla root repo):
  PYTHONPATH=. py .scratch/uscire-dal-plateau/build-v42.py --check
  PYTHONPATH=. py .scratch/uscire-dal-plateau/build-v42.py --build

Non rigenera i 14 tipi dai corpora: questi restano input versionati per hash in V42.lock.json.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / '.scratch/uscire-dal-plateau/V42.lock.json'
DATA = ROOT / 'services/graph/data'
OUT = DATA / 'v42'
PESI_OUT = DATA / 'tipi2-pesi'
FINAL = OUT / 'bolle-eterogeneo-V42-p1.0-triangolo.npz'
MIX = OUT / 'MIX-rrf-dc-dt-ga.npz'


def errore(msg):
    raise SystemExit(f'V42: {msg}')


def sha(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def carica_lock():
    return json.loads(LOCK.read_text(encoding='utf-8'))


def verifica_input(lock):
    pesi = json.loads((OUT / 'pesi.json').read_text(encoding='utf-8'))
    if pesi != lock['weights']:
        errore('pesi.json non corrisponde a V42.lock.json')
    for tipo, expected in lock['tipi_source_sha256'].items():
        p = DATA / 'tipi2' / f'{tipo}.npz'
        if not p.exists() or sha(p) != expected:
            errore(f'input tipo non congelato: {p}')
    for tipo, expected in lock['mixer_inputs_sha256'].items():
        p = PESI_OUT / f'{tipo}.npz'
        if not p.exists() or sha(p) != expected:
            errore(f'input pesato/normalizzato non congelato: {p}')
    for name, expected in lock['pipeline_code_sha256'].items():
        p = ROOT / name
        if not p.exists() or sha(p) != expected:
            errore(f'codice pipeline cambiato: {name} (serve una nuova versione, non sovrascrivere V42)')


def verifica_output(lock, byte_esatti=False):
    from services.graph_dense import provenance as PV
    for p in (MIX, FINAL):
        if not p.exists():
            errore(f'artefatto assente: {p}')
    M, pm = PV.leggi(MIX)
    F, pf = PV.leggi(FINAL)
    if pm is None or pm.get('step') != 'mixer':
        errore('provenienza MIX assente o step errato')
    if pm.get('inputs') != lock['mixer_inputs_sha256']:
        errore('input SHA del MIX diversi dal lock')
    if PV.sha256_obj(pm.get('params', {})) != lock['mixer_params_sha256']:
        errore('parametri del mixer diversi dal lock')
    if M.shape != (lock['canon_len'],) * 2 or M.nnz != lock['artifact_stats']['mix_nnz']:
        errore('shape/nnz del MIX diversi dal lock')
    if pf is None or pf.get('step') != 'chiusura' or pf.get('params', {}).get('modo') != 'log':
        errore('provenienza della chiusura assente o errata')
    if pf.get('inputs', {}).get('sorgente') != sha(MIX):
        errore('la chiusura non e\' costruita dal MIX presente')
    if F.shape != (lock['canon_len'],) * 2 or F.nnz != lock['artifact_stats']['final_nnz']:
        errore('shape/nnz del grafo finale diversi dal lock')
    if byte_esatti:
        for p in (MIX, FINAL):
            if sha(p) != lock['artifacts_sha256'][p.name]:
                errore(f'hash binario diverso dall\'artefatto congelato: {p.name}')
        if pm.get('sha256') != lock['mixer_provenance_sha256']:
            errore('provenienza MIX diversa dal freeze')
        if pf.get('sha256') != lock['final_provenance_sha256']:
            errore('provenienza finale diversa dal freeze')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='verifica hash e provenienza senza scrivere')
    mode.add_argument('--build', action='store_true', help='ricostruisce MIX e chiusura dai tipi congelati')
    a = ap.parse_args()
    os.chdir(ROOT)
    lock = carica_lock()
    verifica_input(lock)
    if a.check:
        verifica_output(lock, byte_esatti=True)
        print('V42 OK: tipi, codice, MIX e grafo finale corrispondono agli hash congelati.')
        return

    env = dict(os.environ, PYTHONPATH='.', PESI_OUT=str(PESI_OUT), MIX_OUT=str(OUT))
    tipi = ','.join(lock['tipi'])
    subprocess.run([sys.executable, '-u', '.scratch/distillazione-grafo/mixer.py',
                    '--modo', 'rrf', '--rrf-k', '15', '--damp-coll', '--damp-titolo',
                    '--gate-asimmetrico', '--pop-gap', '2.0', '--pop-slope', '1.5', '--gate-k', '10',
                    '--damp-animazione', '--damp-anim-fattore', '0.2', '--tipi', tipi],
                   cwd=ROOT, env=env, check=True)
    subprocess.run([sys.executable, '-u', '.scratch/distillazione-grafo/chiudi.py', str(MIX),
                    str(FINAL), '--modo', 'log'], cwd=ROOT, env=env, check=True)
    verifica_output(lock)
    print(f'V42 ricostruita: {FINAL}')


if __name__ == '__main__':
    main()
