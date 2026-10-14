"""colloca.py — la collocazione di un titolo nuovo, in un posto solo.

Riusa quello che hanno prodotto i ticket 01 e 02:
  · `features.py` — la costruzione di FX coi vocabolari congelati
  · `inserimento-modello.npz` — la Ridge salvata
  · `bolle-nitrile-V7.npy` — la partizione

E aggiunge la parte strutturale: gli archi KW/CAST/DIR di un titolo nuovo, ricavati dalla stessa
matrice di feature (gerarchia keyword + generi + persone), e il gating del ticket 16.

Misurato nel ticket 02, e va ricordato SEMPRE: questa proiezione recupera la **struttura dei
metadati**, non il comportamento. La Parte A del ticket 02 l'ha misurato: 0,0% di vicini in comune
con lo spazio CF. La collocazione semantica invece e' 8 su 8.
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import features as F

ML = F.ML
TAU0 = 5.0          # il plateau misurato nel ticket 16 di `grafo-servibile`
K_VICINI = 30

STATO = {}


def carica():
    """Tutto quello che serve, una volta sola."""
    if STATO:
        return STATO
    cat = F.carica_catalogo()
    cat2, is_tv = F.arricchisci(cat)
    voc = F.costruisci_vocabolari(cat2, is_tv)
    FX, _, _ = F.costruisci_fx(cat, voc)
    from sklearn.feature_extraction.text import TfidfTransformer
    from sklearn.preprocessing import normalize
    tf = TfidfTransformer().fit(FX)
    STATO["cat"] = cat
    STATO["voc"] = voc
    STATO["FX"] = FX
    STATO["tf"] = tf
    STATO["norm"] = normalize
    STATO["Sf"] = normalize(tf.transform(FX)).astype(np.float32)
    v = np.load(ML / "inserimento-modello.npz")
    STATO["coef"], STATO["interc"] = v["coef"], v["intercept"]
    STATO["P"] = np.load(ML / "cf-studente.npz")["P"]
    STATO["Pn"] = STATO["P"] / (np.linalg.norm(STATO["P"], axis=1, keepdims=True) + 1e-9)
    STATO["Cf"] = np.load(ML / "cf-spazio.npz")["Cf"]
    STATO["ha"] = np.linalg.norm(STATO["Cf"], axis=1) > 1e-6
    STATO["mem"] = np.load(ML / "bolle-nitrile-V7.npy")
    STATO["sz"] = np.bincount(STATO["mem"])
    import bolle as B
    STATO["B"] = B
    STATO["TIT"], STATO["VOT"] = B.titoli_leggibili()
    # quali colonne di FX NON sono numeriche: servono per la similarita' strutturale
    n_num = 5 + 3                      # 5 numeriche + rating + budget + incassi
    larg_num = STATO["FX"].shape[1]
    STATO["col_struttura"] = np.arange(larg_num - n_num)
    return STATO


def riga_da_tmdb(d, tipo="movie"):
    """Una riga di FX dai metadati TMDB di UN titolo (il formato del dump)."""
    s = carica()
    voc = s["voc"]
    d = dict(d)
    d["type"] = tipo
    d["date"] = d.get("release_date") if tipo == "movie" else d.get("first_air_date")
    d["year"] = pd.to_numeric(str(d.get("date"))[:4], errors="coerce")
    d["kwn"] = [str(k.get("name", "")).lower()
                for k in json.loads(d.get("keywords") or "[]") if isinstance(k, dict)]
    d["countries"] = []
    regia = d.get("directors") if tipo == "movie" else d.get("created_by")
    d["people"] = F.jids(d.get("cast"), "id")[:8] + F.jids(regia, "id")
    d["colls"] = [] if pd.isna(d.get("collection_id")) else [int(d["collection_id"])]
    d["gm"] = F.mapg(d.get("genres") or "[]", tipo == "tv")
    d["companies"] = F.jids(d.get("production_companies"), "id")
    d["writers"] = F.jids(d.get("writers"), "id")
    d["spoken"] = []
    if not d.get("bayes"):
        vc = float(d.get("vote_count") or 0)
        va = float(d.get("vote_average") or 0)
        d["bayes"] = (vc * va + 250.0 * 6.5) / (vc + 250.0) if vc else 0.0
    d["_rating"] = 1.0 if str(d.get("content_rating") or "").upper() in ("R", "NC-17", "TV-MA") else 0.0
    d["_budget"] = float(np.log1p(d.get("budget") or 0))
    d["_revenue"] = float(np.log1p(d.get("revenue") or 0))
    cb, vb = F._righe_una(d, voc, F._numeriche(d))
    return sp.csr_matrix((np.asarray(vb, np.float32), ([0] * len(cb), cb)),
                         shape=(1, s["FX"].shape[1])).tocsr()


def proietta(riga_fx):
    """Il vettore nello spazio del comportamento previsto."""
    s = carica()
    tn = s["norm"](s["tf"].transform(riga_fx)).astype(np.float32)
    p = (np.asarray(tn @ s["coef"].T) + s["interc"]).astype(np.float32)[0]
    return p / (np.linalg.norm(p) + 1e-9)


def colloca(p, quanti=K_VICINI):
    """I vicini e la bolla votata."""
    s = carica()
    v = s["Pn"] @ p
    v[~s["ha"]] = -9
    ordine = np.argsort(-v)
    vicini = ordine[:quanti]
    conta = {}
    for x in vicini:
        conta[int(s["mem"][x])] = conta.get(int(s["mem"][x]), 0) + 1
    bolla, voti = max(conta.items(), key=lambda z: z[1])
    return vicini, bolla, voti, conta


def archi_strutturali(riga_fx, k=K_VICINI, min_sim=0.05):
    """Gli archi KW/CAST/DIR di un titolo nuovo: la similarita' coseno sulle colonne NON numeriche.

    Sono le stesse colonne che alimentano il modello (gerarchia keyword, generi, cast, regia,
    compagnie, sceneggiatori), quindi la stessa vista strutturale che il grafo usa.
    """
    s = carica()
    FX = s["FX"]
    # ⚠️ Si usa la TF-IDF, non la matrice grezza: sulla grezza il coseno e' dominato dalle colonne
    # generiche condivise (genere, lingua, le categorie L1), e dava 0,86 con TUTTO — i primi 30
    # archi erano talk show e reality. L'IDF e' quello che rende discriminante la similarita', ed e'
    # quello che fanno i componenti veri del grafo.
    tn = s["norm"](s["tf"].transform(riga_fx)).astype(np.float32)
    nuovo = tn[:, s["col_struttura"]].tocsr()
    cat = s["Sf"][:, s["col_struttura"]].tocsr()
    nor_c = np.sqrt(np.asarray(cat.multiply(cat).sum(1)).ravel()) + 1e-9
    nor_n = float(np.sqrt(np.asarray(nuovo.multiply(nuovo).sum(1)).ravel()[0])) + 1e-9
    sim = (cat @ nuovo.T).toarray().ravel() / (nor_c * nor_n)
    ordine = np.argsort(-sim)
    fuori = []
    for r in ordine[:k]:
        if sim[r] > min_sim:
            fuori.append((int(r), float(sim[r])))
    return fuori, sim


def gating(d_behav, tau0=TAU0):
    """`lambda(i) = tau0 / (tau0 + d_behav(i))`: 1.0 per un titolo freddo, ~0 per uno caldo."""
    return float(tau0 / (tau0 + float(d_behav)))
