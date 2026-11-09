"""servizio.py — Il motore diventa un servizio (Ticket 07).

Espone il contratto deciso in `.scratch/confini/contratto-motore.md`:
  - GET  /health      -> {"ok": true, "contratto": 1, "versioni": {artefatto, ricetta}} in <1 ms
  - POST /raccomanda  -> {"contratto": 1, "versioni": {...}, "semi": {...}, "liste": [...], "motivi": [...]}
  - POST /            -> alias di POST /raccomanda

Un solo processo, un solo worker: nessun sottoprocesso né thread pool.
"""
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import math
import os
import pathlib
from pathlib import Path
import sys
import time
from typing import Any

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import canon as K
from graph import parametri as P
from graph import interessi as I
from graph import assi as _assi
from graph import kids as _kids
from graph import provenance as _PV
from graph.runtime import Engine

CMD_RIGENERA_TRANSIZIONE: str = "PYTHONPATH=services python -m graph.runtime.prepara --pota 16"
CMD_RIGENERA_VICINI: str = "PYTHONPATH=services python -m graph.runtime.prepara --target vicini"
CMD_RIGENERA_ASSI: str = "PYTHONPATH=services python -m graph.assi --build"
CMD_RIGENERA_KW_TFIDF: str = "PYTHONPATH=. py .scratch/distillazione-grafo/tfidf-v2.py"
CMD_RIGENERA_BLACKLIST: str = _kids.CMD_RIGENERA_BLACKLIST

MSG_ERR_TRANSIZIONE: str = f"Artefatto transizione mancante: transizione-pota16.npz. Rigenerare con: {CMD_RIGENERA_TRANSIZIONE}"
MSG_ERR_VICINI: str = f"Artefatto vicini mancante: vicini-top100.npz. Rigenerare con: {CMD_RIGENERA_VICINI}"
MSG_ERR_ASSI: str = f"Artefatto assi mancante: assi-canone.npz. Rigenerare con: {CMD_RIGENERA_ASSI}"
MSG_WARN_KW_TFIDF: str = (
    "Artefatto tassonomia mancante (tfidf.npz / vocab.json): senza questo artefatto "
    "nessuno scaffale riceve un nome: tutti ricadono su “Perché hai visto”. "
    f"Rigenerare con: {CMD_RIGENERA_KW_TFIDF}"
)
MSG_ERR_BLACKLIST: str = _kids.MSG_ERR_BLACKLIST

# NOTA: motore.py (il motore denso V10) non è più importato né utilizzato da questo servizio,
# che ora serve esclusivamente il runtime sparso V45 (graph.runtime.Engine).
# motore.py è conservato sul disco per compatibilità con script esterni offline.


_UNSET = object()


def _estrai_kids_param(dati: dict, opzioni: dict | None = None) -> bool:
    """Estrae il flag booleano kids da dati o opzioni.

    Un valore assente o sconosciuto corrisponde a False (off).
    """
    kids_raw = dati.get("kids")
    if kids_raw is None and opzioni and isinstance(opzioni, dict):
        kids_raw = opzioni.get("kids")
        if kids_raw is None and isinstance(opzioni.get("filtri"), dict):
            kids_raw = opzioni["filtri"].get("kids")
    if kids_raw is None and isinstance(dati.get("filtri"), dict):
        kids_raw = dati["filtri"].get("kids")

    if isinstance(kids_raw, bool):
        return kids_raw
    if isinstance(kids_raw, str) and kids_raw.strip().lower() in ("true", "1", "yes"):
        return True
    return False


