"""kids.py — Gestione artefatto blacklist e maschera booleana kids_ok (Ticket 10 / Ticket 11).

PERCHÉ ESISTE:
Il filtro della modalità Bambini nel grafo V45 è una lista nera di 400 keyword
(62 semi + 114 Gruppo A + 224 Gruppo B, approvate e congelate in
`services/graph/data/keyword-bambini/blacklist.json`).

Per evitare che i titoli inadatti occupino spazio tra i candidati prima del taglio,
all'avvio del runtime viene costruito un vettore booleano `kids_ok` di 76.497 elementi
(pari alle righe del canone) combinando la blacklist con la matrice `kw-tfidf`
(`tfidf.npz` e `vocab.json`).

Regola 'dichiarare, non ingoiare':
- Se l'artefatto blacklist o la matrice kw-tfidf è mancante, la modalità Bambini
  degrada in modo rumoroso (rifiuto esplicito 503, avviso su /health e startup),
  senza mai servire silenziosamente il catalogo non filtrato.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import scipy.sparse as sp

from graph import canon as K

CMD_RIGENERA_BLACKLIST: str = "PYTHONPATH=. py .scratch/profili-e-identita/keyword-bambini/congelamento.py --conferma"
CMD_RIGENERA_KW_TFIDF: str = "PYTHONPATH=. py .scratch/distillazione-grafo/tfidf-v2.py"

MSG_ERR_BLACKLIST: str = (
    f"Artefatto blacklist mancante: blacklist.json. "
    f"Rigenerare con: {CMD_RIGENERA_BLACKLIST}"
)
MSG_ERR_KW_TFIDF: str = (
    f"Artefatto tassonomia/kw-tfidf mancante (tfidf.npz / vocab.json). "
    f"Rigenerare con: {CMD_RIGENERA_KW_TFIDF}"
)

_KIDS_OK_CACHE: np.ndarray | None = None
_KIDS_OK_ERROR: str | None = None
_CACHED_KEY: tuple[str, str, str, int] | None = None


def risolvi_percorso_blacklist(path: str | Path | None = None) -> Path:
    """Risolve il percorso del file blacklist.json."""
    if path is not None:
        return Path(path)
    env_p = os.environ.get("BLACKLIST_BAMBINI_PATH") or os.environ.get("BLACKLIST_PATH")
    if env_p:
        return Path(env_p)
    return K.DATA / "keyword-bambini" / "blacklist.json"


def risolvi_percorso_kw_tfidf(dir_path: str | Path | None = None) -> tuple[Path, Path]:
    """Risolve i percorsi di (vocab.json, tfidf.npz)."""
    env_dir = dir_path or os.environ.get("KW_TFIDF_DIR")
    if env_dir:
        d = Path(env_dir)
        v = d / "vocab.json" if (d / "vocab.json").exists() else d / "05-vocab.json"
        t = d / "tfidf.npz" if (d / "tfidf.npz").exists() else d / "05-tfidf.npz"
        return v, t

    d_canon = K.DATA / "kw-tfidf"
    v_canon = d_canon / "vocab.json"
    t_canon = d_canon / "tfidf.npz"
    if v_canon.is_file() and t_canon.is_file():
        return v_canon, t_canon

    # Nessun ripiego sui prototipi di `services/graph_dense`: esiste ancora, quindi il
    # ripiego non falliva mai in modo visibile — serviva artefatti diversi dai canonici
    # senza dirlo. Se manca il canonico lo si dichiara, e si prosegue senza.
    import logging
    logging.getLogger(__name__).warning(
        "kw-tfidf canonico assente in %s: la blacklist bambini resta senza espansione per parola chiave", d_canon
    )
    return v_canon, t_canon


def estrai_sha_blacklist(path: Path) -> str | None:
    """Estrae l'impronta SHA256 (primi 16 caratteri) dalla provenienza/meta o dal file."""
    if not path.is_file():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            meta = data.get("meta", {})
            sha = meta.get("sha256") if isinstance(meta, dict) else None
            if not sha:
                prov = data.get("_provenance", {})
                sha = prov.get("sha256") if isinstance(prov, dict) else None
            if sha:
                return str(sha)[:16]
    except Exception:
        pass
    try:
        import hashlib
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()[:16]
    except Exception:
        return None


