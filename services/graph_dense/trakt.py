"""trakt.py — i log degli utenti Trakt come matrice per la valutazione controfattuale.

Sono 4.452 file (2.226 utenti × `movie`/`show`), 1,3 GB di JSON in `.cache/trakt/users/`. Qui si
leggono una volta, si mappano sulle righe del canone e si salvano in un npz compatto: l'analisi
successiva costa secondi invece di minuti.

Cosa serve alla valutazione (ticket 01):
  · split temporale per utente: il passato semina, il futuro misura. Un grafo che "sa" solo
    riproporre i vicini di cio' che ho gia' visto prende un punteggio alto; il futuro no.
  · le propensioni per SNIPS: gli item popolari compaiono in tutte le storie, quindi un hit su un
    item popolare vale meno di un hit su un item raro.
"""
from __future__ import annotations

import glob
import json
import time
import zlib
from pathlib import Path

import numpy as np

from . import data as D

CACHE = Path(__file__).resolve().parent / "data" / "trakt-utenti.npz"
UTENTI = Path(".cache/trakt/users")


def costruisci(cartella: Path | str = UTENTI, cache: Path | str = CACHE, silenzioso=False):
    """Legge i JSON e salva (utente, riga_canone, timestamp) in un npz. Idempotente."""
    if not silenzioso:
        print(f"  trakt: leggo {cartella} ...", flush=True)
    B = D.basic()
    ro = B['row_of']
    u, i, t = [], [], []
    t0 = time.time()
    for n, f in enumerate(sorted(glob.glob(f"{cartella}/*.json"))):
        # L'ID DELL'UTENTE DEVE ESSERE STABILE E CONDIVISO fra `movie-*.json` e `show-*.json`:
        # `hash()` di Python e' randomizzato per processo (due run darebbero utenti diversi) e
        # hashing del nome completo terrebbe separati i film e le serie della stessa persona.
        uid = zlib.crc32(_chiave_utente(f).encode("utf-8")) & 0x7FFFFFFF
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for e in d if isinstance(d, list) else []:
            ent = e.get("movie") or e.get("show") or e.get("episode")
            if not isinstance(ent, dict):
                continue
            ids = ent.get("ids") or {}
            tmdb = ids.get("tmdb")
            if tmdb is None and isinstance(ent.get("show"), dict):
                tmdb = (ent["show"].get("ids") or {}).get("tmdb")
            if tmdb is None:
                continue
            tipo = "movie" if "movie" in e else "tv"
            riga = ro.get(f"{tipo}:{int(tmdb)}")
            if riga is None:
                continue
            ts = e.get("last_watched_at") or e.get("last_updated_at") or ""
            u.append(uid); i.append(riga); t.append(_epoch(ts))
        if not silenzioso and n % 1000 == 0:
            print(f"    {n} file · {len(i):,} interazioni ({time.time()-t0:.0f}s)", flush=True)
    U = np.asarray(u, np.int64); I = np.asarray(i, np.int32); T = np.asarray(t, np.int64)
    # un utente puo' comparire sia come movie-*.json sia come show-*.json: si uniscono
    chiavi, inv = np.unique(U, return_inverse=True)
    U = inv.astype(np.int32)
    Path(cache).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, utente=U, riga=I, tempo=T, utenti=chiavi)
    if not silenzioso:
        print(f"  trakt: {U.max()+1:,} utenti · {len(I):,} interazioni · salvato {cache}",
              flush=True)
    return U, I, T


def _chiave_utente(f) -> str:
    """`.../movie-abc.json` e `.../show-abc.json` sono la stessa persona: la chiave e' `abc`."""
    stem = Path(f).stem
    return stem.split("-", 1)[1] if "-" in stem else stem


def _epoch(s: str) -> int:
    """'2025-01-01T21:21:00.000Z' -> epoch secondi (0 se illeggibile)."""
    if not isinstance(s, str) or len(s) < 19:
        return 0
    try:
        import datetime as dt
        d = dt.datetime(int(s[0:4]), int(s[5:7]), int(s[8:10]),
                        int(s[11:13]), int(s[14:16]), int(s[17:19]))
        return int(d.timestamp())
    except Exception:
        return 0


def carica(cache: Path | str = CACHE):
    if not Path(cache).exists():
        return costruisci(cache=cache)
    z = np.load(cache)
    return z["utente"], z["riga"], z["tempo"]


def split_temporale(U, I, T, frazione=0.70, min_passato=3, min_futuro=1):
    """Per ogni utente: il primo 70% (per tempo) semina, l'ultimo 30% misura.

    Ritorna `[(semi, futuro)]` con le righe del canone. Gli utenti con storia troppo corta si
    scartano: un seme di 1 titolo non misura niente.
    """
    ordine = np.lexsort((T, U))
    U, I, T = U[ordine], I[ordine], T[ordine]
    confini = np.searchsorted(U, np.arange(U.max() + 2))
    casi = []
    for u in range(U.max() + 1):
        a, b = confini[u], confini[u + 1]
        if b - a < min_passato + min_futuro:
            continue
        taglio = a + int(round((b - a) * frazione))
        semi = I[a:taglio]
        futuro = I[taglio:b]
        if len(semi) >= min_passato and len(futuro) >= min_futuro:
            casi.append((np.unique(semi), np.unique(futuro)))
    return casi


def propensioni(I, tau=1.0, gamma=0.75):
    """p_j ∝ (frequenza_j + tau)^gamma, normalizzata. Serve a SNIPS e a surprise-recall."""
    freq = np.bincount(I, minlength=D.basic()['N']).astype(np.float64)
    p = (freq + tau) ** gamma
    return p / p.sum()
