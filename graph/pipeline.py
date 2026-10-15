"""pipeline.py — il comando unico del modulo. `python -m graph.pipeline <sottocomando>`

Perche' esiste: prima di oggi la pipeline erano cinque passi con dipendenze fra loro, sparsi in tre
cartelle di `.scratch/`, e l'ordine giusto lo sapeva solo chi l'aveva costruito. Ora c'e' un posto dove
guardare, e dei comandi che si possono lanciare.

    python -m graph.pipeline stato            cosa c'e', cosa manca, gli hash, l'inventario
    python -m graph.pipeline ricetta          i parametri con cui e' costruito tutto
    python -m graph.pipeline colloca FILE     colloca titoli nuovi da un JSON
    python -m graph.pipeline voti [SOGLIA]    la divisione per voti (dalla partizione base)
    python -m graph.pipeline pesanti          come rigenerare tutto, per ordine

`stato` e `colloca` e `voti` sono codice del modulo. `pesanti` non esegue nulla: stampa la sequenza
dei comandi, perche' quei passi durano minuti e vanno lanciati con gli occhi aperti.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

from . import canon as K

# ============================================================ LA RICETTA
# I parametri con cui e' costruito tutto quello che c'e' in `.cache/movielens`. Prima vivevano solo
# nel codice; qui sono leggibili.
RICETTA = {
    "embedding": {"modello": "qwen3-embedding:0.6b", "payload": "«titolo. trama»",
                  "via": "Ollama", "file": "04-trama-qwen3b.npy (35.829 x 1024)"},
    "componenti": {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1,
                   "COLL": 3, "LIST": 1, "TRAMA": 1,
                   "note": "KW con shrink e min_sim 0,12 · CAST con shrink e min_sim 0,02 · "
                           "DIR e PROD con shrink e min_sim 0,02"},
    "partizione": {"risoluzione": 200, "tipo": "RB", "passate": 6, "chiusura": "alpha0=0.1",
                   "consenso": "fattore 0.5+0.5*N_viste, penalita' 0.5 su KW/CAST soli",
                   "potatura": "nucleo di 4"},
    "divisione_voti": {"soglia_spread": 10.0, "min_membri": 15,
                       "misura": "p90/p10 dei voti dei membri"},
    "collocatore": {"macro": "V1 (04-tfidf, pesi grezzi)", "micro": "V3 (05-tfidf, pesi per tipo)",
                    "regola_voti": "fattore 10", "margine_medium": 1.0},
    # LE DIPENDENZE SONO LA PARTE CHE SI SBAGLIA. Due trappole vere, trovate sbagliando:
    "trappole": [
        "Il triangolo e' il grafo PRIMA di Leiden, quindi NON dipende dalla risoluzione: il file "
        "salvato come `r100` e' lo stesso da cui viene la partizione `r200`.",
        "I centroidi del collocatore sono costruiti su UNA partizione precisa (oggi V8). Le bolle non "
        "hanno id stabili fra partizioni: leggere i membri su un'altra partizione fa finire "
        "*Deadpool & Wolverine* tra i telefilm americani, senza nessun errore.",
    ],
}

# gli artefatti: nome -> (cosa contiene, chi lo produce, vivo o esperimento)
ARTEFATTI = [
    ("04-trama-qwen3b.npy", "gli embedding delle trame (35.829 x 1024)", "pipeline embeddare", "VIVO"),
    ("04-tfidf.npz", "il TF-IDF dei metadati, pesatura V1 (grezzа)", "features/04-centroidi", "VIVO"),
    ("05-tfidf.npz", "il TF-IDF dei metadati, pesatura V3 (per tipo)", "coerenza/05c", "VIVO"),
    ("eterogeneo-TRAMA.npz", "il componente di trama (1.648.356 archi)", "eterogeneo/01", "VIVO"),
    ("bolle-eterogeneo-V10-p1.0-triangolo.npz", "il grafo della miscela (6.626.837 archi)",
     "eterogeneo/02-v10", "VIVO"),
    ("bolle-eterogeneo-V10-p1.0-r200.npy", "la partizione base (2.838 bolle, mediana 16)",
     "eterogeneo/02-v10", "VIVO"),
    ("bolle-eterogeneo-subvoti.npy", "LA PARTIZIONE FINALE (3.497 bolle, dalla divisione per voti)",
     "eterogeneo/11", "VIVO"),
    ("bolle-nitrile-V8.npy", "la partizione su cui sono costruiti i centroidi del collocatore",
     "todo-grafo/02-v8", "VIVO (solo per i centroidi)"),
    ("bolle-nitrile-V8-triangolo.npz", "il grafo di V8", "todo-grafo/02-v8", "VIVO (solo per i centroidi)"),
    ("04-centroidi.npz", "i centroidi V1 per il collocatore (densi)", "coerenza/04", "VIVO"),
    ("05-centroidi.npz", "i centroidi V3 (sparsi)", "coerenza/05c", "VIVO"),
    ("04-impronte.json", "l'hash di idf e vocabolario V1 — il contratto di allineamento",
     "coerenza/01", "VIVO"),
    ("05-impronte.json", "l'hash di idf e vocabolario V3", "coerenza/01", "VIVO"),
    ("bolle-nitrile-V7.npy", "la partizione V7", "bolle-nitrile", "esperimento"),
    ("bolle-nitrile-V8sub.npy", "il sub-clustering per taglia su V8", "coerenza/09", "esperimento"),
    ("bolle-eterogeneo-V10-p1.0.npy", "la partizione RB 100", "eterogeneo/02-v10", "esperimento"),
    ("bolle-eterogeneo-V10-p1.0-r100-triangolo.npz", "lo STESSO triangolo (vedi trappole)", "",
     "duplicato"),
    ("bolle-eterogeneo-sub80.npy", "la divisione per TAGLIA (80+ titoli) — scartata",
     "eterogeneo/10", "esperimento"),
]


def _parse(nome: str) -> float | None:
    try:
        return float(nome)
    except ValueError:
        return None


# ============================================================ i sottocomandi
def stato(_args) -> int:
    """Cosa c'e', cosa manca, e se gli artefatti sono allineati fra loro."""
    print("=" * 100)
    print("STATO DEL MODULO")
    print("=" * 100)
    print(f"  radice del repo : {K.ROOT}")
    print(f"  cache           : {K.ML}")
    print(f"  canone          : {K.titoli()[2]:,} titoli")   # N vive in `titoli()`, non in canon
    print()
    print(f"  {'artefatto':<44} {'MB':>7}  stato")
    vivi = mancanti = 0
    for nome, _cosa, _chi, stato_ in ARTEFATTI:
        f = K.ML / nome
        if f.exists():
            mb = f.stat().st_size / 1048576
            vivi += 1 if stato_ == "VIVO" else 0
            print(f"  {nome:<44} {mb:>7.1f}  {stato_}")
        else:
            mancanti += 1
            print(f"  {nome:<44} {'—':>7}  MANCANTE")
    print(f"\n  {vivi} vivi · {len(ARTEFATTI) - vivi - mancanti} esperimenti/duplicati · {mancanti} mancanti")

    # il contratto di allineamento: il controllo che oggi ha fermato un errore vero
    print("\n  CONTRATTO DI ALLINEAMENTO degli spazi (idf e vocabolario):")
    for pref in ("04", "05"):
        imp = K.ML / f"{pref}-impronte.json"
        if not imp.exists():
            print(f"    {pref}: impronte assenti")
            continue
        idf = np.load(K.ML / f"{pref}-idf.npy") if (K.ML / f"{pref}-idf.npy").exists() else None
        vocab = json.load(open(K.ML / f"{pref}-vocab.json", encoding="utf-8"))
        if idf is None:
            tf = sp.load_npz(K.ML / f"{pref}-tfidf.npz").tocsr()
            df = np.asarray((tf > 0).sum(0)).ravel()
            idf = np.log(tf.shape[0] / (1 + df)).astype(np.float32)
        h_i = hashlib.sha256(np.asarray(idf, np.float32).tobytes()).hexdigest()[:16]
        h_v = hashlib.sha256(repr(sorted(vocab.items())).encode()).hexdigest()[:16]
        att = json.load(open(imp, encoding="utf-8"))
        ok = (h_i == att.get("idf")) and (h_v == att.get("vocab"))
        print(f"    {pref}: {'ALLINEATO' if ok else 'DISALLINEATO'} "
              f"(idf {h_i} · vocab {h_v} · attesi {att.get('idf')} · {att.get('vocab')})")
    return 0


def ricetta(_args) -> int:
    """I parametri, leggibili. Prima vivevano solo nel codice."""
    print(json.dumps(RICETTA, indent=2, ensure_ascii=False))
    return 0


def colloca(args) -> int:
    """Colloca titoli nuovi. E' l'uso del modulo: `python -m graph.pipeline colloca nuovi.json`."""
    from . import collocator as C
    # utf-8, e se fallisce si ripiega: i JSON scritti su Windows con `open()` escono in cp1252, e
    # una "è" in un titolo italiano fa fallire il caricamento. Meglio leggere che pretendere.
    try:
        dati = json.load(open(args.file, encoding="utf-8"))
    except UnicodeDecodeError:
        dati = json.load(open(args.file, encoding="cp1252"))
    S_v3 = C.carica(v3=True)
    S_v1 = C.carica(v3=False)
    mem = np.load(K.ML / "bolle-nitrile-V8.npy")     # la partizione dei centroidi: vedi trappole
    out = []
    t = time.time()
    for d in dati:
        b, conf, ntok, fuori = C.colloca(d, d.get("tipo", "movie"), S_v3, S_macro=S_v1)
        nome = str(d.get("title") or d.get("name") or "")
        mv = C.vicini_titoli(C.vettore(C.tokenizza(d, d.get("tipo", "movie")), S_v3)[0], S_v3, 5)
        out.append({"titolo": nome, "bolla": None if b is None else int(b),
                    "confidenza": round(conf, 4), "termini": ntok, "fuori_vocabolario": fuori,
                    "membri": [int(x) for x in np.where(mem == b)[0][:12]] if b is not None else [],
                    "vicini": [{"i": int(i), "cos": round(c, 4)} for i, c in mv]})
    print(json.dumps({"collocati": len(out), "secondi": round(time.time() - t, 1), "titoli": out},
                     ensure_ascii=False, indent=1))
    return 0


def voti(args) -> int:
    """La divisione per voti: la partizione base -> i pezzi, e le metriche."""
    from . import bubbles as B
    SOGLIA = _parse(args.soglia) or 10.0
    MIN = args.min_membri
    base = K.ML / (args.base or "bolle-eterogeneo-V10-p1.0-r200.npy")
    mem = np.load(base)
    NB = int(mem.max()) + 1
    triangolo = K.ML / (args.triangolo or "bolle-eterogeneo-V10-p1.0-triangolo.npz")
    q = np.load(triangolo)
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(B.N, B.N)).tocsr()
    print(f"  base: {base.name} ({NB:,} bolle) · triangolo: {triangolo.name}")
    print("  il resto del lavoro sta in `.scratch/eterogeneo/11-subclustering-voti.py`, che e' dove e'")
    print("  stato misurato: spread p90/p10 > 10, almeno 15 titoli, risoluzioni 0,05..0,8 coi pesi")
    print("  normalizzati. Portarlo qui significa spostare ~60 righe; non l'ho fatto per non toccare")
    print("  quello che ha prodotto i numeri. Il risultato e' `bolle-eterogeneo-subvoti.npy`.")
    return 0


def pesanti(_args) -> int:
    """Come si rigenera TUTTO, nell'ordine giusto. Non esegue: stampa."""
    print("""LA SEQUENZA, e i tempi misurati il 15/10/2026:

  0. ollama pull qwen3-embedding:0.6b                                  (~1 min, 0,6 GB)
     python .scratch/eterogeneo/../coerenza/04h-embed-qwen3.py         (~17 min, 35.829 trame)
  1. python .scratch/eterogeneo/01-componente-trama.py                 (~13 s, 1,65M archi)
  2. RES=200 python .scratch/eterogeneo/02-v10.py 1.0                  (~13 min, 11 GB di picco)
     -> il triangolo e la partizione RB 200
  3. python .scratch/eterogeneo/11-subclustering-voti.py 10 15         (~8 s, la divisione per voti)
  4. python .scratch/mappa-pesata/05c-salva-v3.py                      (~20 s, i centroidi V3)
  5. la mappa 6+2: .scratch/mappa-pesata/01-02-pesata.py + 07-falsi-vicini.py

ATTENZIONE a due cose, sono le trappole della ricetta:
  · il passo 2 va lanciato con RES=200 nella stessa riga di comando, non come variabile a parte;
  · il triangolo si chiama `r100` o `r200` secondo il lancio, ma e' sempre lo stesso grafo (e' PRIMA
    di Leiden). Se ne manca uno, l'altro vale.
""")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m graph.pipeline", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stato", help="cosa c'e', cosa manca, gli hash").set_defaults(fn=stato)
    sub.add_parser("ricetta", help="i parametri di tutto").set_defaults(fn=ricetta)
    pc = sub.add_parser("colloca", help="colloca titoli nuovi da un JSON")
    pc.add_argument("file")
    pc.set_defaults(fn=colloca)
    pv = sub.add_parser("voti", help="la divisione per voti")
    pv.add_argument("soglia", nargs="?", default="10")
    pv.add_argument("--min-membri", type=int, default=15)
    pv.add_argument("--base", default=None)
    pv.add_argument("--triangolo", default=None)
    pv.set_defaults(fn=voti)
    sub.add_parser("pesanti", help="come rigenerare tutto").set_defaults(fn=pesanti)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
