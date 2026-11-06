"""provenienza.py — ogni artefatto porta con sé come è stato fatto, o non si riproduce.

PERCHE' ESISTE. Tre bug della stessa famiglia ci sono costati tre versioni del grafo:
  · `mixer.py` senza `pesi.json` produceva un grafo con **tutti i pesi a 1,0 in silenzio**;
  · `chiudi.py` eseguito prima del mixer produceva un grafo con la **stessa topologia e pesi
    diversi** (la "chiusura" moltiplica per i vicini comuni: nessun arco nuovo, nessun errore);
  · `transizione_pronta()` cacheava su (sha del file, k) e non sapeva se la chiusuraera cambiata.

La regola qui: chi scrive un artefatto dichiara `step`, `params` e gli `inputs` con il loro sha; chi lo
legge lo verifica e **rifiuta** se lo step non è quello che si aspetta. Niente fallback.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import scipy.sparse as sp

CHIAVE = "_provenance"


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blocco in iter(lambda: f.read(1 << 20), b""):
            h.update(blocco)
    return h.hexdigest()


def sha256_obj(obj) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


def impronta(prov: dict) -> str:
    """Lo sha dell'intera provenienza: è la chiave di cache giusta per chi dipende dall'artefatto."""
    return sha256_obj(prov)


def scrivi(path, M: sp.spmatrix, step: str, params: dict | None = None,
           inputs: dict | None = None, canon_len: int | None = None) -> dict:
    """Scrive la matrice con la sua provenienza dentro lo stesso npz."""
    M = M.tocsr()
    prov = {
        "step": str(step),
        "params": params or {},
        "params_sha": sha256_obj(params or {}),
        "inputs": {str(k): str(v) for k, v in (inputs or {}).items()},
        "canon_len": int(canon_len if canon_len is not None else M.shape[0]),
    }
    prov["sha256"] = impronta({k: v for k, v in prov.items() if k != "sha256"})
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        path,
        indptr=M.indptr.astype(np.int64),
        indices=M.indices.astype(np.int32),
        data=M.data.astype(np.float32),
        shape=np.array(M.shape, np.int64),
        **{CHIAVE: np.array(json.dumps(prov, sort_keys=True, ensure_ascii=False))},
    )
    return prov


def leggi(path):
    """(matrice, provenienza | None). Non verifica: serve a chi vuole solo la matrice."""
    z = np.load(path, allow_pickle=False)
    if "shape" in z.files:
        shape = tuple(int(x) for x in z["shape"])
    else:
        shape = (int(z["indptr"].shape[0]) - 1, int(z["indptr"].shape[0]) - 1)
    M = sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=shape)
    prov = None
    if CHIAVE in z.files:
        try:
            prov = json.loads(str(z[CHIAVE]))
        except Exception:
            prov = None
    return M, prov


def verifica(path, step: str | None = None, inputs_attesi: dict | None = None) -> dict:
    """Legge la provenienza e rifiuta se manca, se lo step è un altro, o se un input è cambiato."""
    _, prov = leggi(path)
    if prov is None:
        raise ValueError(
            f"{path}: artefatto senza provenienza.\n"
            f"  Chi lo produce deve usare `provenance.scrivi(..., step=...)`: un artefatto senza "
            f"provenienza non si sa da dove venga, e questa è la classe di errore che ci ha già "
            f"fatto perdere tre versioni (pesi a 1,0 in silenzio, chiusura prima del mixer)."
        )
    if step is not None and prov.get("step") != step:
        raise ValueError(
            f"{path}: provenienza con step {prov.get('step')!r}, atteso {step!r}.\n"
            f"  L'ordine della pipeline è un invariante, non una convenzione: {step} legge solo "
            f"output di {step}."
        )
    if inputs_attesi:
        per_nome = prov.get("inputs") or {}
        for nome, sha in inputs_attesi.items():
            if per_nome.get(nome) != sha:
                raise ValueError(
                    f"{path}: input {nome!r} cambiato (registrato {per_nome.get(nome)!r}, "
                    f"attuale {sha!r}): l'artefatto è vecchio, va rifatto."
                )
    return prov


def chiave_cache(path, **extra) -> str:
    """Chiave di cache: la provenienza se c'è, altrimenti lo sha del file, più i parametri locali.

    File assente -> ``""``, lo stesso contratto di ``canon.sha_file``: chi chiama sa già che senza
    artefatto non c'è cache, e non serve un'eccezione per un caso che il chiamante tratta.
    """
    p = Path(path)
    if not p.exists():
        return ""
    _, prov = leggi(p)
    base = prov["sha256"] if prov else sha256_file(p)
    return base if not extra else f"{base}+{sha256_obj(extra)[:16]}"
