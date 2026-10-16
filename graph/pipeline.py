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
        idf = np.load(K.A(f"{pref}-idf.npy")) if K.esiste(f"{pref}-idf.npy") else None
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
    mem = np.load(K.A("bolle-eterogeneo-subvoti.npy"))   # LA PARTIZIONE FINALE, non V8
    # ^ fino al 16/10/2026 qui c'era `bolle-nitrile-V8.npy`: la partizione SUPERATA. I `membri`
    #   stampati venivano da li', mentre i centroidi e la mappa sono quelli finali: due partizioni
    #   diverse nella stessa risposta. `collocator.py` lo dice esplicitamente alla riga della sua
    #   costante PARTIZIONE — questo era l'unico posto rimasto indietro.
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
    print("  il resto del lavoro sta in `graph/steps/03_divisione_voti.py`, che e' dove e' stato")
    print("  misurato: spread p90/p10 > 10, almeno 15 titoli, risoluzioni 0,05..0,8 coi pesi")
    print("  normalizzati. Il risultato e' `bolle-eterogeneo-subvoti.npy`.")
    print("  NOTA: quello step e' ancora uno script a livello globale, quindi non si puo' chiamare da")
    print("  qui — vedi il ticket `14-build-dag`, che lo incapsula in una funzione `esegui()`.")
    return 0


