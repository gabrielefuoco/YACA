"""colloca-finale.py — TICKET 04A: il collocatore in una funzione sola.

Dato un titolo nuovo (i suoi metadati TMDB), restituisce la bolla. E' la sintesi di tutto l'effort:

    token dai metadati -> vettore TF-IDF col vocabolario CONGELATO -> coseno contro i centroidi
    -> la regola di medium -> (bolla, confidenza)

Le scelte, ognuna misurata altrove e non ri-discussa qui:
  · **coseno**, non prodotto scalare (ticket 05 di `todo-grafo`: 35,3% contro 29,7%);
  · **pesi uniformi** dei membri (ticket 05: il peso per grado interno peggiora);
  · **leave-one-out** nel banco, NON qui: in produzione il titolo non e' membro di nessuna bolla,
    quindi il problema non esiste. Il LOO serviva a non autoconfermarsi in laboratorio;
  · **regola di medium C** (ticket 03 di questo effort): fra le bolle-serie si sceglie sempre; una
    bolla-film e' ammessa solo se batte il migliore candidato-serie di un margine. +1% misurato.

L'idf si RICALCOLA dalla matrice invece di essere salvato, e la cosa va sottolineata: `04-vocab.json`
ha i termini, non gli idf. In produzione il vocabolario e gli idf devono essere **congelati insieme**,
altrimenti i centroidi e le query non parlano la stessa lingua. Qui si ricava `df` dai non-zero della
matrice, che e' esatto.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

ML = K.ML
MARGINE = 1.0          # il film deve battere il migliore serie di questo fattore (ticket 03)
PREFISSO = {"keywords": "kw:", "genres": "ge:", "networks": "rt:", "production_companies": "co:",
            "production_countries": "pa:", "original_language": "lg:",
            "cast": "ca:", "directors": "di:", "created_by": "di:"}
COLS = {
    "movie": ["id", "keywords", "genres", "production_companies", "production_countries",
              "original_language", "cast", "directors"],
    "tv": ["id", "keywords", "genres", "networks", "production_companies", "production_countries",
           "original_language", "cast", "created_by"],
}


def carica():
    """Gli artefatti congelati: vocabolario, idf, centroidi, partizione."""
    TFIDF = sp.load_npz(ML / "04-tfidf.npz").tocsr()
    vocab = json.load(open(ML / "04-vocab.json", encoding="utf-8"))
    C4 = np.load(ML / "04-centroidi.npz")
    P = np.load(ML / "mappa-pesata-6-2.npz", allow_pickle=True)
    bolle_serie, bolle_film = C4["bolle_serie"], C4["bolle_film"]
    # l'idf ricalcolato: df dai non-zero per colonna
    df = np.asarray((TFIDF > 0).sum(0)).ravel()
    idf = np.log(TFIDF.shape[0] / (1 + df))
    # le somme per bolla (sparse), e le norme
    ordine = np.argsort(P["mem"], kind="stable")
    confini = np.searchsorted(P["mem"][ordine], np.arange(len(P["sz"]) + 1))
    MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(len(P["sz"]))]
    TUTTE = np.concatenate([bolle_serie, bolle_film])
    r_, c_, v_ = [], [], []
    for k, b in enumerate(TUTTE):
        s = np.asarray(TFIDF[MEMBRI[b]].sum(0)).ravel()
        nz = np.nonzero(s)[0]
        r_.extend([k] * len(nz))
        c_.extend(nz.tolist())
        v_.extend(s[nz].tolist())
    SUM = sp.csr_matrix((v_, (r_, c_)), shape=(len(TUTTE), TFIDF.shape[1]), dtype=np.float32)
    NORMA = np.sqrt(np.asarray(SUM.multiply(SUM).sum(1)).ravel()) + 1e-9
    return dict(vocab=vocab, idf=idf, SUM=SUM, NORMA=NORMA, TUTTE=TUTTE,
                bolle_serie=set(int(x) for x in bolle_serie),
                bolle_film=set(int(x) for x in bolle_film),
                quota_tv=P["quota_tv"], mem=P["mem"], sz=P["sz"])


def tokenizza(dd, tipo="tv"):
    """I metadati di un titolo -> i token. La stessa forma del ticket 04."""
    import json as _j

    def leggi(s):
        try:
            v = _j.loads(s) if isinstance(s, str) else (s or [])
            return [x for x in v if isinstance(x, (dict, str))]
        except Exception:
            return []

    def nome(x, col):
        return x if isinstance(x, str) else str(x.get("name") or x.get("iso_3166_1") or "")

    out = set()
    for col, pre in PREFISSO.items():
        v = leggi(dd.get(col))
        if col == "cast":
            v = v[:10]
        for x in v:
            t = nome(x, col).strip()
            t = t.upper() if col == "production_countries" else t.lower()
            if t and len(t) > 1:
                out.add(pre + t)
    return out


def vettore(token, S):
    """Token -> vettore TF-IDF L2-normalizzato. I termini fuori vocabolario si buttano: e' il
    prezzo di un vocabolario congelato, ed e' dichiarato."""
    idx, val = [], []
    for t in token:
        j = S["vocab"].get(t)
        if j is not None:
            idx.append(j)
            val.append(S["idf"][j])
    if not idx:
        return None, 0
    v = sp.csr_matrix((val, ([0] * len(idx), idx)), shape=(1, S["SUM"].shape[1]), dtype=np.float32)
    n = float(np.sqrt(v.multiply(v).sum()))
    return v.multiply(1.0 / (n + 1e-9)), len(idx)


