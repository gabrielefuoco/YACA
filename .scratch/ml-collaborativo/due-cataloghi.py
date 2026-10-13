"""due-cataloghi.py — I DUE CATALOGHI, VALUTATI SEPARATAMENTE.

Correzione dell'utente: su Stremio i cataloghi NON sono misti. Si restituiscono DUE cataloghi,
uno di film e uno di serie. Quindi la lista mista non esiste in produzione, e la "invasione del
medio" era un artefatto del mio metro.

Da qui la metrica giusta: il recall va misurato DENTRO il catalogo giusto.
  CATALOGO FILM    top-N fra i FILM        (gold = i film nascosti dell'utente)
  CATALOGO SERIE   top-N fra le SERIE      (gold = le serie nascoste dell'utente)

E il caso che piu' interessa -- suggerire serie a chi guarda film -- diventa misurabile:
  profilo di FILM  ->  catalogo SERIE

Bersaglio: le cronologie Trakt (.cache/trakt/users/), 370 utenti con i film e 400 con le serie,
ognuna con le date di visione. Questo e' il lato serie che mancava.
"""
import glob, json, pathlib, time
import numpy as np

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
TK = ROOT / ".cache" / "trakt" / "users"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


def leggi(percorso, chiave):
    """cronologia Trakt: lista di voci con plays, last_watched_at e l'oggetto movie/show"""
    try:
        d = json.loads(pathlib.Path(percorso).read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(d, list):
        return None
    out = []
    for v in d:
        o = v.get(chiave) or {}
        t = (o.get("ids") or {}).get("tmdb")
        if not t:
            continue
        out.append((int(t), str(v.get("last_watched_at") or ""), int(v.get("plays") or 0)))
    return out


UTENTI = {}
for f in sorted(glob.glob(str(TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    m = leggi(f, "movie")
    s = leggi(TK / f"show-{u}.json", "show")
    UTENTI[u] = {"film": m or [], "serie": s or []}

print(f"utenti Trakt: {len(UTENTI):,}")
con_film = sum(1 for u in UTENTI.values() if len(u["film"]) >= 20)
con_serie = sum(1 for u in UTENTI.values() if len(u["serie"]) >= 10)
entrambi = sum(1 for u in UTENTI.values() if len(u["film"]) >= 20 and len(u["serie"]) >= 10)
print(f"  con >=20 film: {con_film:,} · con >=10 serie: {con_serie:,} · con entrambi: {entrambi:,}")

# copertura: quanti id Trakt cadono nel catalogo?
for med, chiave in (("film", "film"), ("serie", "serie")):
    tot = tot_ok = 0
    dim = []
    for u in UTENTI.values():
        v = u[chiave]
        dim.append(len(v))
        for t, _, _ in v:
            tot += 1
            if f"{'movie' if med == 'film' else 'tv'}:{t}" in row_of:
                tot_ok += 1
    print(f"  {med}: {tot:,} voci · nel catalogo {tot_ok:,} ({100*tot_ok/max(tot,1):.1f}%) "
          f"· mediana per utente {int(np.median(dim))}")

# quante voci hanno una data?
for med, chiave in (("film", "film"), ("serie", "serie")):
    tot = datate = 0
    for u in UTENTI.values():
        for _, d, _ in u[chiave]:
            tot += 1
            if d:
                datate += 1
    print(f"  {med}: con data di visione {datate:,}/{tot:,} ({100*datate/max(tot,1):.1f}%)")

# esempio
u0 = max(UTENTI, key=lambda k: len(UTENTI[k]["serie"]))
print("")
print(f"esempio utente «{u0}»: {len(UTENTI[u0]['film'])} film · {len(UTENTI[u0]['serie'])} serie")
ss = sorted(UTENTI[u0]["serie"], key=lambda x: x[1])[-6:]
print("  ultime serie viste: " + " · ".join(f"{t}" for t, _, _ in ss))
print(f"\n({time.time()-t0:.0f}s)")
