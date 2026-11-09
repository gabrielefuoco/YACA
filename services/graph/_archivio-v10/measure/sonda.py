"""sonda.py — il banco sonda (ticket 01). 20 titoli sentinella, letti prima e dopo.

Perche' esiste: gli indicatori aggregati (modularita', lambda2, conteggio, intruder test) ci hanno
tradito quattro volte su quattro. Questo strumento non e' un indicatore: e' **la lettura resa
ripetibile**. Stampa per ogni sentinella i compagni di bolla, con `+`/`-` rispetto a un riferimento.

Uso:
    python sonda.py <partizione.npy> [<riferimento.npy>]
    python sonda.py --tutte                 # confronta tutte le .npy di bolle-nitrile

Le tre domande, per ogni sentinella (le risponde chi legge, non lo script):
  1. la bolla e' un MONDO NOMINABILE?
  2. l'INTRUSO se n'e' andato?
  3. la NICCHIA e' rimasta intera?
"""
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from graph import bubbles as B

# ============================================================ i 20 titoli sentinella
SENTINELLE = [
    # --- 5 MINESTRONE: uno per ognuna delle bolle [217, 1270, 1267, 1215, 1288] del ticket 05
    ("minestrone", "Le jene di Chicago", "bolla 217: 35 titoli di genere doppiato anni '50-'70"),
    ("minestrone", "Garfield - Il Supergatto", "bolla 1270: Garfield + Boxcar Children + Spawn"),
    ("minestrone", "Gidget a Roma", "bolla 1267: film TV americani vecchi (The Bad Seed e' omonimo in due)"),
    ("minestrone", "La storia infinita", "bolla 1215: trilogia + Rambo III + film coi delfini"),
    ("minestrone", "Wimbledon", "bolla 1288: drammi generici per adulti"),

    # --- 5 NICCHIE DELICATE: i mondi che il ticket 08 aveva distrutto
    ("nicchia", "Banana Fish", "seinen anime (con Kaiji, 91 Days)"),
    ("nicchia", "Barakamon", "iyashikei / slice-of-life (con Senko-san, Aria, Flying Witch)"),
    ("nicchia", "Watamote", "slice-of-life comico giapponese (con Bakuman)"),
    ("nicchia", "Boys Over Flowers", "romance asiatico live-action"),
    ("nicchia", "Flying Witch", "iyashikei puro (con Barakamon, Aria, Senko-san)"),

    # --- 5 AUTORI / SCUOLE
    ("autore", "Il matrimonio di Maria Braun", "Fassbinder / Nuovo cinema tedesco"),
    ("autore", "I sette samurai", "Kurosawa / cinema giapponese classico"),
    ("autore", "Profondo Rosso", "Argento / giallo italiano"),
    ("autore", "Stalker", "Tarkovsky / cinema d'autore sovietico"),
    ("autore", "Il tamburo di latta", "Schloendorff / Nuovo cinema tedesco (adiacenza verificata)"),

    # --- 5 CROSS-MEDIUM E INTRUSI
    ("intruso", "Into Darkness - Star Trek", "l'intruso nella bolla Star Wars: J.J. Abrams dirotta entrambi"),
    ("intruso", "Guerre stellari", "la bolla che ha subito l'intruso"),
    ("cross-medium", "The Mandalorian", "serie TV: deve stare con i film di Star Wars?"),
    ("cross-medium", "Star Trek: Discovery", "serie TV: deve stare con i film di Star Trek?"),
    ("cross-medium", "Żeby nie było śladów", "titolo polacco (prova cross-medium, come il ticket 12)"),
]


def trova(TIT, nome):
    """Cerca un titolo per nome esatto, poi per sottostringa. Riporta se non lo trova."""
    esatti = [r for r in range(len(TIT)) if TIT[r].strip().lower() == nome.strip().lower()]
    if esatti:
        return esatti[0], "esatto"
    parz = [r for r in range(len(TIT)) if nome.strip().lower() in str(TIT[r]).strip().lower()]
    if parz:
        return sorted(parz, key=lambda r: len(str(TIT[r])))[0], "parziale"
    return None, "NON TROVATO"


def membri(mem, r):
    return set(np.where(mem == mem[r])[0].tolist())


def stampa_confronto(nome_dopo, mem_dopo, mem_rif=None, nome_rif="riferimento", TIT=None, VOT=None,
                     larghezza=78):
    if TIT is None:
        TIT, VOT = B.titoli_leggibili()
    print("\n" + "=" * larghezza)
    print(f"BANCO SONDA — {nome_dopo}" + (f"   (confronto con {nome_rif})" if mem_rif is not None else ""))
    print("=" * larghezza)
    for gruppo, nome, nota in SENTINELLE:
        r, modo = trova(TIT, nome)
        if r is None:
            print(f"\n[{gruppo:>12}] {nome:<34} -- {nota}\n   !! {modo}")
            continue
        b = membri(mem_dopo, r)
        print(f"\n[{gruppo:>12}] {TIT[r]}  ({int(VOT[r]):,} voti) -- {nota}")
        print(f"               bolla {int(mem_dopo[r])} con {len(b)} titoli   [{modo}]")
        if mem_rif is not None:
            a = membri(mem_rif, r)
            persi = a - b
            entrati = b - a
            if persi:
                print(f"               - USCITI  ({len(persi)}): "
                      + " | ".join(str(TIT[x])[:34] for x in sorted(persi)[:10]))
            if entrati:
                print(f"               + ENTRATI ({len(entrati)}): "
                      + " | ".join(str(TIT[x])[:34] for x in sorted(entrati)[:10]))
            if not persi and not entrati:
                print("               = bolla IDENTICA")
        altri = sorted(b - {r}, key=lambda x: -VOT[x])
        print("               resta con: " + " | ".join(str(TIT[x])[:34] for x in altri[:16]))
    print("\n" + "=" * larghezza)


def riassunto(mem, TIT=None):
    """Le tre domande, tradotte in numeri che NON decidono: solo da leggere accanto."""
    if TIT is None:
        TIT, _ = B.titoli_leggibili()
    out = []
    for gruppo, nome, _ in SENTINELLE:
        r, _ = trova(TIT, nome)
        if r is None:
            out.append((gruppo, nome, None, None))
            continue
        b = membri(mem, r)
        out.append((gruppo, nome, len(b), int(mem[r])))
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)
    TIT, VOT = B.titoli_leggibili()
    if args[0] == "--tutte":
        import glob
        rif = None
        for f in sorted(glob.glob(str(B.K.ML / "bolle-nitrile-*.npy"))):
            mem = np.load(f)
            stampa_confronto(pathlib.Path(f).stem, mem, rif, "riferimento", TIT, VOT)
            if rif is None:
                rif = mem
    else:
        mem = np.load(args[0])
        rif = np.load(args[1]) if len(args) > 1 else None
        stampa_confronto(pathlib.Path(args[0]).stem, mem, rif,
                         pathlib.Path(args[1]).stem if len(args) > 1 else "", TIT, VOT)
