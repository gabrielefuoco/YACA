"""Verifica che gli artefatti del collocatore ci siano e siano QUELLI.

Non è una formalità: il ticket 15 ha distrutto due artefatti perché nessun file dichiarava che
servivano. Qui la regola è quella di `canon.A()` — se un file manca o lo sha non torna, **si ferma e
nomina come rifarlo**, invece di produrre righe plausibili con un artefatto diverso.

  py .scratch/profili-e-identita/verifica-artefatti.py
  py .scratch/profili-e-identita/verifica-artefatti.py --veloce   (solo esistenza, senza sha)
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "services" / "graph" / "data" / "collocatore"
MANIFESTO = ROOT / ".scratch" / "profili-e-identita" / "artefatti-collocatore.manifest.json"


def sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def verifica(veloce: bool = False) -> list[str]:
    """Ritorna l'elenco dei problemi; lista vuota = tutto a posto."""
    if not MANIFESTO.is_file():
        return [f"manca il manifesto: {MANIFESTO}"]
    man = json.loads(MANIFESTO.read_text(encoding="utf-8"))
    problemi: list[str] = []
    for nome, atteso in man["artefatti"].items():
        p = BASE / nome
        if not p.is_file():
            ricetta = man["rigenerazione"].get(nome, "nessuna ricetta dichiarata: attenzione")
            problemi.append(f"MANCA {nome}\n      rigenera con: {ricetta}")
            continue
        if veloce:
            continue
        if p.stat().st_size != atteso["byte"]:
            problemi.append(f"DIMENSIONE DIVERSA {nome}: {p.stat().st_size} contro {atteso['byte']}")
            continue
        if sha(p) != atteso["sha256"]:
            ricetta = man["rigenerazione"].get(nome, "nessuna ricetta dichiarata")
            problemi.append(f"SHA DIVERSO {nome} — il file non è quello per cui è stato tarato il "
                            f"collocatore\n      rigenera con: {ricetta}")
    return problemi


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--veloce", action="store_true", help="solo esistenza e dimensione, senza sha")
    a = ap.parse_args()
    problemi = verifica(a.veloce)
    if problemi:
        print(f"ARTEFATTI DEL COLLOCATORE: {len(problemi)} problemi\n")
        for p in problemi:
            print(f"  · {p}")
        print("\nIl collocatore rifiuta di lavorare: un titolo collocato con un artefatto diverso "
              "sarebbe sbagliato senza sembrarlo.")
        return 1
    man = json.loads(MANIFESTO.read_text(encoding="utf-8"))
    print(f"artefatti a posto: {len(man['artefatti'])} file, "
          f"{sum(v['byte'] for v in man['artefatti'].values())/2**30:.2f} GiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