def pesanti(_args) -> int:
    """Come si rigenera TUTTO, nell'ordine giusto. Non esegue: stampa."""
    print("""LA SEQUENZA, e i tempi misurati il 15/10/2026. Gli script stanno in `graph/steps/`:

  0. ollama pull qwen3-embedding:0.6b                                  (~1 min, 0,6 GB)
     python graph/steps/00_embedding_trame.py                          (~17 min, 35.829 trame)
  1. python graph/steps/01_componente_trama.py                         (~13 s, 1,65M archi)
  2. RES=200 python graph/steps/02_partizione.py 1.0                   (~13 min, 11 GB di picco)
     -> il triangolo e la partizione RB 200
  3. python graph/steps/03_divisione_voti.py 10 15                     (~8 s, la divisione per voti)
  4. python graph/steps/05_centroidi_v3.py                             (~20 s, i centroidi V3)
  5. la mappa 6+2: python graph/steps/06_mappa.py

ATTENZIONE a tre cose, sono le trappole della ricetta:
  · il passo 2 va lanciato con RES=200 nella stessa riga di comando, non come variabile a parte;
  · il triangolo si chiama `r100` o `r200` secondo il lancio, ma e' sempre lo stesso grafo (e' PRIMA
    di Leiden). Se ne manca uno, l'altro vale.
  · QUESTA SEQUENZA NON E' UN DAG: gli step sono script a livello globale, e i parametri di
    costruzione stanno ancora dentro di loro, non in `parametri.py` (ticket 13 e 14).
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
    INTRA, CROSS = M["intra"], M["cross"]          # 6 intra-medium + 2 PONTI cross-medium
    # LA TRANSIZIONE VERA FRA BOLLE. Il .npz contiene gia' il grafo sparso pesato (45.194 archi, gli
    # stessi della mappa): era buttato via, e `Bolle.js` diffondeva dividendo la massa in parti UGUALI
    # fra i vicini, senza auto-anello e senza ponti cross. In Python invece il 47,8% della massa resta
    # nella bolla a ogni passo e il resto esce in proporzione ai pesi. Qui si esporta quella riga, cosi'
    # le 20 iterazioni del prodotto riproducono l'attivazione del modulo.
    W = sp.csr_matrix((M["grafo_data"], M["grafo_indices"], M["grafo_indptr"]),
                      shape=(NB, NB)).tocsr()
    _deg = np.asarray(W.sum(1)).ravel()
    _deg[_deg <= 0] = 1
    TR = sp.diags(1.0 / _deg) @ W
    VOT = np.asarray(K.metadati()["VOT"], float)
    # ^ I VOTI VENGONO DALL'ARTEFATTO DEI METADATI, non da una rilettura dei Parquet: `canon.metadati()`
    #   li ha gia' allineati alle righe del canone, vettorizzati e con l'impronta dei generi dentro.
    #   Prima qui c'erano due `pd.read_parquet` con un ciclo Python su 117.000 righe (ticket 29).
    # I TITOLI, IN ORDINE. Prima l'ordine era quello del canone — le righe di `spazi-trakt.npz` — che per
    # un utente e' arbitrario: nel mondo Star Trek, Voyager finiva settimo dietro a quattro voci doppie
    # di Stargate. Ora si inseriscono RAGGRUPPATI PER BOLLA e, dentro ogni bolla, per VOTO BAYESIANO
    # (voto medio corretto dal numero di voti: il grezzo premia il nuovo e il mal votato, il bayesiano
    # premia quello che la gente ha davvero apprezzato).
    #
    # E NON COSTA UN BYTE: l'ordine e' quello di INSERZIONE nella mappa, e il JSON lo conserva. In
    # JavaScript `Object.entries` lo rispetta perche' le chiavi (`tv:1396`) non sono integer-like — se
    # fossero numeri nudi, il motore le riordinerebbe da solo e tutto questo sarebbe inutile.
    _voti = np.asarray(K.metadati()["VOT"], float)
    _medi = np.asarray(K.metadati()["VAVE"], float)
    _con_voto = _voti > 0
    _C = float(_medi[_con_voto].mean()) if _con_voto.any() else 0.0
    _m = float(np.percentile(_voti[_con_voto], 60)) if _con_voto.any() else 0.0
    _bayes = (_voti * _medi + _m * _C) / np.maximum(_voti + _m, 1e-9)
    titoli = {}
    for _b in range(NB):
        for _r in sorted(np.where(MEM == _b)[0].tolist(), key=lambda r_: -_bayes[r_]):
            titoli[B.KEYS[_r]] = _b
    # I TERMINI E GLI ESEMPI DI OGNI MONDO (ticket 12). Senza, una bolla e' `mondo 1084 · 25 titoli ·
    # voti 636`: per sapere CHE COS'E' bisogna incrociare i parquet o leggere i titoli uno a uno. Coi
    # termini del centroide V3 (`ge:thriller · kw:psychological thriller · di:david fincher`) e i tre
    # titoli piu' votati, un mondo si legge in una riga — ed e' quello che rendeva leggibile
    # `bolle-esempi.md` quando l'ho visto la prima volta.
    from graph import collocator as CO
    _S = CO.carica(v3=True)
    _inv = {j: t for t, j in _S["vocab"].items()}
    _CEN, _NORMA = _S["SUM"].tocsr(), _S["NORMA"]
    # I CENTROIDI SONO 2.922, NON 3.497: `TUTTE` e' la mappa bolla -> riga, e le bolle che non ci sono
    # (le piccole) semplicemente non hanno un centroide. Restano senza `termini`, ed e' la verita'.
    _POS = {int(b): i for i, b in enumerate(_S["TUTTE"])}
    TIT = K.metadati()["TIT"]
    bolle = {}
    for b in range(NB):
        m = np.where(MEM == b)[0]
        riga = TR.getrow(b)
        # `P`: [bolla, peso normalizzato], dall'arco piu' forte, AUTO-ANELLO INCLUSO (`dest == b`).
        # L'auto-anello e' il pezzo che mancava: senza, il 100% di (1-alpha)*r[b] esce dalla bolla,
        # mentre sui titoli il 47,8% della massa ci resta (i membri di una bolla sono densamente
        # connessi fra loro). Per i vicini «da navigare» basta scartare la voce con dest == b.
        coppie = sorted(zip((int(x) for x in riga.indices), (float(x) for x in riga.data)),
                        key=lambda t: -t[1])
        # SCARTARE GLI ZERI e RINORMALIZZARE DOPO L'ARROTONDAMENTO. Prima si arrotondava a 4 decimali
        # senza rinormalizzare, e su una riga con ~15 archi la somma scendeva a 0,9993 (misurato:
        # scarto fino a 7e-4) — e restavano nel JSON 24 pesi a ZERO, che sono archi che non esistono.
        # Quella deriva era la causa del residuo di 4,2e-5 fra il motore Python e quello JavaScript.
        coppie = [(d_, p_) for d_, p_ in coppie if p_ > 0.0]
        _somma = sum(p_ for _, p_ in coppie)
        coppie = [(d_, p_ / _somma) for d_, p_ in coppie] if _somma > 0 else []
        # il centroide NORMALIZZATO: la norma grezza dipende da quanti titoli ha la bolla e da quanto
        # sono lunghi i loro testi, e senza normalizzare i «termini piu' forti» sarebbero sempre quelli
        # delle bolle grandi.
        c = (_CEN.getrow(_POS[b]).toarray().ravel() / max(float(_NORMA[_POS[b]]), 1e-9)
             if b in _POS else np.zeros(1))
        forti = np.argsort(-c)[:5]
        bolle[str(b)] = {
            "n": int(SZ[b]),
            "voti": int(K.mediana_voti(VOT[m])),
            "termini": [_inv[int(j)] for j in forti if c[j] > 0] if b in _POS else [],
            "esempi": [str(TIT[int(r_)]) for r_ in m[np.argsort(-VOT[m])][:3]],
            "P": [[d_, p_] for d_, p_ in coppie],
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
        S_v1 = CO.carica(v3=False)         # V1 per la MACRO: senza S_macro `colloca` scende a V3,
        for dd, tipo, ch in candidati:     # e la bolla macro passerebbe dal 63,0% al 35,3%
            bolla, _conf, _n, _f = CO.colloca(dd, tipo, S, S_macro=S_v1)
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


def parita(args) -> int:
    """IL GOLDEN DELLA PARITA' Python <-> JavaScript (ticket 16 di `.scratch/suggerimenti/issues/`).

    Perche' esiste: ci sono DUE motori che devono dire la stessa cosa — `graph/motore.py`, che misura e
    decide i parametri, e `src/engines/bolle/Bolle.js`, che serve il prodotto. Il rischio non e' che uno
    dei due si rompa: e' che qualcuno cambi la formula in Python, misuri che migliora, e **dimentichi il
    JavaScript**. Da li' in poi il numero misurato non e' piu' quello servito, e nessuno se ne accorge.

    Il golden ha DUE livelli, e non sono la stessa cosa:

      `bolla_pura` — l'algoritmo del PRODOTTO (diffusione sulle bolle con la `P` esportata), ricalcolato
        qui **con scipy**, cioe' con una implementazione diversa da quella di `Bolle.js` (matrice contro
        cicli). Questo confronto deve tornare **esatto**: se non torna, una delle due parti e' cambiata.

      `titoli_aggregato` — l'attivazione del motore VERO, che cammina sui **titoli** (13,2 milioni di
        archi), aggregata alle bolle. Qui l'uguaglianza NON c'e' e non deve esserci: e' la semplificazione
        dichiarata (bolle invece di titoli). Il test confronta i due ordinamenti con una soglia, e serve a
        **misurare quanto costa** quella semplificazione — e a protestare se un giorno costa troppo.
    """
    import numpy as np
    from graph import motore as MO
    M = MO.Motore(silenzioso=True)
    d = json.load(open("src/data/bolle.json", encoding="utf-8"))
    v = d["versione"]
    riga_P = {int(b): [(int(x), float(w)) for x, w in vv["P"]] for b, vv in d["bolle"].items()}

    # CINQUE STORIE FISSE, scelte dal canone con una regola deterministica (nessuna dipendenza dalla
    # cache di Trakt: il fixture deve valere per chiunque cloni il repository).
    K_, ROW_OF, N, IS_TV = MO.B.KEYS, MO.B.ROW_OF, M.N, MO.B.IS_TV
    film = [k for k in K_ if k.startswith("movie:")]
    serie = [k for k in K_ if k.startswith("tv:")]
    mescola = lambda L, passo, quanti: [L[(i * passo) % len(L)] for i in range(quanti)]
    storie = [
        ("solo film", [(k, 2, "loved") for k in mescola(film, 811, 5)]),
        ("solo serie", [(k, 12, "watched") for k in mescola(serie, 277, 5)]),
        ("mista con loved e library", [(k, 3, "loved") for k in mescola(film, 1493, 3)]
                                      + [(k, 1, "library") for k in mescola(serie, 631, 3)]),
        ("fredda, due titoli", [(film[7], 1, "watched"), (serie[11], 1, "watched")]),
        ("lunga, trenta titoli", [(k, 2, "liked") for k in mescola(film, 97, 15)]
                                 + [(k, 20, "loved") for k in mescola(serie, 113, 15)]),
    ]
    fuori, misure = {"versioni": {"artefatto": v["artefatto"], "ricetta": v["ricetta"]}, "storie": []}, []
    for nome, storia in storie:
        righe = np.array([ROW_OF[k] for k, _, _ in storia], np.int64)
        plays = np.array([p for _, p, _ in storia], np.int64)
        tipi = [t for _, _, t in storia]
        w = M.pesi_semi(righe, plays, tipi)
        meme = np.zeros(M.NB)
        for r_, w_ in zip(righe, w):
            meme[int(M.MEM[r_])] += float(w_)
        meme /= max(meme.sum(), 1e-12)
        # ---- livello 1: la bolla pura, con scipy (matrice) invece che coi cicli
        Q = sp.lil_matrix((M.NB, M.NB))
        for b, voci in riga_P.items():
            for dest, ww in voci:
                Q[b, dest] = ww
        Q = Q.tocsr()
        r = meme.copy()
        for _ in range(int(v["iterazioni"])):
            r = v["alpha"] * meme + (1.0 - v["alpha"]) * (Q.T @ r)
        # SI NORMALIZZA, come fa `Bolle.js` (`r[b] / somma`). Prima qui si salvava `r` senza dividere:
        # era l'altra meta' del residuo di 4,2e-5 — il test di parita' confrontava un vettore
        # normalizzato con uno no.
        r = r / max(float(r.sum()), 1e-300)
        pura = [(int(b), float(x)) for b, x in enumerate(r) if x > 0]
        pura.sort(key=lambda t: -t[1])
        pura = pura[:30]
        # ---- livello 2: il motore vero, aggregato alle bolle
        att, _r = M.diffondi(righe, plays, tipi)
        fatta = [(int(b), float(x)) for b, x in enumerate(att) if x > 0]
        fatta.sort(key=lambda t: -t[1])
        fatta = fatta[:30]
        m10 = set(b for b, _ in pura[:10])
        n10 = set(b for b, _ in fatta[:10])
        jac = len(m10 & n10) / max(len(m10 | n10), 1)
        misure.append((nome, jac, pura[0][0] == fatta[0][0], pura[0][0] in n10))
        fuori["storie"].append({
            "nome": nome,
            "semi": [{"chiave": k, "plays": int(p_), "tipo": t_, "peso": float(w_),
                      "bolla": int(M.MEM[ROW_OF[k]])} for (k, p_, t_), w_ in zip(storia, w)],
            "bolla_pura": [[b, round(x, 9)] for b, x in pura],
            "titoli_aggregato": [[b, round(x, 9)] for b, x in fatta],
        })
    fuori["misure"] = [{"nome": n, "jaccard_primi_10": round(j, 3),
                        "primo_mondo_uguale": u, "primo_mondo_dentro_i_primi_10": d_} for n, j, u, d_ in misure]
    p = pathlib.Path(args.fuori)
    p.parent.mkdir(parents=True, exist_ok=True)
    json.dump(fuori, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"  scritto: {p} — {len(storie)} storie")
    print("  quanto COSTA la semplificazione dichiarata (bolle invece di titoli):")
    for n, j, u, d_ in misure:
        print(f"    {n:<28} jaccard primi 10 {j:>5.2f} · primo mondo uguale "
              f"{'si' if u else 'NO'} · dentro i primi 10 {'si' if d_ else 'NO'}")
    print(f"  versione: artefatto {v['artefatto']} · ricetta {v['ricetta']}")
    return 0


# ============================================================================================
# IL DAG DELLA COSTRUZIONE (ticket 14)
# ============================================================================================
# Perche' esiste, in una riga: il 15/10/2026 i centroidi del collocatore sono stati costruiti sulla
# partizione V8 mentre il resto del sistema lavorava sulle 3.497 bolle di `subvoti`. Un artefatto
# vecchio mescolato con uno nuovo, per giorni, senza un crash e senza un numero che protestasse — solo
# punteggi che scivolavano. Questo e' il posto dove quel silenzio diventa un errore.
#
# COME FUNZIONA: ogni passo dichiara cosa LEGGE (glob), cosa SCRIVE (glob), e quali PARAMETRI lo
# invalidano. `build` confronta lo stato attuale con un manifest e dice quali passi vanno rifatti — e
# perche'. **Non esegue niente senza `--esegui`**: il piano e' l'output di default, perche' un DAG che
# parte da solo su passi da 17 minuti e' un altro genere di problema.
#
# E UNA COSA CHE QUESTO DAG NON FA, dichiarata: non riscrive gli step come funzioni. `02_partizione.py`
# legge `sys.argv` e `os.environ` da dentro, e non posso verificare che una riscrittura non cambi il
# risultato (13 minuti, 11 GB di picco). Gli step restano comandi; diventano funzioni quando avro' un
# modo di provare che producono gli stessi byte.
PASSO = [
    {"nome": "embedding_trame", "cmd": ["steps/00_embedding_trame.py"], "env": {},
     "legge": [], "scrive": ["04-trama-qwen3b*.npy"], "params": ["MOD_EMBEDDING"],
     "tempo": "~17 min"},
    {"nome": "componente_trama", "cmd": ["steps/01_componente_trama.py"], "env": {},
     "legge": ["04-trama-qwen3b*.npy"], "scrive": ["eterogeneo-TRAMA.npz"],
     "params": ["TRAMA_TOPK", "TRAMA_SOGLIA", "TRAMA_BLOCCO"], "tempo": "~13 s"},
    {"nome": "partizione", "cmd": ["steps/02_partizione.py"], "env": {"RES": "200"},
     "legge": ["eterogeneo-TRAMA.npz", "bolle-nitrile-V8.npy"],
     "scrive": ["bolle-eterogeneo-V10-p1.0-r200*", "eterogeneo-chimere-p1.0-r200*"],
     "params": ["PARTIZIONE_RES", "PARTIZIONE_PESI", "PARTIZIONE_MIN_SIM_KW",
                "PARTIZIONE_MIN_SIM_CAST"], "tempo": "~13 min, 11 GB di picco"},
    {"nome": "divisione_voti", "cmd": ["steps/03_divisione_voti.py"], "env": {},
     "legge": ["bolle-eterogeneo-V10-p1.0*.npz", "bolle-eterogeneo-V10-p1.0*.npy"],
     "scrive": ["bolle-eterogeneo-subvoti.npy"],
     "params": ["VOTI_SPREAD_MIN", "VOTI_MIN_MEMBRI", "VOTI_RISOLUZIONI"], "tempo": "~8 s"},
    {"nome": "centroidi_v1", "cmd": ["steps/04_centroidi.py"], "env": {},
     "legge": ["bolle-eterogeneo-subvoti.npy", "bolle-eterogeneo-V10-p1.0*.npz"],
     # I NOMI SONO PRECISI, NON `04-*`: quel pattern catturava anche `04-trama-qwen3b.npy`, che e'
     # l'artefatto dell'embedding — di un ALTRO passo. E' la stessa radice del ticket 11 (due pipeline
     # che si spartiscono il prefisso `04-`), e l'ha scoperta il test dell'ordine topologico: se
     # `centroidi_v1` dichiara di scrivere un file di `embedding_trame`, la propagazione fa un errore.
     "scrive": ["04-centroidi.npz", "04-vocab.json", "04-tfidf.npz", "04-impronte.json"],
     "params": ["CENTROIDI_MIN_MEMBRI"], "tempo": "oltre 15 min"},
    {"nome": "centroidi_v3", "cmd": ["steps/05_centroidi_v3.py"], "env": {},
     "legge": ["bolle-eterogeneo-subvoti.npy", "04-centroidi.npz"],
     "scrive": ["05-centroidi.npz", "05-centroidi-meta.npz", "05-tfidf.npz", "05-vocab.json",
               "05-idf.npy", "05-impronte.json"],
     "params": ["V3_DF_MIN", "V3_TETTO_IDF", "PESI_TOKEN"], "tempo": "~20 s"},
    {"nome": "mappa", "cmd": ["steps/06_mappa.py"], "env": {},
     "legge": ["bolle-eterogeneo-subvoti.npy", "bolle-eterogeneo-V10-p1.0*.npz"],
     "scrive": ["mappa-finale-6-2.npz"], "params": ["MAPPA_INTRA", "MAPPA_CROSS"], "tempo": "~1 min"},
    {"nome": "esporta", "cmd": ["-m", "graph.pipeline", "esporta"], "env": {},
     "legge": ["bolle-eterogeneo-subvoti.npy", "mappa-finale-6-2.npz", "05-centroidi*.npz",
               "metadati-canone.npz", "titoli-canone.txt"],
     "scrive": ["../../src/data/bolle.json"], "params": [], "tempo": "~5 s"},
]
MANIFEST = K.DATA / "manifest-build.json"


def _sha_breve(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()[:16]


def _file_di(pat, base=None):
    """I file che corrispondono a un pattern, dalle due cartelle che contano: `graph/data/` e `src/`.

    I pattern sono relativi a `graph/data/`; uno che comincia con `../` punta fuori (l'artefatto del
    prodotto), e in quel caso si risolve la CARTELLA e si cerca il nome dentro — non il contrario, che
    elencherebbe tutto il contenuto della cartella.
    """
    base = base or K.DATA
    percorso = pathlib.Path(pat)
    if percorso.is_absolute() or pat.startswith(".."):
        p = (base / percorso.parent).resolve()
        return sorted(p.glob(percorso.name)) if p.exists() else []
    return sorted(base.glob(pat))


def stato_di(passo):
    """Lo stato OSSERVABILE di un passo: l'impronta dei suoi ingressi, i suoi parametri, i suoi uscite."""
    ingressi = {f.name: _sha_breve(f) for pat in passo["legge"] for f in _file_di(pat)}
    uscite = {f.name: _sha_breve(f) for pat in passo["scrive"] for f in _file_di(pat)}
    return {"ingressi": ingressi, "uscite": uscite,
            "parametri": {k: str(getattr(P, k)) for k in passo["params"]}}