def esegui_richiesta(dati: dict, engine: Any = _UNSET, motore: Any = _UNSET) -> tuple[int, dict]:
    """Valida la richiesta e genera raccomandazioni usando l'Engine V45
    mantenendo la piena compatibilità con il contratto consumato dai client YACA."""
    if not isinstance(dati, dict):
        return 400, {"ok": False, "errore": "il corpo della richiesta deve essere un oggetto JSON"}

    if engine is _UNSET:
        engine = motore if motore is not _UNSET else _UNSET

    if engine is _UNSET:
        try:
            engine = get_engine_v45()
        except FileNotFoundError as exc:
            return 503, {"ok": False, "errore": str(exc)}
        except Exception:
            return 503, {"ok": False, "errore": MSG_ERR_TRANSIZIONE}

    if engine is None or getattr(engine, "Tr", None) is None:
        return 503, {"ok": False, "errore": MSG_ERR_TRANSIZIONE}

    semi_raw = dati.get("semi")
    if semi_raw is None or not isinstance(semi_raw, list):
        return 400, {"ok": False, "errore": "il campo 'semi' deve essere una lista"}

    req_medium = dati.get("medium")
    if req_medium is not None:
        if req_medium == "tv":
            req_medium = "series"
        elif req_medium not in ("movie", "series"):
            return 400, {"ok": False, "errore": f"medium non valido: {req_medium} (ammessi 'movie' o 'series')"}

    opzioni = dati.get("opzioni")
    if opzioni is not None and not isinstance(opzioni, dict):
        return 400, {"ok": False, "errore": "il campo 'opzioni' deve essere un oggetto"}

    tono_raw = dati.get("tono")
    if tono_raw is None and opzioni:
        tono_raw = opzioni.get("tono", opzioni.get("cozy"))
    if tono_raw is None:
        tono_raw = dati.get("cozy", 0.0)

    if isinstance(tono_raw, bool):
        return 400, {"ok": False, "errore": "il campo 'tono' deve essere un numero compreso tra -1.0 e 1.0"}
    try:
        tono = float(tono_raw)
        if math.isnan(tono) or tono < -1.0 or tono > 1.0:
            return 400, {"ok": False, "errore": "il campo 'tono' deve essere un numero compreso tra -1.0 e 1.0"}
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'tono' deve essere un numero compreso tra -1.0 e 1.0"}

    comp_raw = dati.get("complessita")
    if comp_raw is None and opzioni:
        comp_raw = opzioni.get("complessita")
    if comp_raw is None:
        comp_raw = 0.0

    if isinstance(comp_raw, bool):
        return 400, {"ok": False, "errore": "il campo 'complessita' deve essere un numero compreso tra -1.0 e 1.0"}
    try:
        complessita = float(comp_raw)
        if math.isnan(complessita) or complessita < -1.0 or complessita > 1.0:
            return 400, {"ok": False, "errore": "il campo 'complessita' deve essere un numero compreso tra -1.0 e 1.0"}
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'complessita' deve essere un numero compreso tra -1.0 e 1.0"}

    if abs(tono) > 1e-6 or abs(complessita) > 1e-6:
        try:
            get_assi_canone()
        except FileNotFoundError as exc:
            return 503, {"ok": False, "errore": str(exc)}
        except Exception:
            return 503, {"ok": False, "errore": MSG_ERR_ASSI}
        if getattr(engine, "assi_errore", None):
            return 503, {"ok": False, "errore": MSG_ERR_ASSI}

    kids = _estrai_kids_param(dati, opzioni)
    if kids:
        if getattr(engine, "kids_ok", None) is None:
            return 503, {"ok": False, "errore": getattr(engine, "kids_errore", None) or MSG_ERR_BLACKLIST}

    cap_val = dati.get("cap", 60)
    try:
        cap = int(cap_val)
        if cap < 1:
            cap = 60
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'cap' deve essere un intero positivo"}

    validi_seeds = []
    da_catalogo = False
    recenti_count = 0
    semi_ids = []
    esclusi_semi = set()

    for s in semi_raw:
        if not isinstance(s, dict):
            continue
        tmdb_id = s.get("tmdbId") or s.get("tmdb_id")
        med = s.get("medium", "")
        if tmdb_id is None and "key" in s and ":" in str(s["key"]):
            try:
                pref, id_str = str(s["key"]).split(":", 1)
                if pref in ("movie", "tv") and id_str.isdigit():
                    tmdb_id = int(id_str)
                    if not med:
                        med = "series" if pref == "tv" else "movie"
            except Exception:
                pass

        if tmdb_id is None:
            continue
        try:
            tmdb_id = int(tmdb_id)
        except (ValueError, TypeError):
            continue
        if not med:
            med = s.get("medium", "")
        if med in ("series", "tv"):
            ch = f"tv:{tmdb_id}"
        elif med == "movie":
            ch = f"movie:{tmdb_id}"
        else:
            continue

        if ch in engine.row_of:
            validi_seeds.append(s)
            semi_ids.append(tmdb_id)
            esclusi_semi.add(ch)
            if s.get("tipo") == "catalogo":
                da_catalogo = True
            if s.get("recente"):
                recenti_count += 1

    if not validi_seeds:
        return 200, {
            "contratto": 1,
            "versioni": {"artefatto": engine.artefatto, "ricetta": P.impronta()},
            "semi": {"n": 0, "da_catalogo": False, "recenti": 0},
            "liste": [],
            "motivi": ["storia fuori dal canone"]
        }

    esclusi_req = dati.get("esclusi", [])
    tutti_esclusi = set(esclusi_req) | esclusi_semi

    # Esecuzione Personalized PageRank su grafo V45 con eventuale filtro di retrieval tono/complessità
    racs = engine.raccomanda(
        validi_seeds,
        cap=cap * 2,
        medium=req_medium,
        esclusi=tutti_esclusi,
        tono=tono,
        complessita=complessita,
        kids=kids,
    )

    meta_vot = K.metadati().get("VOT")

    # Costruzione liste: 'il_tuo_mondo' (top cap) e 'un_passo_fuori' (secondo blocco)
    t_mondo = racs[:cap]
    titoli_mondo_out = [
        {"tmdbId": int(t["tmdbId"]), "medium": str(t["medium"]), "punteggio": round(float(t["punteggio"]), 6)}
        for t in t_mondo
    ]
    att_m = round(float(np.mean([t["punteggio"] for t in titoli_mondo_out])), 4) if titoli_mondo_out else 0.0
    voti_m = [float(meta_vot[engine.row_of[t["key"]]]) for t in t_mondo if t["key"] in engine.row_of] if meta_vot is not None else []
    med_v_m = round(float(np.median(voti_m)), 1) if voti_m else 0.0
    q_ser_m = round(float(sum(1 for t in titoli_mondo_out if t["medium"] == "series") / len(titoli_mondo_out)), 2) if titoli_mondo_out else 0.0

    lista_mondo = {
        "ruolo": "il_tuo_mondo",
        "mondo": None,
        "descrizione": f"il tuo mondo — {len(titoli_mondo_out)} titoli",
        "attivazione": att_m,
        "mediana_voti": med_v_m,
        "quota_serie": q_ser_m,
        "semi": list(dict.fromkeys(semi_ids)),
        "titoli": titoli_mondo_out,
    }

    t_passo = racs[cap:cap * 2]
    titoli_passo_out = [
        {"tmdbId": int(t["tmdbId"]), "medium": str(t["medium"]), "punteggio": round(float(t["punteggio"]), 6)}
        for t in t_passo
    ]
    att_p = round(float(np.mean([t["punteggio"] for t in titoli_passo_out])), 4) if titoli_passo_out else 0.0
    voti_p = [float(meta_vot[engine.row_of[t["key"]]]) for t in t_passo if t["key"] in engine.row_of] if meta_vot is not None else []
    med_v_p = round(float(np.median(voti_p)), 1) if voti_p else 0.0
    q_ser_p = round(float(sum(1 for t in titoli_passo_out if t["medium"] == "series") / len(titoli_passo_out)), 2) if titoli_passo_out else 0.0

    lista_passo = {
        "ruolo": "un_passo_fuori",
        "mondo": None,
        "descrizione": f"un passo fuori — {len(titoli_passo_out)} titoli",
        "attivazione": att_p,
        "mediana_voti": med_v_p,
        "quota_serie": q_ser_p,
        "semi": list(dict.fromkeys(semi_ids)),
        "titoli": titoli_passo_out,
    }

    risposta = {
        "contratto": 1,
        "versioni": {
            "artefatto": engine.artefatto,
            "ricetta": P.impronta(),
        },
        "semi": {
            "n": len(validi_seeds),
            "da_catalogo": da_catalogo,
            "recenti": recenti_count,
        },
        "liste": [lista_mondo, lista_passo],
        "motivi": [],
    }
    return 200, risposta


