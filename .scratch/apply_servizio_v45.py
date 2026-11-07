"""apply_servizio_v45.py — Aggiorna servizio.py rimuovendo V10 e passando interamente a V45."""
from pathlib import Path

p = Path("services/graph/servizio.py")
content = p.read_text(encoding="utf-8")

# 1. New esegui_richiesta
new_esegui_richiesta = '''def esegui_richiesta(dati: dict, engine: Engine | None = None) -> tuple[int, dict]:
    """Valida la richiesta e genera raccomandazioni usando l'Engine V45
    mantenendo la piena compatibilità con il contratto consumato dai client YACA."""
    if not isinstance(dati, dict):
        return 400, {"ok": False, "errore": "il corpo della richiesta deve essere un oggetto JSON"}

    if engine is None:
        try:
            engine = get_engine_v45()
        except Exception:
            return 503, {"ok": False, "errore": "motore non pronto o artefatto non caricato"}

    if engine is None or engine.Tr is None:
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

    validi_seeds = []
    da_catalogo = False
    recenti_count = 0
    semi_ids = []
    esclusi_semi = set()

    for s in semi_raw:
        if not isinstance(s, dict):
            continue
        tmdb_id = s.get("tmdbId") or s.get("tmdb_id")
        if tmdb_id is None:
            continue
        try:
            tmdb_id = int(tmdb_id)
        except (ValueError, TypeError):
            continue
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

    # Esecuzione Personalized PageRank su grafo V45
    racs = engine.raccomanda(validi_seeds, cap=cap * 2, medium=req_medium, esclusi=tutti_esclusi)

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
    return 200, risposta'''

start_marker = "def esegui_richiesta(dati: dict, motore: MO.Motore) -> tuple[int, dict]:"
end_marker = "    return 200, risposta\n\n\n# ==============================================================================\n# ROUTE /scaffali"

idx1 = content.find(start_marker)
idx2 = content.find(end_marker)

assert idx1 != -1, f"Start marker non trovato: {start_marker}"
assert idx2 != -1, f"End marker non trovato: {end_marker}"

idx2_cut = idx2 + len("    return 200, risposta")

content_new = content[:idx1] + new_esegui_richiesta + content[idx2_cut:]

# 2. Update ServizioHandler, crea_server, main
old_handler = '''class ServizioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    motore: MO.Motore = None
    health_payload: bytes = None
    engine_v45: Engine = None
    w_aff: sp.csr_matrix = None'''

new_handler = '''class ServizioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    health_payload: bytes = None
    engine_v45: Engine = None
    w_aff: sp.csr_matrix = None'''

content_new = content_new.replace(old_handler, new_handler)

# In do_POST:
content_new = content_new.replace(
    "status, resp = esegui_richiesta(dati, self.motore)",
    "status, resp = esegui_richiesta(dati, self.engine_v45)"
)

# In crea_server:
old_crea_server = '''def crea_server(host="0.0.0.0", port=7862, motore=None, carica_motore=True, engine_v45=None, w_aff=None):
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
    return server, motore'''

new_crea_server = '''def crea_server(host="0.0.0.0", port=7862, engine_v45=None, w_aff=None, carica_motore=True):
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
    return server, engine_v45'''

content_new = content_new.replace(old_crea_server, new_crea_server)

# In main():
old_main_part = '''    server, motore = crea_server(host=args.host, port=args.port)
    print(f"Servizio pronto in {time.time()-t0:.2f}s (artefatto: {motore.artefatto})", file=sys.stderr)'''

new_main_part = '''    server, engine_v45 = crea_server(host=args.host, port=args.port)
    art = engine_v45.artefatto if engine_v45 else "non caricato"
    print(f"Servizio pronto in {time.time()-t0:.2f}s (artefatto: {art})", file=sys.stderr)'''

content_new = content_new.replace(old_main_part, new_main_part)

p.write_text(content_new, encoding="utf-8")
print("services/graph/servizio.py aggiornato con successo!")