def colloca(dd, tipo, S, margine=MARGINE):
    """Il collocatore. Restituisce (bolla, confidenza, quante candidate, fuori vocabolario)."""
    tok = tokenizza(dd, tipo)
    v, n_dentro = vettore(tok, S)
    if v is None:
        return None, 0.0, 0, len(tok)
    cos = np.asarray((v @ S["SUM"].T).todense()).ravel() / S["NORMA"]
    j = int(np.argmax(cos))
    b = int(S["TUTTE"][j])
    # la regola di medium (ticket 03), SIMMETRICA: una serie preferisce le bolle-serie, un film le
    # bolle-film. La prima versione la applicava solo alle serie, e un film poteva atterrare in una
    # bolla di serie (Renegade Immortal -> bolla 479, 46 titoli di anime): meta' regola e' peggio di
    # nessuna regola, perche' nel prodotto i due cataloghi sono separati in tutte e due le direzioni.
    preferito = S["bolle_serie"] if str(tipo) == "tv" else S["bolle_film"]
    if b not in preferito:
        solo_del_suo = np.array([b2 in preferito for b2 in S["TUTTE"]])
        js = int(np.argmax(np.where(solo_del_suo, cos, -np.inf)))
        if cos[j] <= cos[js] * (1 + margine):
            j, b = js, int(S["TUTTE"][js])
    return b, float(cos[j]), len(tok), len(tok) - n_dentro


if __name__ == "__main__":
    T0 = time.time()
    print("=" * 100)
    print("TICKET 04A — IL COLLOCATORE, E QUANTO COSTA")
    print("=" * 100, flush=True)
    S = carica()
    print(f"  artefatti caricati: vocabolario {len(S['vocab']):,} termini · candidate "
          f"{len(S['TUTTE']):,} bolle ({len(S['bolle_serie']):,} serie + "
          f"{len(S['TUTTE'])-len(S['bolle_serie']):,} film) ({time.time()-T0:.0f}s)", flush=True)

    # ---- quanto costa
    PQ = K.ROOT / ".cache" / "tmdb"
    tv = pd.read_parquet(PQ / "tv.parquet")
    mv = pd.read_parquet(PQ / "movies.parquet")
    righe = [(tv.iloc[k].to_dict(), "tv") for k in range(50)] + \
            [(mv.iloc[k].to_dict(), "movie") for k in range(50)]
    t = time.time()
    for dd, tipo in righe:
        colloca(dd, tipo, S)
    dt = (time.time() - t) / len(righe)
    print(f"  costo: {1000*dt:.1f} ms per titolo su {len(righe)} titoli "
          f"({time.time()-T0:.0f}s)", flush=True)

    # ---- gli esempi
    print(f"\n  esempi, letti:")
    TIT = np.array([""] * len(S["mem"]), dtype=object)
    for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(PQ / f, columns=["id", col])
        for i, tt in zip(d["id"], d[col]):
            r = B.ROW_OF.get(f"{typ}:{int(i)}")
            if r is not None:
                TIT[r] = str(tt)

    def mostra(dd, tipo, perche):
        b, conf, ntok, fuori = colloca(dd, tipo, S)
        nome = str(dd.get("title") or dd.get("name"))[:40]
        if b is None:
            print(f"    {nome:<42} [{perche}] NIENTE: nessun termine nel vocabolario")
            return
        membri = [TIT[x][:22] for x in np.where(S["mem"] == b)[0][:4]]
        print(f"    {nome:<42} [{perche}] bolla {b} ({int(S['sz'][b])} tit., "
              f"{'serie' if S['quota_tv'][b] > 0.5 else 'film'}) · coseno {conf:.3f} · "
              f"{ntok} termini, {fuori} fuori vocabolario")
        print(f"        dentro: {membri}")

    for k in range(4):
        mostra(tv.iloc[k].to_dict(), "tv", "serie a caso")
    for k in range(3):
        mostra(mv.iloc[k].to_dict(), "movie", "film a caso")
    if (mv["id"] == 1283515).any():
        mostra(mv[mv["id"] == 1283515].iloc[0].to_dict(), "movie", "VERITY")
    print(f"\nFINE ({time.time()-T0:.0f}s)")
