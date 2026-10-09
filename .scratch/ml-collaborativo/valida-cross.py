"""valida-cross.py — VALIDAZIONE v2: risolutore serio + doppio controllo (catalogo E grafo).
Accetta solo corrispondenze ad alta confidenza; per il resto mostra i 3 candidati piu' vicini,
cosi' la decisione e' mia e non del matcher."""
import json, pathlib, re, unicodedata, difflib
from collections import defaultdict, Counter
import numpy as np, pandas as pd
ROOT = pathlib.Path(".").resolve(); PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]"," ",s).split())
STOP = set("il lo la i gli le un uno una the a an of and der die das les el los de del della di".split())
def toks(s): return [t for t in norm(s).split() if t not in STOP]
def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","release_date"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date"])
VOCI = []           # (key, titolo_catalogo, anno, tipo)
for typ, rows in (("movie", mv), ("tv", tv)):
    tn, ten, dn = ("title","title_en","release_date") if typ=="movie" else ("name","name_en","first_air_date")
    for i, t, te, dt in zip(rows["id"], rows[tn], rows[ten], rows[dn]):
        k = f"{typ}:{int(i)}"; y = yr(dt)
        for t2 in {str(t), str(te or "")}:
            if t2 and t2 != "nan": VOCI.append((k, t2, y, typ, set(toks(t2))))
INV = defaultdict(list)
for idx, (k, t2, y, typ, ts) in enumerate(VOCI):
    for tk in ts: INV[tk].append(idx)
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
grafo = {f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])}
def risolvi(title, year, tipo, soglia=0.86):
    q = set(toks(title))
    if not q: return None
    cand = Counter()
    for tk in q:
        for idx in INV.get(tk, []): cand[idx] += 1
    # ripiego: i titoli che condividono una parola iniziale (per i refusi)
    if not cand:
        for tk in q:
            for idx in INV.get(tk[:4], []): cand[idx] += 1
    best = []
    for idx, _ in cand.most_common(400):
        k, t2, y, typ, ts = VOCI[idx]
        if typ != tipo: continue
        if abs(y - year) > 2: continue
        jac = len(q & ts) / max(1, len(q | ts))
        rat = difflib.SequenceMatcher(None, " ".join(sorted(q)), " ".join(sorted(ts))).ratio()
        best.append((0.6 * jac + 0.4 * rat, k, t2, y, jac, rat))
    if not best: return None, []
    best.sort(reverse=True)
    top = best[:3]
    if top[0][0] >= soglia: return (top[0][0], top[0][1], top[0][2], top[0][3], "punteggio"), top
    # REGOLA DI CONTENIMENTO: il titolo scritto da me deve essere CONTENUTO in quello del catalogo
    # ("Looper" dentro "Looper - In fuga dal passato" -> si'; "Children of Men" dentro "The Children" -> no).
    # Non indovina: o le mie parole ci sono tutte, o non si accetta.
    for sc, k, t2, y, j1, j2 in top:
        ts = set(toks(t2)); nt = norm(t2); nq = norm(title)
        if q and q <= ts and abs(y - year) <= 1:
            return (sc, k, t2, y, "contenuto"), top
        # PREFISSO: i titoli italiani sono "Inglese - Italiano" -> uno e' prefisso dell'altro
        if (nq.startswith(nt) or nt.startswith(nq)) and abs(y - year) <= 1 and len(ts) >= 1:
            return (sc, k, t2, y, "prefisso"), top
        # SOVRAPPOSIZIONE: per i titoli tradotti parola per parola ("Being" -> "Essere")
        if abs(y - year) == 0 and j1 >= 0.5 and abs(len(q) - len(ts)) <= 1:
            return (sc, k, t2, y, "parole"), top
        # CONTENIMENTO INVERSO + ANNO ESATTO: il titolo del catalogo e' piu' corto del mio
        # ("Veep" dentro "Veep - Vicepresidente inqualificabile"). L'anno ESATTO e' la garanzia:
        # "The Children" (2008) non puo' passare per "Children of Men" (2006).
        if ts and ts <= q and abs(y - year) == 0:
            return (sc, k, t2, y, "corto"), top
    return None, top
gold = []
for fn in ("cross-1.json", "cross-2.json"):
    p = ROOT/".scratch"/"ml-collaborativo"/"gold"/fn
    if p.exists(): gold += json.loads(p.read_text(encoding="utf-8"))["cluster"]
