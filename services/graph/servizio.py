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
import os
import pathlib
import sys
import time

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import motore as MO
from graph import parametri as P


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
        storia.append((ch, 1, tp, ps))

    # Caso normale: storia vuota o tutti i semi fuori dal canone -> 200 con liste vuote e motivo
    validi = [ch for ch, _, _, _ in storia if ch in B.ROW_OF]
    if not validi:
        return 200, {
            "contratto": 1,
            "versioni": {"artefatto": motore.artefatto, "ricetta": P.impronta()},
            "semi": {"n": 0, "da_catalogo": False},
            "liste": [],
            "motivi": ["storia fuori dal canone"]
        }

    esito = motore.lista(storia, slider=opzioni, cap=cap, medium=req_medium)
    if esito.get("errore"):
        return 200, {
            "contratto": 1,
            "versioni": {"artefatto": motore.artefatto, "ricetta": P.impronta()},
            "semi": {"n": 0, "da_catalogo": False},
            "liste": [],
            "motivi": [esito["errore"]]
        }

    att_mondi = {int(m["bolla"]): float(m["attivazione"]) for m in esito.get("mondi", [])}
    primo_mondo = esito["mondi"][0]["bolla"] if esito.get("mondi") else None

    contratto_liste = []
    motivi = []

    for li in esito.get("liste", []):
        ruolo = li["tipo"]
        mondo = li["mondo"]
        titoli_raw = li.get("titoli", [])

        if not titoli_raw:
            motivi.append(f"{ruolo}: nessun titolo trovato")
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
                int(ch.split(":")[1]) for ch, _, _, _ in storia
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
                int(ch.split(":")[1]) for ch, _, _, _ in storia
                if ch in B.ROW_OF and int(motore.MEM[B.ROW_OF[ch]]) in vicini_set
            ))
            parziale = False

        elif ruolo == "uscite_nuove":
            att = round(float(np.mean([t["punteggio"] for t in titoli])), 4)
            med_v = round(float(np.median([motore.VOT[B.ROW_OF[f"{'tv' if t['medium']=='series' else 'movie'}:{t['tmdbId']}"]] for t in titoli])), 1)
            q_ser = round(float(sum(1 for t in titoli if t["medium"] == "series") / len(titoli)), 2)
            desc = f"uscite recenti ({P.USCITE_NUOVE_DAL}+) nei mondi accesi"
            semi_ids = []
            parziale = True

        elif ruolo == "nicchia_di_qualita":
            att = round(float(np.mean([t["punteggio"] for t in titoli])), 4)
            med_v = round(float(np.median([motore.VOT[B.ROW_OF[f"{'tv' if t['medium']=='series' else 'movie'}:{t['tmdbId']}"]] for t in titoli])), 1)
            q_ser = round(float(sum(1 for t in titoli if t["medium"] == "series") / len(titoli)), 2)
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
                int(ch.split(":")[1]) for ch, _, _, _ in storia
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

        contratto_liste.append(lista_out)

    return 200, {
        "contratto": 1,
        "versioni": esito["versioni"],
        "semi": esito["semi"],
        "liste": contratto_liste,
        "motivi": motivi
    }


class ServizioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    motore: MO.Motore = None
    health_payload: bytes = None

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

        self.send_response(404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(b'{"ok":false,"errore":"not found"}')


def crea_server(host="0.0.0.0", port=7862, motore=None):
    """Fabbrica del server HTTP con motore caricato."""
    if motore is None:
        motore = MO.Motore(silenzioso=True)

    health_bytes = json.dumps({
        "ok": True,
        "contratto": 1,
        "versioni": {
            "artefatto": motore.artefatto,
            "ricetta": P.impronta()
        }
    }).encode("utf-8")

    class HandlerWithMotore(ServizioHandler):
        pass

    HandlerWithMotore.motore = motore
    HandlerWithMotore.health_payload = health_bytes

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
