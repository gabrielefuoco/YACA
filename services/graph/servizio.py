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
from graph import bubbles as B
from graph import interessi as I
from graph import motore as MO
from graph import parametri as P
from graph.runtime import Engine


def _statistiche_riga(motore: MO.Motore, titoli: list, li: dict):
    """Le statistiche comuni alle righe «parziali»: attivazione, mediana voti, quota serie,
    riga corta, target. Servivano identiche a classici, nicchia e ultime visioni."""
    att = round(float(np.mean([t["punteggio"] for t in titoli])), 4) if titoli else 0.0
    med_v = round(float(np.median([motore.VOT[B.ROW_OF[f"{'tv' if t['medium']=='series' else 'movie'}:{t['tmdbId']}"]] for t in titoli])), 1) if titoli else 0.0
    q_ser = round(float(sum(1 for t in titoli if t["medium"] == "series") / len(titoli)), 2) if titoli else 0.0
    corta = li.get("corta", len(titoli) < 20)
    target = li.get("target_dimensione", 20)
    return att, med_v, q_ser, corta, target


def esegui_richiesta(dati: dict, motore: MO.Motore) -> tuple[int, dict]:
    """Valida la richiesta e la mappa sul motore secondo il contratto del 17/10/2026."""
    if not isinstance(dati, dict):
        return 400, {"ok": False, "errore": "il corpo della richiesta deve essere un oggetto JSON"}
    if motore is None:
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

    cap_val = dati.get("cap", 60)
    try:
        cap = int(cap_val)
        if cap < 1:
            cap = 60
    except (ValueError, TypeError):
        return 400, {"ok": False, "errore": "il campo 'cap' deve essere un intero positivo"}

    storia = []
    for s in semi_raw:
        if not isinstance(s, dict):
            continue
        tmdb_id = s.get("tmdbId")
        if tmdb_id is None:
            continue
        try:
            tmdb_id = int(tmdb_id)
        except (ValueError, TypeError):
            continue
        m = s.get("medium", "")
        if m in ("series", "tv"):
            ch = f"tv:{tmdb_id}"
        elif m == "movie":
            ch = f"movie:{tmdb_id}"
        else:
            continue
        tp = s.get("tipo")
        if not tp and isinstance(s.get("peso"), str):
            tp = s.get("peso")
        if not tp:
            tp = "watched"
        ps = s.get("peso")
        if isinstance(ps, (int, float)):
            ps = float(ps)
        else:
            ps = None
        storia.append((ch, 1, tp, ps, bool(s.get("recente", False))))

    # Caso normale: storia vuota o tutti i semi fuori dal canone -> 200 con liste vuote e motivo
    validi = [voce[0] for voce in storia if voce[0] in B.ROW_OF]
    if not validi:
        return 200, {
            "contratto": 1,
            "versioni": {"artefatto": motore.artefatto, "ricetta": P.impronta()},
            "semi": {"n": 0, "da_catalogo": False, "recenti": 0},
            "liste": [],
            "motivi": ["storia fuori dal canone"]
        }

    # TICKET 22: le righe che hanno un catalogo servito per questo profilo/media. Il waterfall deduce solo
    # fra quelle (`None` = tutte, il §9.1 puro). Una lista vuota e' "nessuna riga servita": non e' "tutte".
    servite = None
    if isinstance(opzioni, dict) and "righe_servite" in opzioni:
        grezzo = opzioni.get("righe_servite")
        if not isinstance(grezzo, list) or not all(isinstance(x, str) for x in grezzo):
            return 400, {"ok": False, "errore": "il campo 'righe_servite' deve essere una lista di stringhe"}
        servite = list(dict.fromkeys(grezzo))

    # TICKET 12: i filtri a monte (anime/kids) si applicano ai candidati, prima del taglio delle card.
    filtri = {}
    if isinstance(opzioni, dict) and opzioni.get("filtri") is not None:
        grezzo = opzioni.get("filtri")
        if not isinstance(grezzo, dict):
            return 400, {"ok": False, "errore": "il campo 'filtri' deve essere un oggetto"}
        anime = grezzo.get("anime")
        if anime is not None and anime not in ("only", "exclude"):
            return 400, {"ok": False, "errore": "filtri.anime deve essere 'only' o 'exclude'"}
        filtri = {"anime": anime, "kids": bool(grezzo.get("kids"))}
    dichiarazione_filtri = motore.filtri_a_monte(anime=filtri.get("anime"), kids=filtri.get("kids", False))

    esito = motore.lista(storia, slider=opzioni, cap=cap, medium=req_medium, servite=servite)
    if esito.get("errore"):
        return 200, {
            "contratto": 1,
            "versioni": {"artefatto": motore.artefatto, "ricetta": P.impronta()},
            "semi": {"n": 0, "da_catalogo": False, "recenti": 0},
            "liste": [],
            "motivi": [esito["errore"]]
        }

    att_mondi = {int(m["bolla"]): float(m["attivazione"]) for m in esito.get("mondi", [])}
    primo_mondo = esito["mondi"][0]["bolla"] if esito.get("mondi") else None

    contratto_liste = []
    # I motivi del motore (es. «nessun filone sopra le soglie») si aggiungono a quelli delle righe vuote.
    motivi = list(esito.get("motivi") or [])

    for li in esito.get("liste", []):
        ruolo = li["tipo"]
        mondo = li["mondo"]
        titoli_raw = li.get("titoli", [])

        # Invariante del cantiere: nessuna riga esce vuota in silenzio.
        # Una lista vuota viene comunque restituita al chiamante, con la ragione
        # esplicita, invece di essere soppressa (origine del bug uscite_nuove).
        if not titoli_raw:
            # Il motivo puo' venire dal motore (es. «meno di 3 semi recenti», Ticket 07): si riporta,
            # invece di sostituirlo con quello generico.
            motivo = li.get("motivo") or f"{ruolo}: nessun titolo trovato"
            motivi.append(motivo)
            lista_out = {
                "ruolo": ruolo,
                "mondo": li.get("mondo"),
                "descrizione": motivo,
                "attivazione": 0.0,
                "mediana_voti": 0.0,
                "quota_serie": 0.0,
                "semi": [],
                "titoli": [],
                "vuota": True,
                "motivo": motivo,
                "totale_sopravvissuti": int(li.get("totale_sopravvissuti", 0)),
                "target_dimensione": li.get("target_dimensione", 20),
            }
            # Anche una riga derivata VUOTA dichiara di essere parziale (prima non lo faceva): il
            # documento lo dice per tutti i `punti_incontro_*` e i `micro_cluster_*`.
            if ruolo in ("uscite_nuove", "nicchia_di_qualita", "classici_imperdibili", "ultime_visioni")                     or ruolo.startswith(("micro_cluster", "punti_incontro")):
                lista_out["parziale"] = True
            if li.get("corta", False):
                lista_out["corta"] = True
            if "semi_recenti" in li:
                # Campo strutturale, non solo il testo del motivo (Ticket 07).
                lista_out["semi_recenti"] = int(li["semi_recenti"])
            # Anche una riga di filone svuotata dal pavimento porta la sua identita' (Ticket 08).
            for campo in ("cluster_id", "quota_peso", "titoli_seme", "coppia_id", "fallback",
                      "fonte", "candidati", "nel_bacino", "scartati_pavimento",
                      "specificita", "doppioni_tolti", "waterfall_partecipa",
                      "diversita_rimandati", "duplicati_saga"):
                if campo in li:
                    lista_out[campo] = li[campo]
            contratto_liste.append(lista_out)
            continue

        titoli = []
        for ch, score in titoli_raw:
            typ, id_str = ch.split(":")
            med = "series" if typ == "tv" else "movie"
            titoli.append({
                "tmdbId": int(id_str),
                "medium": med,
                "punteggio": round(float(score), 6)
            })

        if ruolo == "il_tuo_mondo":
            b = mondo
            att = round(att_mondi.get(b, 0.0), 4) if b is not None else 0.0
            med_v = round(float(motore.VOTMED[b]), 1) if b is not None else 0.0
            q_ser = round(float(motore.QUOTA_TV[b]), 2) if b is not None else 0.0
            es = [str(motore.TIT[int(r_)]) for r_ in motore.MEMBRI[b][np.argsort(-motore.VOT[motore.MEMBRI[b]])][:3]] if b is not None else []
            mondi_coinvolti = [m["bolla"] for m in esito.get("mondi", [])]
            if len(mondi_coinvolti) > 1:
                desc = f"il tuo mondo ({b}) e i vicini ({', '.join(str(x) for x in mondi_coinvolti[1:])}) — {len(titoli)} titoli, voti mediani {med_v}" + (f" · es. {', '.join(es)}" if es else "") if b is not None else "il tuo mondo e i vicini"
            else:
                desc = f"mondo {b} — {motore.SZ[b]} titoli, voti mediani {med_v}" + (f" · es. {', '.join(es)}" if es else "") if b is not None else "il tuo mondo"
            semi_mondi_set = set(mondi_coinvolti)
            semi_ids = list(dict.fromkeys(
                int(ch.split(":")[1]) for ch, *_ in storia
                if ch in B.ROW_OF and int(motore.MEM[B.ROW_OF[ch]]) in semi_mondi_set
            ))
            parziale = False

        elif ruolo == "un_passo_fuori":
            vicini = [int(x) for x in motore.VICINI[primo_mondo] if x >= 0][:3] if primo_mondo is not None else []
            att = round(float(sum(att_mondi.get(v, 0.0) for v in vicini) / max(len(vicini), 1)), 4) if vicini else 0.0
            med_v = round(float(np.median([motore.VOTMED[v] for v in vicini])), 1) if vicini else 0.0
            q_ser = round(float(np.mean([motore.QUOTA_TV[v] for v in vicini])), 2) if vicini else 0.0
            desc = f"mondi vicini ({', '.join(str(v) for v in vicini)})" if vicini else "mondi vicini"
            vicini_set = set(vicini)
            semi_ids = list(dict.fromkeys(
                int(ch.split(":")[1]) for ch, *_ in storia
                if ch in B.ROW_OF and int(motore.MEM[B.ROW_OF[ch]]) in vicini_set
            ))
            parziale = False

        elif ruolo == "uscite_nuove":
            att = round(float(np.mean([t["punteggio"] for t in titoli])), 4)
            if "attivazione" in li:
                # Le uscite collocate hanno punteggi su un'altra scala (att * confidenza * qualita'):
                # l'attivazione della riga la manda il motore.
                att = float(li["attivazione"])
            # TICKET 10: le uscite collocate NON sono nodi del canone, quindi non hanno un VOT nel
            # grafo. La mediana si calcola su quelle che ce l'hanno (i titoli del canone storico);
            # se non ce n'e' nessuna resta 0.0 — non si inventa un voto.
            voti_nel_canone = [
                float(motore.VOT[B.ROW_OF[chiave]])
                for chiave in (f"{'tv' if t['medium'] == 'series' else 'movie'}:{t['tmdbId']}" for t in titoli)
                if chiave in B.ROW_OF
            ]
            med_v = round(float(np.median(voti_nel_canone)), 1) if voti_nel_canone else 0.0
            q_ser = round(float(sum(1 for t in titoli if t["medium"] == "series") / len(titoli)), 2)
            desc = f"uscite recenti ({P.USCITE_NUOVE_DAL}+) nei mondi accesi"
            semi_ids = []
            parziale = True

        elif ruolo == "classici_imperdibili":
            att, med_v, q_ser, corta, target = _statistiche_riga(motore, titoli, li)
            fb = li.get("fallback_v_mondo", False)
            dettagli = []
            if fb:
                dettagli.append("soglia assoluta di fallback")
            if corta:
                dettagli.append(f"riga corta: {len(titoli)}/{target} titoli")
            if dettagli:
                desc = f"classici imperdibili del tuo mondo ({' - '.join(dettagli)})"
            else:
                desc = "classici imperdibili del tuo mondo"
            semi_ids = []
            parziale = True

        elif ruolo == "ultime_visioni":
            att, med_v, q_ser, corta, target = _statistiche_riga(motore, titoli, li)
            n_rec = int(li.get("semi_recenti", 0))
            dettagli = [f"{n_rec} semi recenti"]
            if corta:
                dettagli.append(f"riga corta: {len(titoli)}/{target} titoli")
            desc = f"sul filo delle tue ultime visioni ({' · '.join(dettagli)})"
            semi_ids = list(dict.fromkeys(
                int(voce[0].split(":")[1]) for voce in storia
                if voce[4] and voce[0] in B.ROW_OF
            ))
            parziale = True

        elif ruolo.startswith("micro_cluster"):
            att, med_v, q_ser, corta, target = _statistiche_riga(motore, titoli, li)
            semi_parlanti = [str(t) for t in (li.get("titoli_seme") or [])]
            desc = ("Perché hai amato " + " e ".join(semi_parlanti)) if semi_parlanti else "un tuo filone"
            if corta:
                desc += f" (riga corta: {len(titoli)}/{target} titoli)"
            semi_ids = list(dict.fromkeys(
                int(ch.split(":")[1]) for ch in li.get("semi_chiavi", []) if ch in B.ROW_OF
            ))
            parziale = True

        elif ruolo.startswith("punti_incontro"):
            att, med_v, q_ser, corta, target = _statistiche_riga(motore, titoli, li)
            # Per un ponte la media dei punteggi geometrici (~1e-5) NON e' un'attivazione confrontabile:
            # il motore manda l'attivazione media dei due filoni, e si usa quella.
            if "attivazione" in li:
                att = float(li["attivazione"])
            semi_parlanti = [str(t) for t in (li.get("titoli_seme") or []) if t]
            if semi_parlanti:
                desc = "Tra " + " e ".join(f"«{t}»" for t in semi_parlanti)
            else:
                desc = "Tra due tuoi mondi lontani"
            if li.get("fallback"):
                desc += " · i tuoi due mondi più lontani"
            if corta:
                desc += f" (riga corta: {len(titoli)}/{target} titoli)"
            semi_ids = list(dict.fromkeys(
                int(ch.split(":")[1]) for ch in li.get("semi_chiavi", []) if ch in B.ROW_OF
            ))
            parziale = True

        elif ruolo == "nicchia_di_qualita":
            att, med_v, q_ser, corta, target = _statistiche_riga(motore, titoli, li)
            fb = li.get("fallback_v_mondo", False)
            dettagli = []
            if fb:
                dettagli.append("soglia assoluta di fallback")
            if corta:
                dettagli.append(f"riga corta: {len(titoli)}/{target} titoli")
            if dettagli:
                desc = f"titoli di alta qualità e bassa popolarità ({' · '.join(dettagli)})"
            else:
                desc = "titoli di alta qualità e bassa popolarità"
            semi_ids = []
            parziale = True

        else:
            b = mondo
            att = round(att_mondi.get(b, 0.0), 4) if b is not None else 0.0
            med_v = round(float(motore.VOTMED[b]), 1) if b is not None else 0.0
            q_ser = round(float(motore.QUOTA_TV[b]), 2) if b is not None else 0.0
            es = [str(motore.TIT[int(r_)]) for r_ in motore.MEMBRI[b][np.argsort(-motore.VOT[motore.MEMBRI[b]])][:3]] if b is not None else []
            desc = f"mondo {b} — {motore.SZ[b]} titoli, voti mediani {med_v}" + (f" · es. {', '.join(es)}" if es else "") if b is not None else f"mondo {b}"
            semi_ids = list(dict.fromkeys(
                int(ch.split(":")[1]) for ch, *_ in storia
                if ch in B.ROW_OF and int(motore.MEM[B.ROW_OF[ch]]) == b
            ))
            parziale = False

        lista_out = {
            "ruolo": ruolo,
            "mondo": mondo,
            "descrizione": desc,
            "attivazione": att,
            "mediana_voti": med_v,
            "quota_serie": q_ser,
            "semi": semi_ids,
            "titoli": titoli
        }
        if parziale:
            lista_out["parziale"] = True
        # L'identita' delle righe derivate viaggia col contratto: lo SLOT (`micro_cluster_1..3`,
        # `punti_incontro_1..3`) e' posizionale e cambia quando i pesi si incrociano, il filone no (08, 09).
        for campo in ("cluster_id", "quota_peso", "titoli_seme", "coppia_id", "fallback",
                      "fonte", "candidati", "nel_bacino", "scartati_pavimento",
                      "specificita", "doppioni_tolti", "waterfall_partecipa",
                      "diversita_rimandati", "duplicati_saga"):
            if campo in li:
                lista_out[campo] = li[campo]
        if li.get("corta", False) or (ruolo == "nicchia_di_qualita" and len(titoli) < 20):
            lista_out["corta"] = True
            lista_out["target_dimensione"] = li.get("target_dimensione", 20)
            lista_out["totale_sopravvissuti"] = li.get("totale_sopravvissuti", len(titoli))
        if li.get("fallback_v_mondo", False):
            lista_out["fallback_v_mondo"] = True
            lista_out["soglia_relativa"] = False
        if li.get("motivo"):
            # La riga corta lo dice al chiamante con il motivo che il motore ha calcolato (Ticket 07).
            lista_out["motivo"] = li["motivo"]
        if "semi_recenti" in li:
            lista_out["semi_recenti"] = int(li["semi_recenti"])

        contratto_liste.append(lista_out)

    risposta = {
        "contratto": 1,
        "versioni": esito["versioni"],
        "semi": esito["semi"],
        "liste": contratto_liste,
        "motivi": motivi
    }
    if dichiarazione_filtri.get("applicato"):
        # Quanti titoli la maschera non ha potuto giudicare (fuori dal canone: le uscite nuove).
        dichiarazione_filtri["non_giudicabili"] = int(getattr(motore, "filtri_non_giudicabili", 0))
    if dichiarazione_filtri.get("applicato") or dichiarazione_filtri.get("motivo"):
        # Ticket 12: si dichiara sempre com'e' andata — applicato, oppure inerte e perche'.
        risposta["filtri"] = dichiarazione_filtri
    fuori = getattr(motore, "waterfall_fuori", None)
    if servite is not None:
        # TICKET 22: si dichiara chi non ha partecipato al dedup (nessun catalogo servito).
        risposta["waterfall"] = {"servite": len(servite), "fuori": fuori or []}
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

    esclusi_raw = dati.get("esclusi")
    if esclusi_raw is not None:
        if not isinstance(esclusi_raw, list):
            return 400, {"ok": False, "errore": "il campo 'esclusi' deve essere una lista"}
        for it in esclusi_raw:
            if not isinstance(it, (str, int)):
                return 400, {"ok": False, "errore": "gli elementi di 'esclusi' devono essere stringhe o interi"}

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
            esclusi=esclusi_keys,
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
    motore: MO.Motore = None
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

            status, resp = esegui_richiesta(dati, self.motore)
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