def piano(manifest=None, passo=PASSO):
    """QUALI PASSI VANNO RIFATTI, E PERCHE'. E' una funzione PURA: si prova senza eseguire niente.

    L'ORDINE DELLA TABELLA E' L'ORDINE DEI PASSI: la propagazione guarda solo i passi gia' visitati,
    quindi `PASSO` deve stare in ordine topologico. (Se un giorno non lo fosse, questo commento e' la
    trappola: nessuno se ne accorgerebbe.)

    Un passo e' da rifare se:
      · non e' mai stato eseguito;
      · un suo ingresso e' cambiato, o manca;
      · un suo parametro e' cambiato;
      · una sua USCITA non e' piu' quella che il passo aveva scritto — cioe' qualcuno l'ha
        rigenerata fuori da qui: E' LA TRAPPOLA DELLA PARTIZIONE, trasformata in una riga di piano;
      · un passo A MONTE e' da rifare e riscrivera' un file che questo legge (la propagazione E' PER
        FILE, non per nome: e' quello che il 15/10/2026 sarebbe servito).
    """
    manifest = manifest if manifest is not None else (json.loads(MANIFEST.read_text(encoding="utf-8"))
                                                      if MANIFEST.exists() else {})
    fuori, sporco = {}, set()
    for i, p in enumerate(passo):
        ora = stato_di(p)
        prima, motivi = manifest.get(p["nome"], {}).get("stato"), []
        if prima is None:
            motivi.append("mai eseguito")
        else:
            # QUI C'ERA UN CONTROLLO IN PIU', E L'HO TOLTO: «per ogni pattern di `scrive` che non
            # corrisponde a nessun file, il passo e' sporco». Idea giusta, effetto disastroso — un
            # passo con un'uscita OPZIONALE o dichiarata male restava sporco PER SEMPRE, anche dopo
            # `--registra`, e il piano non tornava piu' a zero. Un controllo che non si puo' azzerare
            # e' peggio di nessun controllo: insegna a ignorare il piano.
            # I due casi veri restano coperti: una uscita CANCELLATA la prende il ciclo qui sotto
            # («uscita sparita»), e una uscita che il passo non produce la dice `--esegui` quando
            # finisce (il controllo `mancanti`).
            for nome, h in ora["ingressi"].items():
                if nome not in prima["ingressi"]:
                    motivi.append(f"ingresso nuovo: {nome}")
                elif prima["ingressi"][nome] != h:
                    motivi.append(f"ingresso cambiato: {nome}")
            for nome, h in prima["ingressi"].items():
                if nome not in ora["ingressi"]:
                    motivi.append(f"ingresso sparito: {nome}")
            for k, v in ora["parametri"].items():
                if prima["parametri"].get(k) != v:
                    motivi.append(f"parametro cambiato: {k} ({prima['parametri'].get(k)} -> {v})")
            for nome, h in prima.get("uscite", {}).items():
                if nome not in ora["uscite"]:
                    motivi.append(f"uscita sparita: {nome}")
                elif ora["uscite"][nome] != h:
                    motivi.append(f"uscita RISCRITTA FUORI DA QUI: {nome}")
        monte = []
        for q in passo:
            if q["nome"] not in sporco or q["nome"] == p["nome"]:
                continue
            # I NOMI DELLE USCITE DI `q`: quelli su disco E quelli che il manifest aveva registrato.
            # Il secondo insieme e' quello che conta quando un file e' stato CANCELLATO — senza,
            # `_file_di` restituisce [] e il passo a valle non sa che il suo input sta per cambiare.
            suoi = {f.name for pat in q["scrive"] for f in _file_di(pat)}
            suoi |= set(manifest.get(q["nome"], {}).get("stato", {}).get("uscite", {}))
            letti = {f.name for pat in p["legge"] for f in _file_di(pat)}
            if suoi & letti:
                monte.append(f"a monte {q['nome']} riscrivera' {', '.join(sorted(suoi & letti)[:4])}")
        motivi.extend(monte)
        fuori[p["nome"]] = {"da_fare": bool(motivi), "motivi": motivi, "tempo": p["tempo"]}
        if motivi:
            sporco.add(p["nome"])
    return fuori


