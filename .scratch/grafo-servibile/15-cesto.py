"""15-cesto.py — TICKET 15: il cesto — semi con decadimento e allocazione multi-bolla.

Il collo di bottiglia non e' l'ordinamento, e' il CESTO: in un banco temporalmente onesto la
camminata perde il 50-64% al @10 e la popolarita' non si muove, quindi il problema non e' come
ordino ma cosa ho in mano. Due rimedi, misurati separatamente e poi insieme.

  (a) DECADIMENTO SUI SEMI. Peso uniforme sui titoli del profilo diluisce cio' che l'utente
      guardava *adesso* con cio' che guardava quattro anni fa. Peso: 2^(-(T_u - t_i)/tau),
      emivita tau fra 180 e 365 giorni. Con l'ETA' del titolo, non con la data di visione...
      no: con la data di visione, che e' quella che dice quando il gusto era vivo.

  (b) QUOTE MULTI-BOLLA. Un utente ha 3-5 filoni distinti. Una camminata unica premia i ponti
      generici a meta' strada fra i filoni. Rimedio: il cesto si riempie a QUOTE, proporzionali
      alla massa recente dell'utente in ogni bolla, invece che prendendo i primi K per punteggio
      (che e' la quota implicita "vince chi ha piu' punteggio").

MISURA: banco prodotto, split temporale, con il mascheramento del ticket 03 (e' il protocollo
onesto). I tre numeri del ticket 01: globale, mezzo+coda, auto-informazione.

Una precisazione onesta sul TETTO DEL CESTO. L'analisi parlava di «tetto raggiungibile al 12% al
@10 e il modello ne prende il 29%». Quella cifra viene dal catalogo SERIE, dove la pipeline ha due
stadi (un retriever e un ranker). Nel prodotto a uno stadio la camminata E' l'ordinamento, e allora
il tetto del cesto al @K e' per definizione la recall al @K: il numero sarebbe circolare. Qui il
cesto e' una scelta imposta — i primi 2.000 per punteggio — e quello che si misura e' se le quote lo
rendono **piu' denso d'oro** nella testa (@10/@100/@500), che e' la domanda non circolare.

Uso:  python .scratch/grafo-servibile/15-cesto.py
"""
import pathlib, sys, time
import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

GIORNO = 86_400
K_CESTO = 2000
NS = (10, 100, 500)
t0 = time.time()

keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
voti = K.voti()
uscite = np.load(K.ML / "uscite.npz")["giorni"]
bolla = np.load(K.ML / "bolle2-E.npy")
nb = int(bolla.max()) + 1
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])
print(f"partizione: {nb:,} bolle · film coperti da una bolla "
      f"{int((np.bincount(bolla[IDX_FILM])>0).sum()):,}/{nb:,}")

# ------------------------------------------------------------------ 1. il banco temporale
RR = pd.read_parquet(K.ML / "tempi-ml.parquet")
PROF, PROF_T, ORO, TU, TE = {}, {}, {}, {}, {}
for u, g in RR.groupby("userId"):
    g = g.sort_values("timestamp")
    righe = g["row"].values.astype(np.int64)
    ts = g["timestamp"].values.astype(np.int64)
    if len(righe) < 20:
        continue
    t = int(0.6 * len(righe))
    PROF[u] = righe[:t]
    PROF_T[u] = ts[:t]
    ORO[u] = set(righe[t:].tolist())
    TU[u] = ts[t - 1]
    TE[u] = ts[-1]
US = np.array(list(PROF.keys()))
print(f"{len(US)} utenti con split temporale ({time.time()-t0:.0f}s)")