def crea_server(host="0.0.0.0", port=7862, motore=None, carica_motore=True, engine_v45=None, w_aff=None):
    """Fabbrica del server HTTP con motore caricato."""
    if motore is None and carica_motore:
        try:
            motore = MO.Motore(silenzioso=True)
        except Exception:
            motore = None

    health_payload = {
        "ok": True,
        "contratto": 1,
    }
    if motore is not None:
        health_payload["versioni"] = {
            "artefatto": motore.artefatto,
            "ricetta": P.impronta()
        }
    health_bytes = json.dumps(health_payload).encode("utf-8")

    class HandlerWithMotore(ServizioHandler):
        pass

    HandlerWithMotore.motore = motore
    HandlerWithMotore.health_payload = health_bytes
    HandlerWithMotore.engine_v45 = engine_v45
    HandlerWithMotore.w_aff = w_aff

    server = HTTPServer((host, port), HandlerWithMotore)
    return server, motore


def main():
    parser = argparse.ArgumentParser(description="YACA Graph Engine Service")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "7862")))
    args = parser.parse_args()

    print(f"Avvio servizio grafo su {args.host}:{args.port}...", file=sys.stderr)
    t0 = time.time()
    server, motore = crea_server(host=args.host, port=args.port)
    print(f"Servizio pronto in {time.time()-t0:.2f}s (artefatto: {motore.artefatto})", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArresto del servizio.", file=sys.stderr)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