# ==============================================================================
# GESTIONE ARTEFATTI, SINGLETON E STATO DI SALUTE (Ticket Container & Health)
# ==============================================================================

TRANSIZIONE_PATH: str | Path | None = os.environ.get("V45_TRANSIZIONE_PATH")
VICINI_PATH: str | Path | None = os.environ.get("V45_VICINI_PATH")
ASSI_PATH: str | Path | None = os.environ.get("ASSI_CANONE_PATH")
KW_TFIDF_PATH: str | Path | None = os.environ.get("KW_TFIDF_DIR")
BLACKLIST_PATH: str | Path | None = os.environ.get("BLACKLIST_BAMBINI_PATH") or os.environ.get("BLACKLIST_PATH")

_ENGINE_V45: Engine | None = None
_W_AFF: sp.csr_matrix | None = None
_ASSI_CACHE: tuple[np.ndarray, np.ndarray] | None = None

ALLOWED_SEED_KEYS: frozenset[str] = frozenset({
    "key", "tmdbId", "tmdb_id", "medium", "plays", "frazione",
    "tipo", "tipi", "eta_giorni", "watched", "library_only"
})


def risolvi_percorso_transizione(path: str | Path | None = None) -> Path:
    target = path or TRANSIZIONE_PATH or os.environ.get("V45_TRANSIZIONE_PATH")
    if target is not None:
        return Path(target)
    cartella = Path(__file__).resolve().parent / "data" / "v45-transizione"
    return cartella / "transizione-pota16.npz"


def risolvi_percorso_vicini(path: str | Path | None = None) -> Path:
    target = path or VICINI_PATH or os.environ.get("V45_VICINI_PATH")
    if target is not None:
        return Path(target)
    cartella = Path(__file__).resolve().parent / "data" / "v45-vicini100"
    return cartella / "vicini-top100.npz"


def risolvi_percorso_assi(path: str | Path | None = None) -> Path:
    target = path or ASSI_PATH or os.environ.get("ASSI_CANONE_PATH")
    if target is not None:
        return Path(target)
    return _assi.percorso_artefatto()


def risolvi_percorso_kw_tfidf(path: str | Path | None = None) -> tuple[Path, Path]:
    target = path or KW_TFIDF_PATH or os.environ.get("KW_TFIDF_DIR")
    return I.percorso_kw_tfidf(target)


def risolvi_percorso_blacklist(path: str | Path | None = None) -> Path:
    target = path or BLACKLIST_PATH or os.environ.get("BLACKLIST_BAMBINI_PATH") or os.environ.get("BLACKLIST_PATH")
    return _kids.risolvi_percorso_blacklist(target)


def get_engine_v45(path: str | Path | None = None) -> Engine:
    """Ritorna l'istanza singleton di Engine V45, caricata lazily."""
    global _ENGINE_V45
    p = risolvi_percorso_transizione(path)
    if not p.is_file():
        raise FileNotFoundError(MSG_ERR_TRANSIZIONE)
    if _ENGINE_V45 is None or (path is not None and getattr(_ENGINE_V45, "percorso", None) != str(p)):
        try:
            _ENGINE_V45 = Engine.carica_transizione(p)
        except FileNotFoundError as exc:
            raise FileNotFoundError(MSG_ERR_TRANSIZIONE) from exc
    return _ENGINE_V45