def build(args) -> int:
    """IL PIANO, e — solo con `--esegui` — l'esecuzione. Vedi `PASSO` e `piano()`."""
    import os
    import subprocess
    if getattr(args, "registra", False):
        # REGISTRA LO STATO ATTUALE come costruzione fatta. Serve a chi adotta il DAG su un repo che ha
        # gia' i suoi artefatti: non si ricostruiscono trenta minuti per poter dire «sono aggiornato».
        # ED E' UNA DICHIARAZIONE, non una verifica: registra che QUESTI file hanno QUESTI hash e che
        # QUESTI parametri valgono ORA. Se gli artefatti sono piu' vecchi dei parametri, il manifest
        # mente — e il piano, da li' in poi, non lo scoprira'. Va usato una volta, e sapendo cosa dice.
        m = {}
        print("REGISTRO LA COSTRUZIONE ATTUALE — e' una dichiarazione, non una verifica:\n")
        for p in PASSO:
            s = stato_di(p)
            u = sum(len(v) for v in [s["uscite"]])
            print(f"  {p['nome']:<20} {u} uscite · {len(s['ingressi'])} ingressi · "
                  f"parametri {', '.join(p['params']) or '-'}")
            m[p["nome"]] = {"stato": s, "quando": time.strftime("%Y-%m-%d %H:%M") + " (registrata)"}
        MANIFEST.write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"\n  manifest: {MANIFEST}")
        return 0
    piano_ = piano()
    if not getattr(args, "esegui", False):
        print("PIANO DELLA COSTRUZIONE — niente e' stato eseguito (aggiungi --esegui per farlo)\n")
        for p in PASSO:
            d = piano_[p["nome"]]
            if not d["da_fare"]:
                print(f"  salto  {p['nome']:<20} ({p['tempo']})")
                continue
            print(f"  RIFAI  {p['nome']:<20} ({p['tempo']})")
            for m in d["motivi"]:
                print(f"           perche': {m}")
        print(f"\n  da rifare: {sum(1 for d in piano_.values() if d['da_fare'])} su {len(PASSO)}")
        return 0
    manifest = (json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {})
    for p in PASSO:
        if not piano(manifest)[p["nome"]]["da_fare"]:
            print(f"  salto  {p['nome']}")
            continue
        cmd = [sys.executable] + [str(DATA.parent / c) if c.endswith(".py") else c for c in p["cmd"]]
        print(f"  eseguo {p['nome']}: {' '.join(p['cmd'])} (env {p['env'] or '-'})", flush=True)
        env = {**os.environ, **p["env"]}
        r = subprocess.run(cmd, env=env, cwd=str(DATA.parent.parent))
        if r.returncode != 0:
            print(f"  FERMO: {p['nome']} e' uscito con {r.returncode}. Il manifest non lo registra.")
            return r.returncode
        stato = stato_di(p)
        mancanti = [u for pat in p["scrive"] for u in [pat] if not _file_di(pat)]
        if mancanti:
            print(f"  ATTENZIONE: {p['nome']} e' uscito bene ma non ha scritto {mancanti}")
        manifest[p["nome"]] = {"stato": stato, "quando": time.strftime("%Y-%m-%d %H:%M")}
        MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n  manifest: {MANIFEST}")
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
    ppar = sub.add_parser("parita", help="il golden della parita' Python <-> JavaScript")
    ppar.add_argument("--fuori", default="tests/fixtures/parita.json")
    ppar.set_defaults(fn=parita)
    pbu = sub.add_parser("build", help="il piano della costruzione, e con --esegui anche l'esecuzione")
    pbu.add_argument("--esegui", action="store_true",
                     help="esegue davvero (senza, stampa solo il piano: e' l'output di default)")
    pbu.add_argument("--registra", action="store_true",
                     help="registra lo stato ATTUALE come costruzione fatta (dichiarazione, non verifica)")
    pbu.set_defaults(fn=build)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
