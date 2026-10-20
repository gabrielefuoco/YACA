#!/usr/bin/env python3
"""Sonda del Ticket 19 — i flag per-titolo nel canone (ANIME, ADULTO).

Cosa prova, senza i Parquet e senza rigenerare l'artefatto vero (passo che vive sul mate):
  1. un artefatto **senza** i flag (quello di oggi) viene letto lo stesso, e il motore DICHIARA che i
     filtri a monte restano inerti — nessun crash, nessun silenzio;
  2. un artefatto **con** i flag li espone al motore (`ANIME`, `ADULTO`);
  3. le liste dell'adulto in `parametri.py` sono **identiche** a quelle del prodotto
     (`src/catalog/kidsModeFilters.js`): due liste diverse vorrebbero dire scartare cose diverse.

Uso: py scripts/qa/probe-ticket-19-flag.py
"""
import json
import os
import re
import sys
import tempfile

import numpy as np

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RADICE, "services"))

from graph import canon, parametri as P  # noqa: E402


def leggi_liste_prodotto():
    """I due elenchi del kids-mode, letti dal file Node (non ricopiati qui)."""
    percorso = os.path.join(RADICE, "src", "catalog", "kidsModeFilters.js")
    testo = open(percorso, encoding="utf-8").read()
    def elenco(nome):
        blocco = re.search(rf"const {nome} = \[(.*?)\]\.join\('\,'\);", testo, re.S)
        if not blocco:
            raise SystemExit(f"non trovo {nome} in {percorso}")
        return {int(x) for x in re.findall(r"\b(\d{1,7})\b", blocco.group(1))}
    return elenco("ADULT_GENRE_IDS"), elenco("ADULT_KEYWORD_IDS")


def scrivi_artefatto(cartella, con_flag):
    """Un artefatto minimo ma VALIDO per il lettore: stesse chiavi, stessa impronta dei generi."""
    N = 4
    z = os.path.join(cartella, "metadati.npz")
    d = {
        "generi_sha": np.array(__import__("hashlib").sha256(
            f"{P.ASSE_COZY_GENERI}|{P.ASSE_IMPEGNATIVO_GENERI}".encode()).hexdigest()[:16]),
        "VOT": np.array([100, 200, 300, 400], np.float64),
        "VAVE": np.array([7.5, 6.0, 8.1, 5.5], np.float64),
        "POP": np.array([10.0, 20.0, 30.0, 40.0], np.float64),
        "ANNO": np.array([2001, 2002, 2003, 2004], np.float64),
        "NEP": np.array([1.0, 1.0, 1.0, 1.0], np.float64),
        "COZY": np.array([True, False, False, False]),
        "IMP": np.array([False, True, False, False]),
        "COLL": np.full(N, -1, np.int64),
        "DIR": np.full(N, -1, np.int64),
    }
    if con_flag:
        d["ANIME"] = np.array([True, False, False, True])
        d["ADULTO"] = np.array([False, True, False, False])
    np.savez_compressed(z, **d)
    return z


def prova(cartella):
    print("== Ticket 19: i flag per-titolo nel canone ==")
    # Gli artefatti veri (`spazi-trakt.npz`, `titoli-canone.txt`) vivono sul mate: qui il canone e'
    # SINTETICO (4 titoli), cosi' il lettore si prova lo stesso, senza inventare un artefatto che non c'e'.
    righe_titoli = {f"movie:{1000 + i}": i for i in range(4)}
    canon.titoli = lambda: (os.path.join(cartella, "titoli.txt"), righe_titoli, 4, None)
    percorso_titoli = os.path.join(cartella, "titoli.txt")
    with open(percorso_titoli, "w", encoding="utf-8") as f:
        f.write(chr(10).join(["Titolo uno", "Titolo due", "Titolo tre", "Titolo quattro"]))

    for con_flag in (False, True):
        z = scrivi_artefatto(cartella, con_flag)
        etichetta = "CON i flag" if con_flag else "SENZA i flag (artefatto di oggi)"
        d = canon.metadati(path_npz=z, path_txt=percorso_titoli)
        anime = d.get("ANIME")
        adulto = d.get("ADULTO")
        print(f"  {etichetta}: ANIME={'assente' if anime is None else int(anime.sum())} "
              f"· ADULTO={'assente' if adulto is None else int(adulto.sum())}")
        if con_flag:
            assert anime is not None and int(anime.sum()) == 2, "i flag devono arrivare al lettore"
            assert adulto is not None and int(adulto.sum()) == 1
        else:
            assert anime is None and adulto is None, "senza i flag il lettore deve dichiararli assenti"

    generi, keywords = leggi_liste_prodotto()
    generi_py = {int(x) for x in P.ADULTO_GENERI.split(",")}
    keywords_py = {int(x) for x in P.ADULTO_KEYWORDS.split(",")}
    print()
    print(f"  generi adulti:   prodotto {sorted(generi)} · motore {sorted(generi_py)} · uguali: {generi == generi_py}")
    print(f"  keyword adulte:  prodotto {len(keywords)} · motore {len(keywords_py)} · uguali: {keywords == keywords_py}")
    assert generi == generi_py, "le due liste dei generi devono coincidere"
    assert keywords == keywords_py, "le due liste delle keyword devono coincidere"
    print("OK")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        prova(tmp)
