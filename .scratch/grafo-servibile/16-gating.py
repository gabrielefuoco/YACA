"""16-gating.py — TICKET 16: il mixing condizionato al grado per i titoli nuovi.

Il problema: un titolo appena uscito o di nicchia si collega dodici volte peggio di uno noto. Il
pubblico previsto da solo porta +0,31 punti: spalma il titolo nuovo su un pubblico medio che non lo
descrive. Ma i componenti strutturali ci sono (keyword, cast, regia, firma produttiva) e coprono
molto. Il motivo per cui nell'ablation «facevano male» e' che su un titolo CALDO — che ha gia'
ottimi archi comportamentali — aggiungerli introduce rumore rispetto al comportamento vero.

Il rimedio: il blocco strutturale pesa per un fattore che va a ZERO sui nodi con comportamento forte
e a UNO sui nodi senza comportamento.

    lambda(i) = tau0 / (tau0 + d_behav(i))         d_behav = grado nei componenti comportamentali

E l'arco strutturale fra i e j sopravvive se ALMENO UNO dei due e' freddo (`max(lambda_i, lambda_j)`):
altrimenti un titolo nuovo non potrebbe agganciarsi a nessun film caldo — che e' esattamente cio'
per cui il gating esiste.

L'ESPERIMENTO, in una riga: la ricetta film del prodotto e' CF da solo. Qui si aggiunge il blocco
strutturale con il gating, e si spazza tau0. tau0=0 e' il gating estremo (solo i titoli a grado zero
prendono struttura), tau0->infinito e' «metadati dappertutto» — il caso che l'ablation dice dannoso,
e che qui deve essere riprodotto: e' il controllo della spiegazione.

Uso:  python .scratch/grafo-servibile/16-gating.py
"""
import pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

GIORNO = 86_400
NS = (10, 100, 500)
BETA = 0.25
t0 = time.time()

keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
voti = K.voti()
uscite = np.load(K.ML / "uscite.npz")["giorni"]
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])

# ------------------------------------------------------------------ il banco (come il ticket 15)
RR = pd.read_parquet(K.ML / "tempi-ml.parquet")
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
    TU[u] = ts[t - 1]
    TE[u] = ts[-1]
