"""merge-cura.py — unisce le curatele al dataset validato. Risolve gli 'add' per titolo,
verifica ogni id contro catalogo E grafo, e stampa tutto cio' che non torna."""
import json, pathlib, re, unicodedata, difflib
from collections import defaultdict, Counter
import numpy as np, pandas as pd
ROOT = pathlib.Path(".").resolve(); PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]"," ",s).split())
STOP = set("il lo la i gli le un uno una the a an of and der die das les el los de del della di".split())
def toks(s): return [t for t in norm(s).split() if t not in STOP]
def y4(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","release_date"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date"])
VOCI = []
for typ, rows in (("movie", mv), ("tv", tv)):
    tn, ten, dn = ("title","title_en","release_date") if typ=="movie" else ("name","name_en","first_air_date")
    for i, t, te, dt in zip(rows["id"], rows[tn], rows[ten], rows[dn]):
        k = f"{typ}:{int(i)}"; y = y4(dt)
        for t2 in {str(t), str(te or "")}:
            if t2 and t2 != "nan": VOCI.append((k, t2, y, typ, set(toks(t2))))
INV = defaultdict(list)
for idx, (k, t2, y, typ, ts) in enumerate(VOCI):
    for tk in ts: INV[tk].append(idx)
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
grafo = {f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])}
def risolvi(title, year, tipo, soglia=0.86):
    q = set(toks(title))
    if not q: return None, []
    cand = Counter()
    for tk in q:
        for idx in INV.get(tk, []): cand[idx] += 1
    best = []
    for idx, _ in cand.most_common(400):
        k, t2, y, typ, ts = VOCI[idx]
        if typ != tipo or abs(y - year) > 2: continue
        jac = len(q & ts) / max(1, len(q | ts))
        rat = difflib.SequenceMatcher(None, " ".join(sorted(q)), " ".join(sorted(ts))).ratio()
        best.append((0.6*jac + 0.4*rat, k, t2, y, jac))
    if not best: return None, []
    # ORDINE: punteggio, poi ANNO PIU' VICINO. Senza questo, 'Birdman' (2014) veniva risolto su
    # 'Birdman' (2015): stesso titolo, punteggio 1.00, e la regola del punteggio ignora l'anno.
    best.sort(key=lambda x: (-x[0], abs(x[3] - year), x[1]))
    top = best[:3]
    # La regola del punteggio deve essere ANNO-ESATTA: con la tolleranza di 2 anni 'Birdman'
    # (2014) finiva su 'Birdman' (2015) - stesso titolo, punteggio 1.00, film diverso.
    if top[0][0] >= soglia and abs(top[0][3] - year) == 0:
        return top[0][:4] + ("punteggio",), top
    for sc, k, t2, y, j1 in best[:20]:      # non solo i primi 3: il titolo lungo ha punteggio basso
        ts = set(toks(t2)); nt = norm(t2); nq = norm(title)
        if (nq.startswith(nt) or nt.startswith(nq)) and abs(y - year) == 0: return (sc,k,t2,y,"prefisso"), top
        if abs(y-year) == 0 and j1 >= 0.5 and abs(len(q)-len(ts)) <= 1: return (sc,k,t2,y,"parole"), top
        if ts and ts <= q and abs(y - year) == 0: return (sc,k,t2,y,"corto"), top
    return None, top
d = json.loads((G/"cross-pulito.json").read_text(encoding="utf-8"))
out = {s["id"]: {"id": s["id"], "titolo": s.get("titolo") or s.get("title"), "cluster": s.get("cluster"), "links": [dict(l) for l in s["links"]]} for s in d["sources"]}
print(f"dataset di partenza: {len(out)} sorgenti · {sum(len(v['links']) for v in out.values())} legami")
problemi = []
for bf in sorted(G.glob("cura-*.json")):
    b = json.loads(bf.read_text(encoding="utf-8"))
    print(f"\n{bf.name}: {len(b['sources'])} serie")
    nlink = nadd = 0
    for s in b["sources"]:
        sid = s["id"]
        if sid not in grafo: problemi.append(f"SORGENTE FUORI DAL GRAFO: {sid} {s['titolo']}"); continue
        cur = out.setdefault(sid, {"id": sid, "titolo": s["titolo"], "cluster": s.get("cluster","cura"), "links": []})
        visti = {l["id"] for l in cur["links"]}
        for spec in s.get("links", []):
            p = spec.split(":")
            if len(p) != 3: problemi.append(f"FORMATO: {spec} [{s['titolo']}]"); continue
            k, w = f"{p[0]}:{p[1]}", int(p[2])
            if k not in grafo: problemi.append(f"LINK FUORI DAL GRAFO: {k} [{s['titolo']}]"); continue
            if k == sid: problemi.append(f"AUTORIFERIMENTO: {sid}"); continue
            if k in visti: continue
            visti.add(k); cur["links"].append({"id": k, "type": k.split(":")[0], "w": w}); nlink += 1
        for spec in s.get("add", []):
            p = spec.split("|")
            if len(p) != 4: problemi.append(f"FORMATO ADD: {spec} [{s['titolo']}]"); continue
            tipo, titolo, anno, w = p[0], p[1], int(p[2]), int(p[3])
            r, top = risolvi(titolo, anno, tipo)
            if r and r[1] in grafo and r[1] != sid and r[1] not in visti:
                visti.add(r[1]); cur["links"].append({"id": r[1], "type": tipo, "w": w, "t": r[2], "y": r[3]}); nadd += 1
            elif r and r[1] in visti:
                pass   # duplicato: era gia' nella lista, va bene cosi'
            elif r and r[1] not in grafo:
                problemi.append(f"ADD risolto ma FUORI DAL GRAFO: '{titolo}' ({anno}) -> {r[2]} ({r[3]}) {r[1]} [{s['titolo']}]")
            else:
                alt = "  |  ".join(f"{t2} ({y}) {k} [{sc:.2f}]" for sc, k, t2, y, j1 in top[:3]) or "nessun candidato"
                problemi.append(f"ADD NON RISOLTO: '{titolo}' ({anno}) [{s['titolo']}]\n      vicini: {alt}")
    print(f"  id verificati: {nlink} · miei aggiunti risolti: {nadd}")
pulito = [v for v in out.values() if len(v["links"]) >= 3]
P = G/"cross-merged.json"
P.write_text(json.dumps({"sources": pulito}, ensure_ascii=False, indent=1), encoding="utf-8")
nl = sum(len(v["links"]) for v in pulito)
cross = sum(1 for v in pulito for l in v["links"] if l["type"] != v["id"].split(":")[0])
bers = Counter(l["id"] for v in pulito for l in v["links"])
print(f"\n=== DATASET UNITO ===")
print(f"sorgenti: {len(pulito)} · legami: {nl} · bersagli distinti: {len(bers):,}")
print(f"cross-medium: {cross} ({100*cross/max(1,nl):.1f}%) · ripetizione {nl/max(1,len(bers)):.2f}x")
print(f"\nPROBLEMI ({len(problemi)}):")
for p in problemi[:40]: print("  ! " + p)
if len(problemi) > 40: print(f"  ... e altri {len(problemi)-40}")
print(f"\nfile: {P}")
