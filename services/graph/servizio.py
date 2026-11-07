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
from graph.runtime import Engine

# NOTA: motore.py (il motore denso V10) non è più importato né utilizzato da questo servizio,
# che ora serve esclusivamente il runtime sparso V45 (graph.runtime.Engine).
# motore.py è conservato sul disco per compatibilità con script esterni offline.


_UNSET = object()


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
        except Exception:
            return 503, {"ok": False, "errore": "motore non pronto o artefatto non caricato"}

    if engine is None or getattr(engine, "Tr", None) is None:
        return 503, {"ok": False, "errore": "motore non pronto o artefatto non caricato"}

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
# ROUTE /scaffali — MOTORE V45 E TOP-100 VICINI (Ticket 08)
# ==============================================================================

TRANSIZIONE_PATH: str | Path | None = os.environ.get("V45_TRANSIZIONE_PATH")
VICINI_PATH: str | Path | None = os.environ.get("V45_VICINI_PATH")

_ENGINE_V45: Engine | None = None
_W_AFF: sp.csr_matrix | None = None

ALLOWED_SEED_KEYS: frozenset[str] = frozenset({
    "key", "tmdbId", "tmdb_id", "medium", "plays", "frazione",
    "tipo", "tipi", "eta_giorni", "watched", "library_only"
})


def get_engine_v45(path: str | Path | None = None) -> Engine:
    """Ritorna l'istanza singleton di Engine V45, caricata lazily."""
    global _ENGINE_V45
    target = path or TRANSIZIONE_PATH or os.environ.get("V45_TRANSIZIONE_PATH")
    if _ENGINE_V45 is None or (target is not None and getattr(_ENGINE_V45, "percorso", None) != str(target)):
        _ENGINE_V45 = Engine.carica_transizione(target)
    return _ENGINE_V45


def get_vicini_affinita(path: str | Path | None = None) -> sp.csr_matrix:
    """Ritorna la matrice singleton top-100 vicini non potati per l'affinità."""
    global _W_AFF
    target = path or VICINI_PATH or os.environ.get("V45_VICINI_PATH")
    if _W_AFF is None:
        _W_AFF = I.carica_matrice_affinita(target)
    return _W_AFF


def reset_singletons_v45() -> None:
    """Reset dei singleton V45 per i test."""
    global _ENGINE_V45, _W_AFF
    _ENGINE_V45 = None
    _W_AFF = None


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

    # Risoluzione lazy degli artefatti V45
    if engine is None or W_aff is None:
        try:
            if engine is None:
                engine = get_engine_v45()
            if W_aff is None:
                W_aff = get_vicini_affinita()
        except FileNotFoundError as exc:
            return 503, {
                "ok": False,
                "errore": f"artefatto mancante o non caricato: {exc}",
            }
        except Exception as exc:
            return 503, {
                "ok": False,
                "errore": f"motore V45 o vicini non pronti: {exc}",
            }

    if engine is None or engine.Tr is None or W_aff is None:
        return 503, {"ok": False, "errore": "motore V45 o vicini non pronti o artefatti non caricati"}

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

        eta = float(s.get("eta_giorni", idx))

        seme_prep = {
            "key": k,
            "plays": p_calc,
            "eta_giorni": eta,
        }
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
                "eta_giorni": float(sr["eta_giorni"]),
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
            "nome_fonte": str(sh.nome_fonte),
            "confidenza": round(float(sh.confidenza), 3),
            "medium": str(sh.medium),
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
            if self.health_payload is None:
                self.send_response(503)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                self.wfile.write(b'{"ok":false,"errore":"motore non pronto o artefatto non caricato"}')
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(self.health_payload)))
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(self.health_payload)
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
    if engine_v45 is None and carica_motore:
        try:
            engine_v45 = get_engine_v45()
        except Exception:
            engine_v45 = None

    if w_aff is None and carica_motore:
        try:
            w_aff = get_vicini_affinita()
        except Exception:
            w_aff = None

    health_payload = {
        "ok": True,
        "contratto": 1,
    }
    if engine_v45 is not None:
        health_payload["versioni"] = {
            "artefatto": engine_v45.artefatto,
            "ricetta": P.impronta()
        }
    health_bytes = json.dumps(health_payload).encode("utf-8")

    class HandlerWithEngine(ServizioHandler):
        pass

    HandlerWithEngine.health_payload = health_bytes
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