US = np.array(list(PROF.keys()))
lim = np.array([TU[u] // GIORNO - 90 for u in US])
fine = np.array([TE[u] // GIORNO for u in US])
VIVO = (uscite[:, None] <= lim[None, :]) | (uscite[:, None] < 0)
ESCL = uscite[:, None] > fine[None, :]
print(f"{len(US)} utenti · split temporale + mascheramento ({time.time()-t0:.0f}s)")

# ------------------------------------------------------------------ i componenti
CMP = K.Componenti(n)
C = CMP(30)
CF = C["CF"]
STRUTT = None
for nome, peso in (("CFst", 1.0), ("KW", 1.0), ("DIR", 1.0), ("CAST", 1.0), ("COLL", 1.0)):
    A = K.correggi_hub(C[nome] if nome in C else K.carica_csr(f"nuovo-{nome}.npz", n), BETA)
    STRUTT = A * peso if STRUTT is None else STRUTT + A * peso
CFn = K.correggi_hub(CF, BETA)
print(f"CF {CFn.nnz:,} archi · struttura {STRUTT.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

# il grado comportamentale: quanti vicini ha il titolo nel comportamento (binario)
BEHAV = None
for A in (CF, C["B"]):
    B0 = (A + A.T) > 0
    BEHAV = B0.astype(np.int32) if BEHAV is None else BEHAV + B0.astype(np.int32)
d_behav = np.asarray(BEHAV.sum(1)).ravel()
print(f"  d_behav: zero su {int((d_behav==0).sum()):,} titoli ({100*(d_behav==0).mean():.1f}%) · "
      f"mediana {int(np.median(d_behav))} · film a zero {int((d_behav[IDX_FILM]==0).sum()):,}")


def lambda_di(tau0):
    if tau0 <= 0:
        return (d_behav == 0).astype(np.float32)     # gating estremo: solo i titoli senza comportamento
    return (tau0 / (tau0 + d_behav)).astype(np.float32)


def grafo(lam):
    """CF + struttura pesata per max(lambda_i, lambda_j)."""
    Mc = STRUTT.tocoo()
    fatt = np.maximum(lam[Mc.row], lam[Mc.col]).astype(np.float32)
    S = sp.csr_matrix((Mc.data * fatt, (Mc.row, Mc.col)), shape=(n, n))
    return K.normalizza((CFn + S).tocsr())


# ------------------------------------------------------------------ il giro
print("")
print("=" * 112)
print("IL GATING — formato: @N  globale/mezzo+coda/auto-informazione   (temporale, con mascheramento)")
print("=" * 112)
print("  il banco e' lo stesso del ticket 15: la riga RIF (CF da solo) deve riprodurre 2,89/18,94/47,78")
print("")

# le fasce d'oro per il grado comportamentale: freddo = il quartile piu' basso di d_behav
gradi_oro = np.concatenate([d_behav[np.fromiter(ORO[u], np.int64, len(ORO[u]))] for u in US])
soglia_freddo = float(np.quantile(gradi_oro, 0.25))
print(f"  soglia «freddo» sul grado dei titoli d'oro: d_behav <= {soglia_freddo:.0f} "
      f"({100*np.mean(gradi_oro<=soglia_freddo):.1f}% dell'oro)")
freddo_oro = {u: {x for x in ORO[u] if d_behav[x] <= soglia_freddo} for u in US}
caldo_oro = {u: {x for x in ORO[u] if d_behav[x] > soglia_freddo} for u in US}
print(f"  oro freddo {sum(len(v) for v in freddo_oro.values()):,} · "
      f"caldo {sum(len(v) for v in caldo_oro.values()):,}")
print("")


def misura(M, etichetta):
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ (VIVO * X)) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
        X[ESCL[:, j], j] = -1e9
    R = K.ranghi(X, ~is_tv)
    g = K.recall_film(R, US, PROF, ORO, IDX_FILM, NS)
    rk, fb, si = [], [], []
    for j, u in enumerate(US):
        gg = np.fromiter(ORO[u], np.int64, len(ORO[u]))
        rk.append(R[gg, j]); fb.append(fas_film[gg]); si.append(si_film[gg])
    rk, fb, si = np.concatenate(rk), np.concatenate(fb), np.concatenate(si)
    mc = K.per_fascia(rk, fb, NS)["mezzo+coda"]
    ainf = K.recall_si(rk, si, 1.0, NS)
    fr = K.recall_film(R, US, PROF, freddo_oro, IDX_FILM, NS)
    ca = K.recall_film(R, US, PROF, caldo_oro, IDX_FILM, NS)
    print(f"  {etichetta:<26} " + " · ".join(
        f"@{N} {g[N]:5.2f}/{mc[N]:5.2f}/{ainf[N]:5.2f}" for N in NS), flush=True)
    print(f"  {'':<26} oro FREDDO " + " · ".join(f"@{N} {fr[N]:5.2f}%" for N in NS)
          + "   oro CALDO " + " · ".join(f"@{N} {ca[N]:5.2f}%" for N in NS), flush=True)
    return {"globale": g, "mc": mc, "si": ainf, "freddo": fr, "caldo": ca}


ris = {}
ris[0.0] = misura(grafo(lambda_di(0.0)), "tau0=0  (gating estremo)")
ris[1.0] = misura(grafo(lambda_di(1.0)), "tau0=1")
ris[5.0] = misura(grafo(lambda_di(5.0)), "tau0=5")
ris[20.0] = misura(grafo(lambda_di(20.0)), "tau0=20")
ris[100.0] = misura(grafo(lambda_di(100.0)), "tau0=100")
ris[1e9] = misura(grafo(lambda_di(1e9)), "tau0=inf  (metadati ovunque)")

# ------------------------------------------------------------------ i controlli
print("")
print("  --- controlli (con l'esclusione del profilo e del cesto, come la camminata) ---")


def misura_fissa(base, etichetta):
    """La recall di una classifica FISSA: un rango per utente, niente matrici grandi."""
    b = base.astype(np.float32).copy()
    b[is_tv] = -1e30
    hit = {k: np.zeros(len(NS)) for k in ("glob", "freddo", "caldo")}
    den = {k: 0 for k in hit}
    for j, u in enumerate(US):
        s = b.copy()
        s[PROF[u]] = -1e30
        s[ESCL[:, j]] = -1e30
        rank = np.empty(n, np.int32)
        rank[np.argsort(-s, kind="stable")] = np.arange(n, dtype=np.int32)
        for chiave, D in (("glob", ORO), ("freddo", freddo_oro), ("caldo", caldo_oro)):
            g = D[u]
            if not g:
                continue
            gg = np.fromiter(g, np.int64, len(g))
            rk = rank[gg]
            for i, N in enumerate(NS):
                hit[chiave][i] += float((rk < N).sum())
            den[chiave] += len(g)
    print(f"  {etichetta:<26} " + " · ".join(
        f"@{N} {100*hit['glob'][i]/max(den['glob'],1):5.2f}%" for i, N in enumerate(NS)))
    print(f"  {'':<26} oro FREDDO " + " · ".join(
        f"@{N} {100*hit['freddo'][i]/max(den['freddo'],1):5.2f}%" for i, N in enumerate(NS))
        + "   oro CALDO " + " · ".join(
        f"@{N} {100*hit['caldo'][i]/max(den['caldo'],1):5.2f}%" for i, N in enumerate(NS)))


misura_fissa(np.tile(voti[:, None], (1, len(US))).astype(np.float32), "popolarita' (controllo)")
misura_fissa(-np.tile(np.arange(n, dtype=np.float32)[:, None], (1, len(US))), "ordine di indice (controllo)")

# ------------------------------------------------------------------ il confronto
print("")
print("=" * 112)
print("COSA CAMBIA")
print("=" * 112)
print(f"  {'':<26} {'@10':>22} {'@100':>22} {'@500':>22}")
for tau, d in ris.items():
    print(f"  tau0={str(tau):<20} "
          + " ".join(f"glob {d['globale'][N]-ris[0.0]['globale'][N]:+5.2f} freddo "
                     f"{d['freddo'][N]-ris[0.0]['freddo'][N]:+5.2f} caldo "
                     f"{d['caldo'][N]-ris[0.0]['caldo'][N]:+5.2f}" for N in NS))
print("  (differenze rispetto a tau0=0, il gating estremo)")
print(f"\nFINE ({time.time()-t0:.0f}s)")
