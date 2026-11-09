"""Public contract of the offline V45 build command."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
LOCK = ROOT / 'services' / 'graph' / 'recipes' / 'V45.lock.json'


@pytest.mark.skip(reason=(
    "La build V45 non è più eseguibile da zero: `rrfstudent-norrfst.npz`, una fonte della fusione "
    "con peso 1.0, è stato perso nella pulizia dei dati (ticket 15), e il suo maestro con lui. "
    "Il grafo servito e gli artefatti runtime non sono toccati: `prepara.py` li ricava dal triangolo. "
    "Si riattiva questo test quando uno studente viene riaddestrato."
))
def test_v45_build_check_uses_frozen_recipe_without_writing():
    if not LOCK.is_file():
        pytest.skip('V45 build recipe/data are not installed in this checkout')
    env = dict(os.environ, PYTHONPATH=str(ROOT / 'services'))
    result = subprocess.run(
        [sys.executable, '-m', 'graph.build', '--check'],
        cwd=ROOT, env=env, text=True, capture_output=True, timeout=180,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'Ricetta congelata: input, codice e studente corrispondono.' in result.stdout
