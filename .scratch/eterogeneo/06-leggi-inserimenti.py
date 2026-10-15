"""06-leggi-inserimenti.py — 100 collocazioni da leggere a occhio.

Istruzione dell'utente: «leggi 100 bolle e 100 inserimenti». Non basta il tasso di successo: si guarda
se il posto scelto ha senso.

Si prendono i titoli FUORI dal grafo — le uscite che il catalogo congelato non conosce — e si stampa
dove finiscono e chi c'e' dentro. Sono il caso vero: nessun comportamento, nessuna bolla scritta
addosso.
"""
import json, pathlib, sys
import numpy as np, pandas as pd, scipy.sparse as sp
QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "mappa-pesata"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import colloca_finale as CF
import bolle as B
import canone as K

S = CF.carica(v3=True)
S_v1 = CF.carica(v3=False)
# LA PARTIZIONE GIUSTA E' V8, non V10: i centroidi del collocatore (`04-*`) sono costruiti su V8, e
# le bolle non hanno id stabili fra partizioni — la bolla 1098 in V10 NON e' la 1098 in V8. Con V10 la
# prima lettura dava «Deadpool & Wolverine -> Bayside School, Kenan & Kel», che non e' un errore del
# collocatore ma un disallineamento mio. E' la stessa classe del contratto `assert_allineamento_spazi`.
# E' anche un problema ARCHITETTURALE vero, da scrivere nel report: passare a V10 richiede di rifare i
# centroidi, altrimenti si leggono i membri di un'altra partizione.
mem = np.load(K.ML / "bolle-nitrile-V8.npy")
sz = np.bincount(mem)
TIT, VOT = B.titoli_leggibili()
# i titoli dentro il grafo hanno una bolla in V10; gli altri no
HA = np.zeros(B.N, bool)
for (tp, i) in CF.PER_ID if hasattr(CF, "PER_ID") else []:
    pass
PQ = pathlib.Path(".cache/tmdb")
def anno_di(dd, col):
    """L'anno, senza crashare su `nan`: `str(NaN)[:4]` e' la stringa "nan" e `int("nan")` solleva.
    E' il terzo posto in cui inciampo sulla stessa cosa, quindi ora e' una funzione."""
    v = dd.get(col)
    try:
        a = int(str(v)[:4])
        return a if 1800 < a < 2100 else 0
    except Exception:
        return 0


righe = []
# I due parquet hanno colonne diverse — la lezione che continuo a ripetere: `title`/`release_date`
# per i film, `name`/`first_air_date` per le serie.
PARQ = {"movie": ("movies.parquet", "title", "release_date"),
        "tv": ("tv.parquet", "name", "first_air_date")}
# Le colonne che servono al tokenizzatore PIU' l'anno e i voti. Non tutte: il parquet intero e' ~2 GB
# e con un job pesante in background va in MemoryError. Ma nemmeno quattro, che era il bug di prima:
# `colloca()` vive di keyword, generi, cast, registi, reti, case, paesi.
COLS_TIPO = {
    "movie": ("movies.parquet", "title", "release_date",
              ["keywords", "genres", "production_companies", "production_countries",
               "original_language", "cast", "directors"]),
    "tv": ("tv.parquet", "name", "first_air_date",
           ["keywords", "genres", "networks", "production_companies", "production_countries",
            "original_language", "cast", "created_by"]),
}
for typ, (f, col, coldata, extra) in COLS_TIPO.items():
    d = pd.read_parquet(PQ / f, columns=["id", col, "vote_count", coldata] + extra)
    for r in d.itertuples(index=False):
        dd = r._asdict()
        riga = B.ROW_OF.get(f"{typ}:{int(dd['id'])}")
        v = int(dd.get("vote_count") or 0)
        if v < 20:
            continue
        anno = anno_di(dd, coldata)
        righe.append((anno, typ, dd, riga))
recenti = [x for x in righe if x[0] >= 2024]
recenti.sort(key=lambda z: -int(z[2].get("vote_count") or 0))
print(f"=== 100 uscite 2024+ con >= 20 voti, collocate e lette ===")
print()
for n, (anno, typ, dd, riga) in enumerate(recenti[:100], 1):
    if riga is not None:
        b = int(mem[riga]); conf = None
    else:
        b, conf, _, _ = CF.colloca(dd, typ, S, S_macro=S_v1)
    nome = str(dd.get("title") or dd.get("name"))[:46]
    if b is None:
        print(f"{n:>3}. {nome} ({anno}) — NON collocabile")
        continue
    m_ = np.where(mem == b)[0]
    o = np.argsort(-VOT[m_])[:4]
    dentro = " | ".join(TIT[x][:30] for x in m_[o])
    c = f" conf {conf:.2f}" if conf is not None else ""
    print(f"{n:>3}. {nome} ({anno}) -> bolla {b} ({int(sz[b])} tit.){c}")
    print(f"        dentro: {dentro}")
