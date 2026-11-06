"""Public contract of the offline V45 build command."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
LOCK = ROOT / 'services' / 'graph' / 'recipes' / 'V45.lock.json'


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