lim = np.array([TU[u] // GIORNO - 90 for u in US])
fine = np.array([TE[u] // GIORNO for u in US])
VIVO = (uscite[:, None] <= lim[None, :]) | (uscite[:, None] < 0)
ESCL = uscite[:, None] > fine[None, :]

CMP = K.Componenti(n)
C = CMP(30)
MF = K.costruisci(C, {"CF": 1}, wc=0.0, beta=0.25)
print(f"grafo FILM: {MF.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)


def cammina(pesi_semi, maschera, descrizione):
    """La camminata con il mascheramento del ticket 03. `pesi_semi` e' una lista di (righe, pesi)."""
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        r, w = pesi_semi(u)
        E[r, j] = w
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (MF.T @ (maschera * X)) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    for j in range(len(US)):
        X[ESCL[:, j], j] = -1e9
    print(f"  camminata «{descrizione}» ({time.time()-t0:.0f}s)", flush=True)
    return X


def misura(X, etichetta, quota=False):
    R = K.ranghi(X, ~is_tv)
    d = {}
    d["globale"] = K.recall_film(R, US, PROF, ORO, IDX_FILM, NS)
    rk, fb, si = [], [], []
    for j, u in enumerate(US):
        gg = np.fromiter(ORO[u], np.int64, len(ORO[u]))
        rk.append(R[gg, j]); fb.append(fas_film[gg]); si.append(si_film[gg])
    rk, fb, si = np.concatenate(rk), np.concatenate(fb), np.concatenate(si)
    d["mezzo+coda"] = K.per_fascia(rk, fb, NS)["mezzo+coda"]
    d["auto-inf"] = K.recall_si(rk, si, 1.0, NS)
    print(f"  {etichetta:<34} " + " · ".join(
        f"@{N} {d['globale'][N]:6.2f}/{d['mezzo+coda'][N]:6.2f}/{d['auto-inf'][N]:6.2f}" for N in NS))
    return d


print("")
print("=" * 110)
print("IL CESTO — semi con decadimento e quote multi-bolla")
print("   formato: @N  globale/mezzo+coda/auto-informazione     (banco temporale CON mascheramento)")
print("=" * 110)


def semi_uniformi(u):
    r = PROF[u]
    return r, np.full(len(r), 1.0 / len(r), np.float32)


def semi_decaduti(tau):
    def f(u):
        r, ts = PROF[u], PROF_T[u]
        eta = (TU[u] - ts) / (tau * GIORNO)
        w = np.exp2(-eta).astype(np.float32)
        return r, w / w.sum()
    return f


MASCHERA = VIVO
ris = {}
X = cammina(semi_uniformi, MASCHERA, "riferimento: peso uniforme")
ris["RIF"] = misura(X, "RIF  uniforme, cesto piatto")
X365 = cammina(semi_decaduti(365), MASCHERA, "decadimento tau=365")
ris["D365"] = misura(X365, "D365  decadimento 365 giorni")
X180 = cammina(semi_decaduti(180), MASCHERA, "decadimento tau=180")
ris["D180"] = misura(X180, "D180  decadimento 180 giorni")

# ------------------------------------------------------------------ 2. le quote multi-bolla
print("")
print("  --- allocazione a quote multi-bolla (sul cesto di 2.000) ---")


def cesto_a_quote(Xc, etichetta, K_cesto=K_CESTO):
    """Il cesto si riempie a quote: per ogni bolla attiva dell'utente, i suoi migliori.
    La massa per bolla e' quella RECENTE del profilo. Tutto il resto resta com'e'."""
    Xq = Xc.copy()
    for j, u in enumerate(US):
        somma = np.zeros(nb, np.float64)
        r, w = semi_decaduti(365)(u)
        np.add.at(somma, bolla[r], w.astype(np.float64))
        q = somma / somma.sum()
        ordine = np.argsort(-Xc[IDX_FILM, j])
        presi = np.zeros(n, bool)
        conteggio = {}
        quanti = 0
        for i in ordine:
            if quanti >= K_cesto:
                break
            g = IDX_FILM[i]
            c = bolla[g]
            limite_c = q[c] * K_cesto
            if conteggio.get(c, 0) < max(limite_c, 1.0):
                presi[g] = True
                conteggio[c] = conteggio.get(c, 0) + 1
                quanti += 1
        # il riempimento: se le quote hanno lasciato posto, si completa col miglior punteggio
        if quanti < K_cesto:
            for i in ordine:
                if quanti >= K_cesto:
                    break
                g = IDX_FILM[i]
                if not presi[g]:
                    presi[g] = True
                    quanti += 1
        esclusi = IDX_FILM[~presi[IDX_FILM]]
        Xq[esclusi, j] = -1e9
    return Xq


Xq = cesto_a_quote(X, "quote sul riferimento")
ris["QUOTA"] = misura(Xq, "QUOTA  cesto a quote")
Xdq = cesto_a_quote(X365, "quote + decadimento")
ris["D365+QUOTA"] = misura(Xdq, "D365+QUOTA  entrambi")

# ------------------------------------------------------------------ 3. i controlli
print("")
print("  --- controlli ---")
# NOTA: `ranghi_popolare` restituisce un rango (0 = piu' votato), e `K.ranghi` rimescola per
# punteggio DECRESCENTE. Applicare `ranghi` a una matrice di ranghi la INVERTE — l'ho scoperto
# perche' il controllo dava 0,00% dove il numero archiviato era 0,94%. Qui il controllo entra come
# PUNTEGGIO (voti negati), cosi' `misura` lo tratta come tutti gli altri.
Rp = -np.tile(voti[:, None], (1, len(US))).astype(np.float32)
Rp[is_tv, :] = -1e30
misura(Rp, "popolarita' (controllo del banale)")
Rind = -np.tile(np.arange(n, dtype=np.float32)[:, None], (1, len(US)))
misura(Rind, "ordine di indice (controllo)")

# ------------------------------------------------------------------ 4. il confronto
print("")
print("=" * 110)
print("COSA CAMBIA, E DI QUANTO")
print("=" * 110)
base = ris["RIF"]
print(f"  {'configurazione':<24} " + " ".join(f"{'@' + str(N):>18}" for N in NS))
for nome, d in ris.items():
    if nome == "RIF":
        continue
    riga = []
    for N in NS:
        riga.append(f"{d['globale'][N]-base['globale'][N]:+6.2f}/{d['mezzo+coda'][N]-base['mezzo+coda'][N]:+6.2f}"
                    f"/{d['auto-inf'][N]-base['auto-inf'][N]:+6.2f}")
    print(f"  {nome:<24} " + " ".join(f"{x:>18}" for x in riga))
print("  (positivo = meglio della configurazione di riferimento)")

# ------------------------------------------------------------------ 5. la quota del cluster dominante
print("")
print("  --- l'allocazione non deve affamare l'interesse principale ---")
for nome, Xc in (("RIF", X), ("QUOTA", Xq), ("D365+QUOTA", Xdq)):
    q10, q100 = [], []
    for j, u in enumerate(US):
        r = PROF[u]
        c_dom = int(np.argmax(np.bincount(bolla[r], minlength=nb)))   # il filone con piu' titoli
        top10 = IDX_FILM[np.argsort(Xc[IDX_FILM, j])[:10]]
        top100 = IDX_FILM[np.argsort(Xc[IDX_FILM, j])[:100]]
        q10.append(float(np.mean(bolla[top10] == c_dom)))
        q100.append(float(np.mean(bolla[top100] == c_dom)))
    print(f"    {nome:<12} quota dei primi 10 nel filone dominante: {100*np.mean(q10):5.1f}% · "
          f"sui primi 100: {100*np.mean(q100):5.1f}%")
print(f"\nFINE ({time.time()-t0:.0f}s)")