def reset_cache_kids() -> None:
    """Azzera la cache in memoria del vettore kids_ok (per test e reload)."""
    global _KIDS_OK_CACHE, _KIDS_OK_ERROR, _CACHED_KEY
    _KIDS_OK_CACHE = None
    _KIDS_OK_ERROR = None
    _CACHED_KEY = None


def carica_kids_ok(
    n: int = 76497,
    bl_path: str | Path | None = None,
    kw_dir: str | Path | None = None,
) -> tuple[np.ndarray | None, str | None]:
    """Costruisce o recupera il vettore booleano kids_ok di dimensione N.

    Un elemento è False se il titolo canone possiede almeno una keyword presente
    nella blacklist congelata.

    Returns:
        tuple (kids_ok, errore_str)
        Se gli artefatti sono presenti e validi: (array booleano (N,), None)
        Se mancano o si verifica un errore: (None, messaggio_errore)
    """
    global _KIDS_OK_CACHE, _KIDS_OK_ERROR, _CACHED_KEY

    p_bl = risolvi_percorso_blacklist(bl_path)
    v_p, t_p = risolvi_percorso_kw_tfidf(kw_dir)

    cur_key = (str(p_bl), str(v_p), str(t_p), int(n))
    if _CACHED_KEY == cur_key:
        return _KIDS_OK_CACHE, _KIDS_OK_ERROR

    if not p_bl.is_file():
        err = f"{MSG_ERR_BLACKLIST} (percorso atteso: {p_bl})"
        _KIDS_OK_CACHE = None
        _KIDS_OK_ERROR = err
        _CACHED_KEY = cur_key
        return None, err

    if not v_p.is_file() or not t_p.is_file():
        err = f"{MSG_ERR_KW_TFIDF} (percorso atteso: {t_p})"
        _KIDS_OK_CACHE = None
        _KIDS_OK_ERROR = err
        _CACHED_KEY = cur_key
        return None, err

    try:
        with open(p_bl, "r", encoding="utf-8") as f:
            bl_data = json.load(f)
        blacklist = bl_data.get("blacklist", [])
        if not blacklist or not isinstance(blacklist, list):
            err = f"Formato blacklist non valido o lista vuota: {p_bl}"
            _KIDS_OK_CACHE = None
            _KIDS_OK_ERROR = err
            _CACHED_KEY = cur_key
            return None, err

        with open(v_p, "r", encoding="utf-8") as f:
            vocab = json.load(f)

        bl_cols = [vocab["kw:" + kw] for kw in blacklist if ("kw:" + kw) in vocab]
        if not bl_cols:
            # Nessuna colonna blacklist trovata nel vocabolario: tutti i titoli passano
            kids_ok = np.ones(n, dtype=bool)
            _KIDS_OK_CACHE = kids_ok
            _KIDS_OK_ERROR = None
            _CACHED_KEY = cur_key
            return kids_ok, None

        X = sp.load_npz(t_p)
        if X.shape[0] != n:
            err = f"Dimensione righe tfidf ({X.shape[0]}) diversa dal canone ({n})"
            _KIDS_OK_CACHE = None
            _KIDS_OK_ERROR = err
            _CACHED_KEY = cur_key
            return None, err

        # Sottoinsieme delle colonne blacklist (CSR slicing O(nnz_cols))
        X_sub = X[:, bl_cols]
        # X_sub.indptr ha dimensione n+1; np.diff(X_sub.indptr) > 0 indica righe con >= 1 occorrenza
        has_bad = np.diff(X_sub.indptr) > 0
        kids_ok = ~has_bad

        _KIDS_OK_CACHE = kids_ok
        _KIDS_OK_ERROR = None
        _CACHED_KEY = cur_key
        return kids_ok, None
    except Exception as exc:
        err = f"Errore durante l'elaborazione della blacklist bambini: {exc}"
        _KIDS_OK_CACHE = None
        _KIDS_OK_ERROR = err
        _CACHED_KEY = cur_key
        return None, err
