"""04f-istruzioni.py — tre varianti per capire se il problema e' l'uso, non il modello.

qwen3-embedding e' **instruction-aware**: la sua scheda raccomanda un prefisso per le query, e un
modello instruction-tuned puo' comportarsi male su un compito simmetrico se usato come un embedder
generico. Tre prove, in ordine di costo:

  A. com'e' adesso: trama intera, nessuna istruzione
  B. con l'istruzione di Qwen3 per il retrieval
  C. con trama **accorciata** (i primi 300 caratteri: il cuore della sinossi, senza il finale)

E una quarta, che non e' un'istruzione ma un sospetto diverso: se il modello legge lo STILE delle
sinossi TMDB invece del contenuto, allora due trame di lunghezza simile dovrebbero somigliarsi **per
la lunghezza**. Si misura anche quella: la correlazione fra |lunghezza_a - lunghezza_b| e il coseno.
Se e' alta, il modello sta misurando il formato.
"""
import json, sys, time, urllib.request
import numpy as np, pandas as pd, pathlib

sys.path.insert(0, ".scratch/bolle-nitrile")
PQ = pathlib.Path(".cache/tmdb")
TRAME = {}
for f in ("movies.parquet", "tv.parquet"):
    d = pd.read_parquet(PQ / f, columns=["id", "overview"])
    for r in d.itertuples(index=False):
        o = str(r.overview or "").strip()
        if len(o) > 40:
            TRAME[int(r.id)] = o

COPPIE = [
    (862, 863, True), (862, 1084244, True), (129, 4935, True), (238, 240, True), (680, 240, True),
    (550, 11324, True), (27205, 157336, True), (11324, 210577, True), (807, 274, True),
    (12, 863, True), (585, 12, True),
    (862, 27205, False), (862, 550, False), (863, 274, False), (585, 680, False), (12, 11324, False),
    (238, 862, False), (129, 274, False), (680, 863, False), (4935, 807, False),
]
coppie = [(a, b, at) for a, b, at in COPPIE if a in TRAME and b in TRAME]

ISTR = ("Instruct: Date due trame di film, valuta quanto raccontano la stessa storia.\n"
        "Query: ")


def embed(modello, testi):
    corpo = json.dumps({"model": modello, "input": testi}).encode()
    req = urllib.request.Request("http://localhost:11434/api/embed", data=corpo,
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return np.array(json.loads(r.read())["embeddings"], dtype=np.float32)


def misura(modello, nome, prepara):
    testi = [prepara(TRAME[a]) for a, b, at in coppie] + [prepara(TRAME[b]) for a, b, at in coppie]
    E = embed(modello, testi)
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    n = len(coppie)
    cos = [float(E[k] @ E[n + k]) for k in range(n)]
    sim = [c for c, (a, b, at) in zip(cos, coppie) if at]
    div = [c for c, (a, b, at) in zip(cos, coppie) if not at]
    # la correlazione col disallineamento di LUNGHEZZA: se e' alta, il modello misura il formato
    lung = np.array([len(prepara(TRAME[a])) - len(prepara(TRAME[b])) for a, b, at in coppie], float)
    r_lun = float(np.corrcoef(np.abs(lung), cos)[0, 1])
    print(f"\n  {nome}")
    print(f"     simili {np.mean(sim):+.3f} (min {min(sim):+.3f}) · diverse {np.mean(div):+.3f} "
          f"(max {max(div):+.3f}) · separazione {np.mean(sim)-np.mean(div):+.3f}")
    print(f"     {'SEPARA' if min(sim) > max(div) else 'NON separa'} · "
          f"correlazione coseno/|Δlunghezza| {r_lun:+.3f}")
    k = coppie.index((862, 863, True))
    print(f"     il controllo Toy Story / Toy Story 2: {cos[k]:+.3f}")
    return min(sim) > max(div), r_lun


if __name__ == "__main__":
    mod = sys.argv[1] if len(sys.argv) > 1 else "qwen3-embedding:0.6b"
    varianti = [
        ("A. trama intera, nessuna istruzione", lambda t: t),
        ("B. con l'istruzione di Qwen3", lambda t: ISTR + t),
        ("C. primi 300 caratteri", lambda t: t[:300]),
    ]
    for nome, prep in varianti:
        try:
            misura(mod, nome, prep)
        except Exception as e:
            print(f"  {nome}: {type(e).__name__}: {str(e)[:100]}")
