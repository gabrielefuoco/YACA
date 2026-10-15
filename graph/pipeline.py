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
from . import parametri as P
from .camminata import PESO_TIPO_FATTORI
from . import camminata as _C

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
     "graph/steps/03_divisione_voti.py", "VIVO"),
    ("bolle-nitrile-V8.npy", "la partizione V8 — SUPERATA il 15/10/2026: i centroidi erano "
     "costruiti qui e il resto del sistema lavorava su 3.497 bolle", "todo-grafo/02-v8",
     "esperimento"),
    ("bolle-nitrile-V8-triangolo.npz", "il grafo di V8", "todo-grafo/02-v8", "esperimento"),
    ("04-centroidi.npz", "i centroidi V1 per il collocatore (densi), su `subvoti`",
     "graph/steps/04_centroidi.py", "VIVO"),
    ("05-centroidi.npz", "i centroidi V3 (sparsi), su `subvoti`", "graph/steps/05_centroidi_v3.py",
     "VIVO"),
    ("04-impronte.json", "l'hash di idf, vocabolario **e della partizione** — il contratto",
     "graph/steps/04_centroidi.py + measure/contratti.py", "VIVO"),
    ("05-impronte.json", "l'hash di idf, vocabolario e partizione per V3",
     "graph/steps/05_centroidi_v3.py + measure/contratti.py", "VIVO"),
    ("mappa-finale-6-2.npz", "LA MAPPA NAVIGABILE 6+2 sulle 3.497 bolle: 45.194 archi, "
     "1 componente. Senza, `measure/saghe.py` non ha un oggetto onesto su cui misurare",
     "graph/steps/06_mappa.py", "VIVO"),
    ("bolle-nitrile-V7.npy", "la partizione V7", "bolle-nitrile", "esperimento"),
    ("bolle-nitrile-V8sub.npy", "il sub-clustering per taglia su V8", "coerenza/09", "esperimento"),
    ("bolle-eterogeneo-V10-p1.0.npy", "la partizione RB 100", "eterogeneo/02-v10", "esperimento"),
    ("bolle-eterogeneo-V10-p1.0-r100-triangolo.npz", "lo STESSO triangolo (vedi trappole): l'hash "
     "e' identico a quello senza suffisso — la prova che la risoluzione non entra nel triangolo", "",
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
        f = K.A(nome)
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
        imp = K.A(f"{pref}-impronte.json")
        if not imp.exists():
            print(f"    {pref}: impronte assenti")
            continue
        idf = np.load(K.A(f"{pref}-idf.npy")) if K.A(f"{pref}-idf.npy").exists() else None
        vocab = json.load(open(K.A(f"{pref}-vocab.json"), encoding="utf-8"))
        if idf is None:
            tf = sp.load_npz(K.A(f"{pref}-tfidf.npz")).tocsr()
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
    mem = np.load(K.A("bolle-nitrile-V8.npy"))     # la partizione dei centroidi: vedi trappole
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
    base = K.A(args.base or "bolle-eterogeneo-V10-p1.0-r200.npy")
    mem = np.load(base)
    NB = int(mem.max()) + 1
    triangolo = K.A(args.triangolo or "bolle-eterogeneo-V10-p1.0-triangolo.npz")
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


def lista(args) -> int:
    """Il motore. Vedi `graph/motore.py`: e' l'unico posto dove il meccanismo viene USATO."""
    from graph import motore as MO
    M = MO.Motore()
    MO.carica_titoli()
    slider = {k: v for k, v in (("largo", args.largo), ("lontano", args.lontano),
                                ("cozy", args.cozy), ("canone", args.canone)) if v is not None}
    if args.utenti:
        for u in args.utenti.split(","):
            u = u.strip()
            if not u:
                continue
            print("\n" + "=" * 100)
            print(f"UTENTE {u}")
            print("=" * 100)
            MO.stampa(M.lista(MO.da_trakt(u), slider))
        return 0
    if args.file:
        storia = [(k, p) for k, p in json.load(open(args.file, encoding="utf-8"))]
    elif args.utente:
        storia = MO.da_trakt(args.utente)
    else:
        print("serve un file, --utente o --utenti")
        return 2
    esito = M.lista(storia, slider)
    MO.carica_titoli()
    MO.stampa(esito)
    return 0


def lettura(args) -> int:
    """Una LETTURA stratificata: N utenti lungo tutta la scala del canone, in un documento da leggere.

    La selezione NON e' a caso e NON e' a occhio: si ordina un campione di candidati per il **canone
    dedotto** (la mediana dei voti della storia) e si prendono N utenti equidistanti su quella scala —
    cosi' il documento copre i nicchia, i medi e i mainstream.
    """
    import numpy as np
    from graph import bubbles as B
    from graph import motore as MO
    M = MO.Motore()
    MO.carica_titoli()
    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    rng = np.random.default_rng(9)
    cand = rng.choice(pool, size=min(240, len(pool)), replace=False)
    righe = []
    for u in cand:
        rr = np.array([B.ROW_OF[k] for k, _ in MO.da_trakt(u) if k in B.ROW_OF], np.int64)
        if len(rr) < P.BANCO_MIN_TITOLI:
            continue
        righe.append((M.deduci(rr)["canone"], u, len(rr)))
    righe.sort()
    quanti = min(args.quanti, len(righe))
    scelti = [righe[int(i * (len(righe) - 1) / max(quanti - 1, 1))] for i in range(quanti)]
    out = [f"# Dieci portafogli, lungo la scala del canone\n",
           f"Campione di {len(righe)} utenti Trakt ordinati per **canone dedotto** (mediana dei voti della",
           "storia). Gli utenti sono presi equidistanti su quella scala: i piu' di nicchia, i medi, i piu'",
           "popolari. Ogni blocco: il profilo, i mondi accesi, e le liste coi primi titoli.",
           f"\nVersione artefatto {M.artefatto} · impronta della ricetta {P.impronta()}\n"]
    for k, (canone, u, n) in enumerate(scelti, 1):
        esito = M.lista(MO.da_trakt(u))
        pr = esito["profilo"]
        out.append(f"\n---\n\n## {k}. `{u}` — {n} titoli · canone {canone:,.0f} voti · "
                   f"forma {pr['forma']} mondi\n")
        out.append("**Mondi accesi:** " + " · ".join(
            f"`{m['bolla']}` ({m['titoli']} tit., {m['voti_mediani']:,.0f} voti, "
            f"{100*m['attivazione']:.1f}%)" for m in esito["mondi"]) + "\n")
        for li in esito["liste"]:
            if not li["titoli"]:
                continue
            tt = " · ".join(MO.TITOLI.get(kk, kk)[:30] for kk, _ in li["titoli"][:7])
            out.append(f"- **{li['tipo']}** — {tt}")
    testo = "\n".join(out)
    dove = pathlib.Path(args.fuori)
    dove.parent.mkdir(parents=True, exist_ok=True)
    dove.write_text(testo, encoding="utf-8")
    print(f"  scritto: {dove} ({len(scelti)} utenti)")
    return 0


def esporta(args) -> int:
    """L'ARTEFATTO PER IL PRODOTTO — l'unica cosa che attraversa il confine fra modulo e `src/`.

    E' ANCHE IL JOB NOTTURNO, con `--colloca`: prima assegna una bolla ai titoli che l'artefatto ancora
    non conosce (quelli usciti dopo l'ultima costruzione, ~11 ms l'uno), poi scrive tutto.

    PERCHE' LA COLLOCAZIONE BASTA, e non serve toccare il grafo: l'engine del prodotto cammina sulle
    BOLLE, non sui titoli. Un titolo nuovo che riceve una bolla **compare fra i membri di quella bolla**,
    e quindi eredita la sua attivazione. La decisione presa in mappa («i titoli nuovi ereditano la loro
    bolla, nei due versi») e' **automatica** in questa architettura: nessun arco sintetico, nessuna
    perturbazione del grafo.

    Cosa contiene, e nient'altro (sta sotto i 2 MB):
      titoli:   {chiave: bolla}            per ogni titolo del canone
      bolle:    {bolla: {n, voti, vicini}} taglia, mediana dei voti, i vicini sulla mappa 6+2
      episodi:  {chiave: n}                solo per le SERIE: serve al loro peso (frazione di episodi)
      versione: impronte E PARAMETRI       artefatto + ricetta, e i valori che l'engine JS deve usare

    I PARAMETRI VIAGGIANO CON L'ARTEFATTO: l'engine del prodotto non deve avere numeri cablati,
    altrimenti la fonte dei valori diventa due.
    """
    import numpy as np
    from graph import bubbles as B
    D = K.DATA
    MEM = np.load(D / "bolle-eterogeneo-subvoti.npy")
    NB = int(MEM.max()) + 1
    SZ = np.bincount(MEM)
    M = np.load(D / "mappa-finale-6-2.npz", allow_pickle=True)
    INTRA = M["intra"]
    VOT = np.zeros(len(MEM))
    import pandas as pd
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", "vote_count"])
        for i, v in zip(d["id"], d["vote_count"]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is not None and not pd.isna(v):
                VOT[r] = float(v)
    titoli = {B.KEYS[i]: int(MEM[i]) for i in range(len(MEM))}
    bolle = {}
    for b in range(NB):
        m = np.where(MEM == b)[0]
        bolle[str(b)] = {
            "n": int(SZ[b]),
            "voti": int(np.median(VOT[m])) if len(m) else 0,
            "vicini": sorted({int(x) for x in INTRA[b] if x >= 0}),
        }
    nuovi = 0
    if getattr(args, "colloca", False):
        # I TITOLI CHE L'ARTEFATTO NON CONOSCE: quelli usciti dopo l'ultima costruzione. Vanno collocati
        # qui, perche' e' l'unico posto che ha i centroidi (50 MB che servono solo a questo).
        from graph import collocator as CO
        S = CO.carica(v3=True)
        candidati = []
        for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
            d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f)
            for k in range(len(d)):
                riga = d.iloc[k]
                ch = f"{tipo}:{int(riga['id'])}"
                if ch not in titoli:
                    candidati.append((riga.to_dict(), tipo if tipo == "tv" else "movie", ch))
        if getattr(args, "max", 0):
            candidati = candidati[:args.max]
        for dd, tipo, ch in candidati:
            bolla, _conf, _n, _f = CO.colloca(dd, tipo, S)
            if bolla is not None:
                titoli[ch] = int(bolla)
                bolle[str(int(bolla))]["n"] += 1
                nuovi += 1
        print(f"  collocati {nuovi:,} titoli nuovi (su {len(candidati):,} candidati conosciuti dal "
              f"catalogo e non dal grafo)")
    # gli episodi, SOLO per le serie: e' il denominatore del loro peso
    episodi = {}
    import pandas as pd
    tv = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "tv.parquet", columns=["id", "number_of_episodes"])
    for i, e in zip(tv["id"], tv["number_of_episodes"]):
        ch = f"tv:{int(i)}"
        e = pd.to_numeric(e, errors="coerce")
        if ch in B.ROW_OF and e is not None and not pd.isna(e) and e > 1:
            episodi[ch] = int(e)
    fuori = pathlib.Path(args.fuori)
    fuori.parent.mkdir(parents=True, exist_ok=True)
    with open(fuori, "w", encoding="utf-8") as f:
        json.dump({"versione": {
                       "artefatto": K.sha_file("bolle-eterogeneo-subvoti.npy"),
                       "ricetta": P.impronta(),
                       # I VALORI CHE L'ENGINE DEL PRODOTTO DEVE USARE, cosi' non ne cabla nessuno
                       "alpha": P.ALPHA, "iterazioni": P.ITER,
                       "peso_film_max": P.PESO_FILM_MAX,
                       "peso_serie": [P.PESO_SERIE_BASE, P.PESO_SERIE_FASCIA],
                       "fattore_tipo": PESO_TIPO_FATTORI,
                       "freddo_sotto": P.FREDDO_SOTTO,
                       "min_titoli_mondo": P.MIN_TITOLI_MONDO},
                   "titoli": titoli, "bolle": bolle, "episodi": episodi}, f,
                  ensure_ascii=False, separators=(",", ":"))
    mb = fuori.stat().st_size / 1024 / 1024
    print(f"  scritto: {fuori} — {mb:.2f} MB · {len(titoli):,} titoli · {len(bolle):,} bolle · "
          f"{len(episodi):,} serie con episodi")
    print(f"  versione: artefatto {K.sha_file('bolle-eterogeneo-subvoti.npy')} · "
          f"ricetta {P.impronta()}")
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
    pl = sub.add_parser("lista", help="IL MOTORE: entra una storia, escono le liste")
    pl.add_argument("file", nargs="?", help="un JSON [[chiave, plays], ...]")
    pl.add_argument("--utente", help="un utente Trakt in cache (alternativo al file)")
    pl.add_argument("--utenti", help="piu' utenti in un colpo solo, separati da virgola")
    pl.add_argument("--largo", type=int, default=None, help="quante liste (2-8)")
    pl.add_argument("--lontano", type=float, default=None, help="0=vicino · 1=mondi diversi")
    pl.add_argument("--cozy", type=float, default=None, help="-1=impegnativo · +1=cozy")
    pl.add_argument("--canone", type=float, default=None, help="-1=nicchia · +1=popolare")
    pl.set_defaults(fn=lista)
    plet = sub.add_parser("lettura", help="N portafogli lungo la scala del canone, in un documento")
    plet.add_argument("--quanti", type=int, default=10)
    plet.add_argument("--fuori", default=".scratch/suggerimenti/lettura.md")
    plet.set_defaults(fn=lettura)
    pex = sub.add_parser("esporta", help="l'artefatto per il prodotto (src/data/bolle.json)")
    pex.add_argument("--fuori", default="src/data/bolle.json")
    pex.add_argument("--colloca", action="store_true",
                     help="assegna una bolla ai titoli che l'artefatto non conosce (il job notturno)")
    pex.add_argument("--max", type=int, default=0, help="fermati dopo N collocazioni (prove)")
    pex.set_defaults(fn=esporta)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
