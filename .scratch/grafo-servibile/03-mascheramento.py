"""03-mascheramento.py — TICKET 03: il mascheramento comportamentale a tempo T.

Il problema dichiarato: il grafo «conosce il futuro». CF e' costruito su cronologie COMPLETE di
utenti disgiunti, quindi un film uscito a T+1 mese ha gia' migliaia di archi accumulati nei due
anni successivi. Nel test temporale quegli archi erano informazione che l'utente non poteva avere.

IL MASCHERAMENTO (livello 1, quello che costa zero):
  per l'utente u tagliato a T_u, i titoli usciti dopo `T_u - 90 giorni` NON TRASMETTONO: la loro
  riga e' esclusa dalla propagazione. Ed e' escluso dal cesto ogni titolo uscito dopo T_end
  (la fine della finestra di test): non poteva essere consigliato.

Perche' si fa sull'istante della camminata e non ricostruendo il grafo: `M.T @ (vivo * X)` e' la
riga mascherata, esattamente, senza toccare la matrice. Il controllo di degenerazione (`vivo`
tutto vero) deve dare numeri IDENTICI AL BIT: se non li da', la macchina del mascheramento
distorce e i numeri non valgono.

LIMITE DICHIARATO: il mascheramento e' sulla propagazione, non sulla costruzione. La correzione
d'hub resta quella calcolata sul grafo intero (altrimenti servirebbe un grafo per utente), e i
titoli freschi perdono anche gli archi strutturali — e' piu' severo del necessario. La variante
fine (strutturali vivi, comportamentali ciechi) e' il territorio del ticket 16.

Uso:  python .scratch/grafo-servibile/03-mascheramento.py [ml|trakt|tutto]
"""
import glob, json, pathlib, sys, time
import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

QUALI = sys.argv[1] if len(sys.argv) > 1 else "tutto"
if QUALI == "trakt":
    sys.exit("il banco Trakt NON e' implementato in questo script: il ticket 03 e' stato chiuso sul\n"
             "banco prodotto (MovieLens), dove il protocollo temporale e le date esistono gia'.\n"
             "Per il banco Trakt le date stanno in `last_watched_at` e il protocollo e' in\n"
             "`temporale.py`: aggiungerlo qui e' lavoro del ticket 03-bis, non di questo.")
if QUALI == "tutto":
    QUALI = "ml"
    print("nota: la parte Trakt non e' implementata, si esegue il solo banco prodotto")
GIORNO = 86_400
NS = (10, 100, 500, 2000)
t0 = time.time()

keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
IDX_SERIE = np.where(is_tv)[0]
voti = K.voti()
uscite = np.load(K.ML / "uscite.npz")["giorni"]          # giorni dal 1970, -1 = ignota
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])
fas_serie = np.full(n, -1, np.int8)
fas_serie[IDX_SERIE] = K.fasce(voti[IDX_SERIE])
si_serie = np.zeros(n)
si_serie[IDX_SERIE] = K.auto_informazione(voti[IDX_SERIE])

print("=" * 100)
print("TICKET 03 — il mascheramento comportamentale a tempo T")
print("=" * 100)
print(f"  titoli con una data d'uscita: {int((uscite>0).sum()):,} su {n:,} "
      f"({100*(uscite>0).mean():.1f}%) — le date ignote NON si mascherano mai")


def rwr_mascherato(M, E, alpha, vivo, iters=20):
    """La camminata canonica, con i titoli non-`vivo` che non trasmettono.

    `vivo` ha la forma (n,) per un utente o (n, k) per un lotto. Con `vivo` tutto vero questa
    funzione e' la `rwr` del modulo canonico: la moltiplicazione per 1.0 e' esatta in float32.
    """
    V = vivo[:, None] if vivo.ndim == 1 else vivo
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ (V * X)) + (1 - alpha) * E
    return X


def tre_numeri(R, gold_di, chiavi, fas, si, etichetta, ns=NS):
    g = K.recall_stratificato_oro(R, gold_di, chiavi, fas, ns)
    K.stampa_strati(etichetta, g)
    for gamma in (0.5, 1.0):
        d = K.recall_si_oro(R, gold_di, chiavi, si, gamma, ns)
        print(f"  {'':<46} {'auto-inf g=' + str(gamma):>11}  "
              + " · ".join(f"@{N} {v:6.2f}%" for N, v in d.items()), flush=True)
    return g