print(f"cluster {len(gold)} · sorgenti {sum(len(c['sources']) for c in gold)} · legami {sum(len(s['links']) for c in gold for s in c['sources'])} · voci catalogo {len(VOCI):,} · grafo {len(grafo):,}")
ok_s = ok_l = 0; dubbi = []; fuori = []; da_confermare = []
for c in gold:
    for s in c["sources"]:
        r, top = risolvi(s["title"], s["year"], "tv")
        if r and r[1] in grafo:
            ok_s += 1
            if r[4] in ("prefisso", "parole", "corto"): da_confermare.append(f"SORGENTE '{s['title']}' ({s['year']}) -> '{r[2]}' ({r[3]}) {r[1]} [{r[4]}]")
        else:
            alt = "  |  ".join(f"{t2} ({y}) {k} [{sc:.2f}]" for sc, k, t2, y, j1, j2 in top[:3])
            dubbi.append(f"SORGENTE '{s['title']}' ({s['year']}) [{c['nome']}] -> " + (f"risolta {r[2]} ({r[3]}) {r[1]} ma FUORI dal grafo" if r else "non risolta") + f"\n      vicini: {alt}")
        for l in s["links"]:
            r, top = risolvi(l["title"], l["year"], l.get("type", "movie"))
            if r and r[1] in grafo:
                ok_l += 1
                if r[4] in ("prefisso", "parole", "corto"): da_confermare.append(f"LINK '{l['title']}' ({l['year']}) -> '{r[2]}' ({r[3]}) {r[1]} [{r[4]}] [src {s['title']}]")
            else:
                alt = "  |  ".join(f"{t2} ({y}) {k} [{sc:.2f}]" for sc, k, t2, y, j1, j2 in top[:3])
                dubbi.append(f"LINK '{l['title']}' ({l['year']}) [src {s['title']}] -> " + (f"risolta {r[2]} ({r[3]}) {r[1]} ma FUORI dal grafo" if r else "non risolta") + f"\n      vicini: {alt}")
print(f"\nRISOLTI e nel grafo: sorgenti {ok_s} · legami {ok_l}")
print(f"DA SISTEMARE: {len(dubbi)}")
for d in dubbi[:45]: print("  ! " + d)
if len(dubbi) > 45: print(f"  ... e altri {len(dubbi)-45}")
out = ROOT/".scratch"/"ml-collaborativo"/"gold"/"cross-da-sistemare.txt"
out.write_text("\n".join(dubbi), encoding="utf-8")
print(f"\ntutti in {out}")


# ---- ESPORTA IL DATASET PULITO: solo id verificati contro catalogo E grafo ----
pulito = {"sources": []}
for c in gold:
    for s in c["sources"]:
        rs, _ = risolvi(s["title"], s["year"], "tv")
        if not rs or rs[1] not in grafo: continue
        links = []
        for l in s["links"]:
            rl, _ = risolvi(l["title"], l["year"], l.get("type", "movie"))
            if rl and rl[1] in grafo and rl[1] != rs[1]:
                links.append({"id": rl[1], "title": rl[2], "year": rl[3], "type": rl[1].split(":")[0], "w": l.get("w", 1)})
        if len(links) >= 3:
            pulito["sources"].append({"id": rs[1], "title": rs[2], "year": rs[3], "cluster": c["nome"], "links": links})
out = ROOT/".scratch"/"ml-collaborativo"/"gold"/"cross-pulito.json"
out.write_text(json.dumps(pulito, ensure_ascii=False, indent=1), encoding="utf-8")
ns = len(pulito["sources"]); nl = sum(len(x["links"]) for x in pulito["sources"])
bers = Counter(l["id"] for x in pulito["sources"] for l in x["links"])
cross = sum(1 for x in pulito["sources"] for l in x["links"] if l["type"] != x["id"].split(":")[0])
print("")
print("=== DATASET PULITO ===")
print(f"sorgenti: {ns} · legami: {nl} · titoli bersaglio distinti: {len(bers):,}")
print(f"legami film<->serie: {cross} ({100*cross/max(1,nl):.1f}%) · dentro lo stesso medium: {nl-cross}")
print(f"DOMANDA 2 (struttura): {nl} legami su {len(bers):,} titoli distinti -> ripetizione {nl/max(1,len(bers)):.2f}x")
print("i 12 film piu' riusati:", ", ".join(f"{k}({v})" for k, v in bers.most_common(12)))
print(f"file: {out}")