def get_vicini_affinita(path: str | Path | None = None) -> sp.csr_matrix:
    """Ritorna la matrice singleton top-100 vicini non potati per l'affinità."""
    global _W_AFF
    p = risolvi_percorso_vicini(path)
    if not p.is_file():
        raise FileNotFoundError(MSG_ERR_VICINI)
    if _W_AFF is None:
        try:
            _W_AFF = I.carica_matrice_affinita(p)
        except FileNotFoundError as exc:
            raise FileNotFoundError(MSG_ERR_VICINI) from exc
    return _W_AFF


def get_assi_canone(path: str | Path | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Ritorna gli array (tono, complessita) dal singleton precalcolato."""
    global _ASSI_CACHE
    p = risolvi_percorso_assi(path)
    if not p.is_file():
        raise FileNotFoundError(MSG_ERR_ASSI)
    if _ASSI_CACHE is None or getattr(_assi, "_CACHED_PATH", None) != str(p):
        try:
            _ASSI_CACHE = _assi.carica_assi(p)
        except FileNotFoundError as exc:
            raise FileNotFoundError(MSG_ERR_ASSI) from exc
    return _ASSI_CACHE


def reset_singletons_v45() -> None:
    """Reset dei singleton V45 per i test."""
    global _ENGINE_V45, _W_AFF, _ASSI_CACHE
    _ENGINE_V45 = None
    _W_AFF = None
    _ASSI_CACHE = None
    _assi.reset_cache_assi()
    I.reset_cache_tfidf_keywords()
    _kids.reset_cache_kids()


def _estrai_sha_da_npz(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        z = np.load(path, allow_pickle=False)
        if "_provenance" in z.files:
            prov = json.loads(str(z["_provenance"]))
            sha = prov.get("sha256")
            if sha:
                return str(sha)[:16]
    except Exception:
        pass
    try:
        return _PV.sha256_file(path)[:16]
    except Exception:
        return None


def stato_artefatti(engine: Engine | None = None, w_aff: sp.csr_matrix | None = None) -> dict[str, dict[str, Any]]:
    """Ispeziona lo stato sul disco e in memoria di ciascun artefatto del motore."""
    # 1. Transizione
    p_trans = risolvi_percorso_transizione()
    pres_trans = p_trans.is_file()
    loaded_trans = (engine is not None and getattr(engine, "Tr", None) is not None) or (_ENGINE_V45 is not None and getattr(_ENGINE_V45, "Tr", None) is not None)
    sha_trans = None
    if engine is not None and getattr(engine, "prov", None):
        sha_trans = str(engine.prov.get("sha256", ""))[:16] or None
    elif _ENGINE_V45 is not None and getattr(_ENGINE_V45, "prov", None):
        sha_trans = str(_ENGINE_V45.prov.get("sha256", ""))[:16] or None
    elif pres_trans:
        sha_trans = _estrai_sha_da_npz(p_trans)

    # 2. Vicini top-100
    p_vicini = risolvi_percorso_vicini()
    pres_vicini = p_vicini.is_file()
    loaded_vicini = (w_aff is not None) or (_W_AFF is not None)
    sha_vicini = _estrai_sha_da_npz(p_vicini) if pres_vicini else None

    # 3. Assi tono/complessità
    p_assi = risolvi_percorso_assi()
    pres_assi = p_assi.is_file()
    loaded_assi = (_ASSI_CACHE is not None) or (_assi._CACHED_TONO is not None and _assi._CACHED_COMPLESSITA is not None)
    sha_assi = _estrai_sha_da_npz(p_assi) if pres_assi else None

    # 4. Grafo V45 grezzo (triangolo originale non potato)
    p_v45 = Path(__file__).resolve().parent / "data" / "v45" / "bolle-eterogeneo-V45-p1.0-triangolo.npz"
    pres_v45 = p_v45.is_file()
    sha_v45 = _estrai_sha_da_npz(p_v45) if pres_v45 else None

    # 5. Tassonomia (keyword TF-IDF)
    p_vocab, p_tfidf = risolvi_percorso_kw_tfidf()
    pres_tass = p_vocab.is_file() and p_tfidf.is_file()
    loaded_tass = (I._TFIDF_KW_CACHE is not None)
    sha_tass = _estrai_sha_da_npz(p_tfidf) if p_tfidf.is_file() else None

    # 6. Blacklist bambini
    p_bl = risolvi_percorso_blacklist()
    pres_bl = p_bl.is_file()
    loaded_bl = (engine is not None and getattr(engine, "kids_ok", None) is not None) or (_ENGINE_V45 is not None and getattr(_ENGINE_V45, "kids_ok", None) is not None)
    sha_bl = _kids.estrai_sha_blacklist(p_bl) if pres_bl else None

    return {
        "transizione": {
            "present": pres_trans,
            "path": str(p_trans).replace("\\", "/"),
            "sha": sha_trans,
            "provenance": sha_trans,
            "loaded": loaded_trans,
        },
        "vicini": {
            "present": pres_vicini,
            "path": str(p_vicini).replace("\\", "/"),
            "sha": sha_vicini,
            "provenance": sha_vicini,
            "loaded": loaded_vicini,
        },
        "assi": {
            "present": pres_assi,
            "path": str(p_assi).replace("\\", "/"),
            "sha": sha_assi,
            "provenance": sha_assi,
            "loaded": loaded_assi,
        },
        "tassonomia": {
            "present": pres_tass,
            "path": str(p_tfidf).replace("\\", "/"),
            "sha": sha_tass,
            "provenance": sha_tass,
            "loaded": loaded_tass,
            "vocab_path": str(p_vocab).replace("\\", "/"),
        },
        "blacklist": {
            "present": pres_bl,
            "path": str(p_bl).replace("\\", "/"),
            "sha": sha_bl,
            "provenance": sha_bl,
            "loaded": loaded_bl,
        },
        "grafo_v45": {
            "present": pres_v45,
            "path": str(p_v45).replace("\\", "/"),
            "sha": sha_v45,
            "provenance": sha_v45,
            "loaded": False,
            "note": "non letto a runtime (sostituito da transizione-pota16.npz e vicini-top100.npz)",
        },
    }


def costruisci_health_payload(engine: Engine | None = None, w_aff: sp.csr_matrix | None = None) -> dict[str, Any]:
    """Costruisce il payload esaustivo per GET /health preservando ok e versioni per i client."""
    arts = stato_artefatti(engine=engine, w_aff=w_aff)
    # È "ok" per il client se la transizione è presente e caricata (il core del motore risponde)
    is_ok = bool(arts["transizione"]["loaded"])

    art_nome = None
    if engine is not None and getattr(engine, "artefatto", None):
        art_nome = engine.artefatto
    elif _ENGINE_V45 is not None and getattr(_ENGINE_V45, "artefatto", None):
        art_nome = _ENGINE_V45.artefatto

    return {
        "ok": is_ok,
        "contratto": 1,
        "versioni": {
            "artefatto": art_nome,
            "ricetta": P.impronta(),
        },
        "artefatti": arts,
    }


def verifica_startup_e_avvertimenti(logger_fn=print) -> None:
    """Logga un warning a startup per ogni artefatto mancante, rendendo il guasto visibile in docker logs."""
    arts = stato_artefatti()
    if not arts["transizione"]["present"]:
        logger_fn(
            f"WARNING [startup]: {MSG_ERR_TRANSIZIONE} (percorso atteso: {arts['transizione']['path']})",
            file=sys.stderr,
        )
    if not arts["vicini"]["present"]:
        logger_fn(
            f"WARNING [startup]: {MSG_ERR_VICINI} (percorso atteso: {arts['vicini']['path']})",
            file=sys.stderr,
        )
    if not arts["assi"]["present"]:
        logger_fn(
            f"WARNING [startup]: {MSG_ERR_ASSI} (percorso atteso: {arts['assi']['path']})",
            file=sys.stderr,
        )
    if not arts["tassonomia"]["present"]:
        logger_fn(
            f"WARNING [startup]: {MSG_WARN_KW_TFIDF} (percorso atteso: {arts['tassonomia']['path']})",
            file=sys.stderr,
        )
    if not arts["blacklist"]["present"]:
        logger_fn(
            f"WARNING [startup]: {MSG_ERR_BLACKLIST} (percorso atteso: {arts['blacklist']['path']})",
            file=sys.stderr,
        )


def esegui_scaffali(
    dati: dict,
    engine: Engine | None = None,
    W_aff: sp.csr_matrix | None = None,
) -> tuple[int, dict]:
    """Valida la richiesta e genera gli scaffali usando l'Engine V45 e la matrice top-100 vicini."""
    if not isinstance(dati, dict):
        return 400, {"ok": False, "errore": "il corpo della richiesta deve essere un oggetto JSON"}

    semi_raw = dati.get("semi")
    if semi_raw is None or not isinstance(semi_raw, list):
        return 400, {"ok": False, "errore": "il campo 'semi' deve essere una lista"}

    req_medium = dati.get("medium")
    if req_medium is not None:
        if req_medium == "tv":
            req_medium = "series"
        elif req_medium not in ("movie", "series"):
            return 400, {"ok": False, "errore": f"medium non valido: {req_medium} (ammessi 'movie' o 'series')"}

    n_val = dati.get("n", 8)
    if isinstance(n_val, bool) or not isinstance(n_val, (int, float)):
        return 400, {"ok": False, "errore": "il campo 'n' deve essere un intero positivo"}
    try:
        n_scaffali = int(n_val)
        if n_scaffali < 1:
            return 400, {"ok": False, "errore": "il campo 'n' deve essere un intero positivo"}
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'n' deve essere un intero positivo"}

    cap_val = dati.get("cap", 60)
    if isinstance(cap_val, bool) or not isinstance(cap_val, (int, float)):
        return 400, {"ok": False, "errore": "il campo 'cap' deve essere un intero positivo"}
    try:
        cap_candidati = int(cap_val)
        if cap_candidati < 1:
            return 400, {"ok": False, "errore": "il campo 'cap' deve essere un intero positivo"}
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'cap' deve essere un intero positivo"}

    esclusi_raw = dati.get("esclusi")
    if esclusi_raw is not None:
        if not isinstance(esclusi_raw, list):
            return 400, {"ok": False, "errore": "il campo 'esclusi' deve essere una lista"}
        for it in esclusi_raw:
            if not isinstance(it, (str, int)):
                return 400, {"ok": False, "errore": "gli elementi di 'esclusi' devono essere stringhe o interi"}

    opzioni_scaffali = dati.get("opzioni")
    tono_raw = dati.get("tono")
    if tono_raw is None and isinstance(opzioni_scaffali, dict):
        tono_raw = opzioni_scaffali.get("tono", opzioni_scaffali.get("cozy"))
    if tono_raw is None:
        tono_raw = dati.get("cozy", 0.0)

    if isinstance(tono_raw, bool):
        return 400, {"ok": False, "errore": "il campo 'tono' deve essere un numero compreso tra -1.0 e 1.0"}
    try:
        tono = float(tono_raw)
        if math.isnan(tono) or tono < -1.0 or tono > 1.0:
            return 400, {"ok": False, "errore": "il campo 'tono' deve essere un numero compreso tra -1.0 e 1.0"}
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'tono' deve essere un numero compreso tra -1.0 e 1.0"}

    comp_raw = dati.get("complessita")
    if comp_raw is None and isinstance(opzioni_scaffali, dict):
        comp_raw = opzioni_scaffali.get("complessita")
    if comp_raw is None:
        comp_raw = 0.0

    if isinstance(comp_raw, bool):
        return 400, {"ok": False, "errore": "il campo 'complessita' deve essere un numero compreso tra -1.0 e 1.0"}
    try:
        complessita = float(comp_raw)
        if math.isnan(complessita) or complessita < -1.0 or complessita > 1.0:
            return 400, {"ok": False, "errore": "il campo 'complessita' deve essere un numero compreso tra -1.0 e 1.0"}
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'complessita' deve essere un numero compreso tra -1.0 e 1.0"}

    # 1. Verifica e risoluzione Engine (Transizione)
    if engine is None:
        try:
            engine = get_engine_v45()
        except FileNotFoundError as exc:
            return 503, {"ok": False, "errore": str(exc)}
        except Exception:
            return 503, {"ok": False, "errore": MSG_ERR_TRANSIZIONE}

    if engine is None or getattr(engine, "Tr", None) is None:
        return 503, {"ok": False, "errore": MSG_ERR_TRANSIZIONE}

    # 2. Verifica e risoluzione Matrice Vicini
    if W_aff is None:
        try:
            W_aff = get_vicini_affinita()
        except FileNotFoundError as exc:
            return 503, {"ok": False, "errore": str(exc)}
        except Exception:
            return 503, {"ok": False, "errore": MSG_ERR_VICINI}

    if W_aff is None:
        return 503, {"ok": False, "errore": MSG_ERR_VICINI}

    # 3. Verifica e risoluzione Assi (richiesti per /scaffali)
    try:
        get_assi_canone()
    except FileNotFoundError as exc:
        return 503, {"ok": False, "errore": str(exc)}
    except Exception:
        return 503, {"ok": False, "errore": MSG_ERR_ASSI}

    if getattr(engine, "assi_errore", None):
        return 503, {"ok": False, "errore": MSG_ERR_ASSI}

    kids = _estrai_kids_param(dati, opzioni_scaffali)
    if kids:
        if getattr(engine, "kids_ok", None) is None:
            return 503, {"ok": False, "errore": getattr(engine, "kids_errore", None) or MSG_ERR_BLACKLIST}

    # Caso speciale: lista semi vuota -> 200 con lista scaffali vuota
    if not semi_raw:
        return 200, {
            "ok": True,
            "contratto_versione": 2,
            "scaffali": [],
            "statistiche": {
                "semi_totali": 0,
                "semi_coperti": 0,
                "righe": 0,
            },
        }

    # Validazione rigorosa di ciascun seme (nessuna chiave sconosciuta tollerata)
    semi_preparati = []
    for idx, s in enumerate(semi_raw):
        if not isinstance(s, dict):
            return 400, {"ok": False, "errore": "ogni elemento di 'semi' deve essere un oggetto"}

        sconosciute = set(s.keys()) - ALLOWED_SEED_KEYS
        if sconosciute:
            chiave_ignota = sorted(sconosciute)[0]
            return 400, {"ok": False, "errore": f"chiave non riconosciuta nel seme: '{chiave_ignota}'"}

        k = s.get("key")
        tid = s.get("tmdbId") if "tmdbId" in s else s.get("tmdb_id")

        if not k and tid is None:
            return 400, {"ok": False, "errore": "ogni seme deve specificare 'key' o 'tmdbId'"}

        if k is not None:
            if not isinstance(k, str) or ":" not in k:
                return 400, {"ok": False, "errore": f"chiave seme non valida: {k!r}"}
            pref, id_str = k.split(":", 1)
            if pref not in ("movie", "tv") or not id_str.isdigit():
                return 400, {"ok": False, "errore": f"formato chiave seme non valido: {k!r} (atteso 'movie:<id>' o 'tv:<id>')"}

        if tid is not None:
            if isinstance(tid, bool):
                return 400, {"ok": False, "errore": f"tmdbId non valido: {tid!r}"}
            try:
                tid_int = int(tid)
                if tid_int < 0:
                    return 400, {"ok": False, "errore": f"tmdbId non valido: {tid!r}"}
            except (ValueError, TypeError):
                return 400, {"ok": False, "errore": f"tmdbId non valido: {tid!r}"}

            if not k:
                m_val = s.get("medium")
                if not m_val:
                    return 400, {"ok": False, "errore": "il campo 'medium' è obbligatorio quando si specifica 'tmdbId' senza 'key'"}
                if m_val == "tv":
                    m_val = "series"
                elif m_val not in ("movie", "series"):
                    return 400, {"ok": False, "errore": f"medium seme non valido: {m_val!r} (ammessi 'movie' o 'series')"}
                pref = "tv" if m_val == "series" else "movie"
                k = f"{pref}:{tid_int}"

        if "medium" in s:
            m_val = s["medium"]
            if m_val not in ("movie", "series", "tv"):
                return 400, {"ok": False, "errore": f"medium seme non valido: {m_val!r} (ammessi 'movie' o 'series')"}

        if "plays" in s:
            if isinstance(s["plays"], bool):
                return 400, {"ok": False, "errore": "il campo 'plays' deve essere un numero >= 0"}
            try:
                pl = float(s["plays"])
                if math.isnan(pl) or pl < 0:
                    return 400, {"ok": False, "errore": "il campo 'plays' deve essere un numero >= 0"}
            except (ValueError, TypeError):
                return 400, {"ok": False, "errore": "il campo 'plays' deve essere un numero >= 0"}

        if "frazione" in s:
            if isinstance(s["frazione"], bool):
                return 400, {"ok": False, "errore": "il campo 'frazione' deve essere compreso tra 0.0 e 1.0"}
            try:
                fr = float(s["frazione"])
                if math.isnan(fr) or fr < 0.0 or fr > 1.0:
                    return 400, {"ok": False, "errore": "il campo 'frazione' deve essere compreso tra 0.0 e 1.0"}
            except (ValueError, TypeError):
                return 400, {"ok": False, "errore": "il campo 'frazione' deve essere compreso tra 0.0 e 1.0"}

        if "eta_giorni" in s:
            if isinstance(s["eta_giorni"], bool):
                return 400, {"ok": False, "errore": "il campo 'eta_giorni' deve essere un numero >= 0"}
            try:
                eg = float(s["eta_giorni"])
                if math.isnan(eg) or eg < 0:
                    return 400, {"ok": False, "errore": "il campo 'eta_giorni' deve essere un numero >= 0"}
            except (ValueError, TypeError):
                return 400, {"ok": False, "errore": "il campo 'eta_giorni' deve essere un numero >= 0"}

        if "watched" in s and not isinstance(s["watched"], bool):
            return 400, {"ok": False, "errore": "il campo 'watched' deve essere un booleano"}

        if "library_only" in s and not isinstance(s["library_only"], bool):
            return 400, {"ok": False, "errore": "il campo 'library_only' deve essere un booleano"}

        if "tipo" in s and not isinstance(s["tipo"], str):
            return 400, {"ok": False, "errore": "il campo 'tipo' deve essere una stringa"}

        if "tipi" in s and not isinstance(s["tipi"], (list, str)):
            return 400, {"ok": False, "errore": "il campo 'tipi' deve essere una lista o stringa"}

        nep = 1.0
        r_idx = engine.row_of.get(k)
        if r_idx is not None and len(engine.nep) > r_idx:
            nep = float(engine.nep[r_idx])

        if "plays" in s:
            p_calc = float(s["plays"])
        elif "frazione" in s:
            p_calc = float(s["frazione"]) * nep
        else:
            p_calc = 1.0

        # Se l'età non arriva, NON si inventa: prima si usava l'indice del seme, e l'interfaccia
        # finiva per dire «oggi» su titoli visti anni fa. Assente è un'informazione, sbagliata no.
        eta = float(s["eta_giorni"]) if "eta_giorni" in s else float("nan")

        seme_prep = {
            "key": k,
            "plays": p_calc,
        }
        if not math.isnan(eta):
            seme_prep["eta_giorni"] = eta
        if "tipo" in s:
            seme_prep["tipo"] = s["tipo"]
        if "tipi" in s:
            seme_prep["tipi"] = s["tipi"]
        if "watched" in s:
            seme_prep["watched"] = s["watched"]
        if "library_only" in s:
            seme_prep["library_only"] = s["library_only"]

        semi_preparati.append(seme_prep)

    esclusi_keys = []
    if esclusi_raw:
        for it in esclusi_raw:
            if isinstance(it, int):
                esclusi_keys.append(f"movie:{it}")
                esclusi_keys.append(f"tv:{it}")
            else:
                esclusi_keys.append(str(it))

    try:
        shelves = I.scaffali(
            engine=engine,
            semi=semi_preparati,
            n=n_scaffali,
            medium=req_medium,
            W_aff=W_aff,
            cand_cap=cap_candidati,
            esclusi=esclusi_keys,
            tono=tono,
            complessita=complessita,
            kids=kids,
        )
    except Exception as exc:
        return 500, {"ok": False, "errore": f"errore durante la generazione degli scaffali: {exc}"}

    scaffali_out = []
    covered_seeds = set()
    for sh in shelves:
        covered_seeds.update(sh.seeds_indices)
        semi_rappresentativi_out = [
            {
                "titolo": str(sr["titolo"]),
                "anno": int(sr["anno"]),
                "tmdbId": int(sr["tmdbId"]),
                "plays": float(sr["plays"]),
                **({"eta_giorni": float(sr["eta_giorni"])}
                   if sr.get("eta_giorni") is not None and not math.isnan(float(sr["eta_giorni"]))
                   else {}),
            }
            for sr in sh.semi_rappresentativi
        ]
        semi_membri_out = [
            {
                "titolo": str(sm["titolo"]),
                "anno": int(sm["anno"]),
                "tmdbId": int(sm["tmdbId"]),
                "medium": str(sm.get("medium", "movie")),
            }
            for sm in sh.semi_membri
        ]
        titoli_out = [
            {
                "key": str(t["key"]),
                "tmdbId": int(t["tmdbId"]),
                "medium": str(t["medium"]),
                "punteggio": round(float(t["punteggio"]), 6),
            }
            for t in sh.titoli
        ]
        scaffali_out.append({
            "catalog_id": str(sh.catalog_id),
            "nome": str(sh.nome),
            "nome_display": str(getattr(sh, "nome_display", sh.nome)),
            "nome_fonte": str(sh.nome_fonte),
            "confidenza": round(float(sh.confidenza), 3),
            "medium": str(sh.medium),
            "anime": bool(getattr(sh, "anime", False)),
            "slot": int(sh.slot_position),
            "semi_rappresentativi": semi_rappresentativi_out,
            "semi_membri": semi_membri_out,
            "titoli": titoli_out,
        })

    risposta = {
        "ok": True,
        "contratto_versione": 2,
        "scaffali": scaffali_out,
        "statistiche": {
            "semi_totali": int(len(semi_raw)),
            "semi_coperti": int(len(covered_seeds)),
            "righe": int(len(scaffali_out)),
        },
    }
    return 200, risposta


class ServizioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    health_payload: bytes = None
    engine_v45: Engine = None
    w_aff: sp.csr_matrix = None

    def log_message(self, format, *args):
        # Silenzioso nei log standard
        pass

    def do_GET(self):
        if self.path == "/health":
            payload = costruisci_health_payload(self.engine_v45, self.w_aff)
            status = 200 if payload["ok"] else 503
            resp_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        self.send_response(404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(b'{"ok":false,"errore":"not found"}')

    def do_POST(self):
        if self.path in ("/", "/raccomanda"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                dati = json.loads(body.decode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "errore": f"richiesta malformata: {e}"}).encode("utf-8"))
                return

            status, resp = esegui_richiesta(dati, self.engine_v45)
            resp_bytes = json.dumps(resp, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if self.path == "/scaffali":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                dati = json.loads(body.decode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "errore": f"richiesta malformata: {e}"}).encode("utf-8"))
                return

            status, resp = esegui_scaffali(dati, engine=self.engine_v45, W_aff=self.w_aff)
            resp_bytes = json.dumps(resp, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        self.send_response(404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(b'{"ok":false,"errore":"not found"}')


def crea_server(host="0.0.0.0", port=7862, engine_v45=None, w_aff=None, carica_motore=True):
    """Fabbrica del server HTTP con motore V45 caricato."""
    # Warning visibili in docker logs a startup se manca qualche file
    verifica_startup_e_avvertimenti()

    if carica_motore:
        if engine_v45 is None:
            try:
                engine_v45 = get_engine_v45()
            except Exception:
                engine_v45 = None

        if w_aff is None:
            try:
                w_aff = get_vicini_affinita()
            except Exception:
                w_aff = None

        try:
            get_assi_canone()
        except Exception:
            pass

        try:
            I._carica_tfidf_keywords()
        except Exception:
            pass

    class HandlerWithEngine(ServizioHandler):
        pass

    HandlerWithEngine.engine_v45 = engine_v45
    HandlerWithEngine.w_aff = w_aff

    server = HTTPServer((host, port), HandlerWithEngine)
    return server, engine_v45


def main():
    parser = argparse.ArgumentParser(description="YACA Graph Engine Service")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "7862")))
    args = parser.parse_args()

    print(f"Avvio servizio grafo su {args.host}:{args.port}...", file=sys.stderr)
    t0 = time.time()
    server, engine_v45 = crea_server(host=args.host, port=args.port)
    art = engine_v45.artefatto if engine_v45 else "non caricato"
    print(f"Servizio pronto in {time.time()-t0:.2f}s (artefatto: {art})", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArresto del servizio.", file=sys.stderr)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