def recall_per_freschezza(R, PROF, ORO, US, fresca, ns=(10, 100, 500)):
    """La recall separata per oro FRESCO (uscito nella finestra di test) e oro STABILE."""
    out = {}
    for et, m in (("fresche", fresca), ("stabili", ~fresca)):
        per_n = {}
        for N in ns:
            hit = den = 0
            for j, u in enumerate(US):
                gg = np.array(sorted(ORO[u]), dtype=np.int64)
                gg = gg[m[gg]]
                if len(gg) == 0:
                    continue
                den += len(gg)
                top = np.argsort(R[IDX_FILM, j])[:N]
                hit += int(np.isin(IDX_FILM[top], gg).sum())
            per_n[N] = 100 * hit / max(den, 1)
        out[et] = per_n
    return out


# ====================================================================  1. MOVIELENS
if QUALI in ("tutto", "ml"):
    print("")
    print("=" * 100)
    print("1. MOVIELENS — il banco prodotto, split temporale, con e senza mascheramento")
    print("=" * 100)
    cache = K.ML / "tempi-ml.parquet"
    if not cache.exists():
        print("  estrazione delle date dal ratings.csv grezzo (una volta sola, ~5 min) ...", flush=True)
        links = pd.read_csv(K.ML / "ml-32m" / "links.csv")
        m2r = {}
        for mid, tid in zip(links["movieId"], links["tmdbId"]):
            if pd.isna(tid):
                continue
            r = row_of.get(f"movie:{int(tid)}")
            if r is not None:
                m2r[int(mid)] = r
        cnt = {}
        for ch in pd.read_csv(K.ML / "ml-32m" / "ratings.csv", usecols=["userId", "movieId"],
                              chunksize=4_000_000):
            for u, m in zip(ch.userId.values, ch.movieId.values):
                cnt[u] = cnt.get(u, 0) + 1
        buoni = np.array([u for u, c in cnt.items() if c >= 20])
        SCELTI = np.random.default_rng(9).choice(buoni, size=2000, replace=False)
        voglio = set(int(x) for x in SCELTI[:1000])
        print(f"  utenti con >=20 film: {len(buoni):,} · presi i primi 1000 ({time.time()-t0:.0f}s)", flush=True)
        RIGHE = []
        for ch in pd.read_csv(K.ML / "ml-32m" / "ratings.csv", chunksize=4_000_000):
            ch = ch[ch.userId.isin(voglio)]
            if len(ch):
                RIGHE.append(ch)
        RR = pd.concat(RIGHE)
        RR["row"] = RR.movieId.map(m2r)
        RR = RR[RR.row.notna()]
        RR = RR[["userId", "row", "timestamp"]].copy()
        RR["row"] = RR["row"].astype(np.int64)
        RR.to_parquet(cache)
        print(f"  salvato {cache.name}: {len(RR):,} righe ({time.time()-t0:.0f}s)", flush=True)
    RR = pd.read_parquet(cache)
    PROF, ORO, TU, TE = {}, {}, {}, {}
    for u, g in RR.groupby("userId"):
        g = g.sort_values("timestamp")
        righe = g["row"].values.astype(np.int64)
        ts = g["timestamp"].values.astype(np.int64)
        if len(righe) < 20:
            continue
        t = int(0.6 * len(righe))
        PROF[u] = righe[:t]
        ORO[u] = set(righe[t:].tolist())
        TU[u] = ts[t - 1]          # l'ultimo istante del profilo = il taglio
        TE[u] = ts[-1]             # la fine della finestra di test
    US = np.array(list(PROF.keys()))
    print(f"  {len(US)} utenti con split temporale ({time.time()-t0:.0f}s)")
    lim = np.array([TU[u] // GIORNO - 90 for u in US])         # il giorno-limite del mascheramento
    fine = np.array([TE[u] // GIORNO for u in US])
    VIVO = (uscite[:, None] <= lim[None, :]) | (uscite[:, None] < 0)
    ESCL = uscite[:, None] > fine[None, :]
    aff = n - VIVO.sum(0)
    print(f"  titoli ciechi per utente: mediana {int(np.median(aff)):,} · min {int(aff.min()):,} · "
          f"max {int(aff.max()):,}")
    print(f"  titoli esclusi dal cesto: mediana {int(np.median(ESCL.sum(0))):,}")

    CMP = K.Componenti(n)
    C = CMP(30)
    MF = K.costruisci(C, {"CF": 1}, wc=0.0, beta=0.25)
    print(f"  grafo FILM (CF solo, k30, beta 0.25): {MF.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0

    print("  camminata NON mascherata ...", flush=True)
    X0 = K.rwr(MF, E, 0.30)
    for j, u in enumerate(US):
        X0[PROF[u], j] = -1e9
    R0 = K.ranghi(X0, ~is_tv)
    r0 = K.recall_film(R0, US, PROF, ORO, IDX_FILM)
    K.stampa("NON mascherata  (deve riprodurre 2,87/18,21/46,14/77,93)", r0)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

    print("  controllo no-op: `rwr_mascherato` con `vivo` tutto vero contro la `rwr` CANONICA ...",
          flush=True)
    Xn = rwr_mascherato(MF, E, 0.30, np.ones((n, len(US)), bool))
    for j, u in enumerate(US):
        Xn[PROF[u], j] = -1e9                     # STESSO trattamento di X0: senza, si confrontano
                                                  # due cose diverse (era il bug del primo giro)

    def uguali(A, B):
        if A.shape != B.shape:
            return False
        return bool(np.array_equal(A, B)) or float(np.abs(A - B).max()) < 1e-12

    rn = K.recall_film(K.ranghi(Xn, ~is_tv), US, PROF, ORO, IDX_FILM)
    K.stampa("no-op (`vivo` tutto vero)", rn)
    print(f"  >>> controllo no-op sulle matrici: "
          f"{'IDENTICO alla canonica' if uguali(X0, Xn) else 'DIVERSO — la macchina distorce'}")
    print(f"  >>> controllo no-op sulle recall: "
          f"{'IDENTICO' if all(abs(rn[N]-r0[N]) < 1e-9 for N in rn) else 'DIVERSO'}")
    print(f"  (identita' strutturale: moltiplicare per 1.0 in float32 e' esatto; questo controllo"
          f" serve a dimostrarlo SUI DATI, non solo sulla carta)")

    print("  camminata MASCHERATA ...", flush=True)
    X1 = rwr_mascherato(MF, E, 0.30, VIVO)
    for j, u in enumerate(US):
        X1[PROF[u], j] = -1e9
        X1[ESCL[:, j], j] = -1e9
    R1 = K.ranghi(X1, ~is_tv)
    r1 = K.recall_film(R1, US, PROF, ORO, IDX_FILM)
    K.stampa("MASCHERATA", r1)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

    # --- CONTROLLO PLACEBO: la stessa quantita' di archi tolti, ma a caso ---
    # Senza questo, «la mascherata peggiora» non distingue «toglie il futuro» da «toglie archi».
    print("  camminata PLACEBO (maschera casuale della stessa taglia) ...", flush=True)
    rng_pl = np.random.default_rng(23)
    VIVO_PL = np.ones_like(VIVO)
    for j in range(len(US)):
        quanti = int(aff[j])
        if quanti:
            VIVO_PL[rng_pl.choice(n, size=quanti, replace=False), j] = False
    X2 = rwr_mascherato(MF, E, 0.30, VIVO_PL)
    for j, u in enumerate(US):
        X2[PROF[u], j] = -1e9
    R2 = K.ranghi(X2, ~is_tv)
    r2 = K.recall_film(R2, US, PROF, ORO, IDX_FILM)
    K.stampa("PLACEBO (maschera casuale)", r2)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

    print("")
    print("  --- i tre numeri, non mascherata contro mascherata ---")
    tre_numeri(R0, ORO, US, fas_film, si_film, "NON mascherata")
    print("")
    tre_numeri(R1, ORO, US, fas_film, si_film, "MASCHERATA")

    print("")
    print("  --- l'oro FRESCO (uscito nella finestra di test) contro quello STABILE ---")
    fresca = np.zeros(n, bool)
    for j, u in enumerate(US):
        gg = np.array(sorted(ORO[u]), dtype=np.int64)
        fresca[gg] |= (uscite[gg] > TU[u] // GIORNO) & (uscite[gg] > 0)
    for et, R in (("NON mascherata", R0), ("MASCHERATA", R1)):
        d = recall_per_freschezza(R, PROF, ORO, US, fresca)
        print(f"  {et:<15} fresche " + " · ".join(f"@{N} {v:6.2f}%" for N, v in d["fresche"].items())
              + "   stabili " + " · ".join(f"@{N} {v:6.2f}%" for N, v in d["stabili"].items()), flush=True)

    print("")
    print("  --- il confronto che decide ---")
    print(f"  {'':<22} {'@10':>9} {'@100':>9} {'@500':>9} {'@2000':>9}")
    for et, R in (("mascherata", R1), ("placebo", R2)):
        d = K.recall_film(R, US, PROF, ORO, IDX_FILM)
        print(f"  {et:<22} " + " ".join(f"{r0[N]-d[N]:>+9.2f}" for N in (10, 100, 500, 2000))
              + "   (positivo = il non mascherato era OTTIMISTA di tanto)")
    print("")
    print("  >>> se il placebo si muove quanto la maschera vera, il mascheramento non toglie")
    print("      «il futuro»: toglie archi. E' la differenza che questo controllo esiste per fare.")
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

print(f"\nFINE ({time.time()-t0:.0f}s)")
