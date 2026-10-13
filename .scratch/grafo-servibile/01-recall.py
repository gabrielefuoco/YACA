"""01-recall.py — TICKET 01: la recall stratificata e la recall pesata per auto-informazione.

Cosa deve dimostrare (i criteri del ticket):
  1. la recall globale esistente e' IDENTICA al decimale prima e dopo  -> si riproduce il numero
     canonico del prodotto (29,61 / 63,35 / 87,86) come controllo di partenza;
  2. la baseline di popolarita' fa ~100% dei suoi punti sulla TESTA e ~0% su mezzo+coda: e' la
     prova che la stratificazione isola il segnale non banale invece di misurarlo;
  3. ogni misura stampa i tre numeri insieme: globale / mezzo+coda / auto-informazione;
  4. gamma configurabile, riportati 0,5 e 1,0;
  5. il controllo del catalogo film: aggiungendo le metriche i numeri NON si muovono.

Uso:  python .scratch/grafo-servibile/01-recall.py [prodotto|serie|tutto]
"""
import pathlib, sys, time
import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

QUALI = sys.argv[1] if len(sys.argv) > 1 else "tutto"
NS = (10, 100, 500, 2000)
NS_CAT = (10, 100, 500)

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
IDX_SERIE = np.where(is_tv)[0]
voti = K.voti()

# le fasce e l'auto-informazione si calcolano SUL CATALOGO SERVITO, separatamente:
# film e serie hanno scale di popolarita' diverse e si servono in due cataloghi diversi.
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
fas_serie = np.full(n, -1, np.int8)
fas_serie[IDX_SERIE] = K.fasce(voti[IDX_SERIE])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])
si_serie = np.zeros(n)
si_serie[IDX_SERIE] = K.auto_informazione(voti[IDX_SERIE])

print("=" * 100)
print("LE FASCE DI POPOLARITA' (taglio su quantili del catalogo servito)")
print("=" * 100)
for et, idx, fas in (("FILM", IDX_FILM, fas_film), ("SERIE", IDX_SERIE, fas_serie)):
    v = voti[idx]
    d = {f: int((fas[idx] == f).sum()) for f in (0, 1, 2)}
    print(f"  {et:<6} {len(idx):>7,} titoli · testa(top 5%) {d[0]:>6,} (>= {np.quantile(v, .95):>8,.0f} voti) · "
          f"mezzo {d[1]:>6,} · coda {d[2]:>6,} (mediana {np.median(v):>7,.0f} voti)")
    w = si_film if et == "FILM" else si_serie
    print(f"         auto-informazione: min {np.nanmin(w[idx]):.1f} · mediana {np.nanmedian(w[idx]):.1f} · "
          f"max {np.nanmax(w[idx]):.1f} bit  (il rapporto testa/coda e' {np.nanmax(w[idx])-np.nanmin(w[idx]):.0f} bit)")

print(f"\ncomponenti ... ({time.time()-t0:.0f}s)", flush=True)
CMP = K.Componenti(n)
C = CMP(60)
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
print(f"grafo canonico: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)


def tre(R, gold_di, chiavi, fas, si, ns, etichetta):
    """I tre numeri insieme: globale, mezzo+coda, auto-informazione (gamma 0.5 e 1.0)."""
    g = K.recall_stratificato_oro(R, gold_di, chiavi, fas, ns)
    K.stampa_strati(etichetta, g)
    for gamma in (0.5, 1.0):
        d = K.recall_si_oro(R, gold_di, chiavi, si, gamma, ns)
        print(f"  {'':<46} {'auto-inf g=' + str(gamma):>11}  "
              + " · ".join(f"@{N} {v:6.2f}%" for N, v in d.items()), flush=True)
    return g


# =====================================================================  1. PRODOTTO (film)
if QUALI in ("tutto", "prodotto"):
    print("")
    print("=" * 100)
    print("1. PRODOTTO — 1.000 utenti MovieLens di verifica, catalogo FILM")
    print("   il numero canonico da riprodurre e': 29,61 / 63,35 / 87,86  (e' il controllo di partenza)")
    print("=" * 100)
    PROF, ORO = K.banco_prodotto(row_of, quanti=1000, parte="verifica")
    US = np.array(list(PROF.keys()))
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = K.rwr(M, E, alpha=0.30)
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    R = K.ranghi(X, ~is_tv)          # ranghi ristretti al catalogo servito
    r = K.recall_film(R, US, PROF, ORO, IDX_FILM)
    K.stampa("CAMMINATA CANONICA (CF5 k60 beta0.5 wc0.60)", r)
    ok = abs(r[10] - 29.61) < 0.01 and abs(r[100] - 63.35) < 0.01 and abs(r[500] - 87.86) < 0.01
    print(f"  >>> CONTROLLO DI PARTENZA: {'RIPRODOTTO' if ok else 'NON RIPRODOTTO — fermarsi e capire'}")
    print("")
    tre(R, ORO, US, fas_film, si_film, NS, "camminata")

    rp = K.ranghi_popolare(voti, len(US), filtro=~is_tv)
    print("")
    K.stampa("CONTROLLO — popolarita' (classifica globale unica)", K.recall_film(rp, US, PROF, ORO, IDX_FILM))
    gp = tre(rp, ORO, US, fas_film, si_film, NS, "popolarita'")
    print("")
    gg = gp["testa"]
    print(f"  >>> PROVA DELLA STRATIFICAZIONE: la popolarita' fa {gg[10]:.2f}% sulla testa e "
          f"{gp['mezzo+coda'][10]:.2f}% su mezzo+coda (@10).")
    print(f"      Sopra la testa la popolarita' fa ZERO, e sotto zero anche a @2000 "
          f"({gp['mezzo+coda'][2000]:.2f}%): mezzo+coda misura qualcosa che la testa non misura.", flush=True)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)


# =====================================================================  2. CATALOGO SERIE
if QUALI in ("tutto", "serie"):
    print("")
    print("=" * 100)
    print("2. CATALOGO SERIE — il banco Trakt, oro di serie con semi di serie")
    print("=" * 100)
    CASI = K.banco_trakt(row_of)
    PS = {i: c["ps"] for i, c in enumerate(CASI)}
    GS = {i: c["gs"] for i, c in enumerate(CASI)}
    print(f"  {len(CASI)} utenti ({time.time()-t0:.0f}s)", flush=True)

    def cammina(semi_di, alpha, lotto=120):
        chiavi = list(semi_di)
        X = np.zeros((n, len(chiavi)), np.float32)
        for i in range(0, len(chiavi), lotto):
            ch = chiavi[i:i + lotto]
            E = np.zeros((n, len(ch)), np.float32)
            for j, u in enumerate(ch):
                E[semi_di[u], j] = 1.0
            Y = K.rwr(M, E, alpha)
            for j, u in enumerate(ch):
                Y[semi_di[u], j] = -1e9
            X[:, i:i + len(ch)] = Y
            print(f"    ... {i+len(ch)}/{len(chiavi)} ({time.time()-t0:.0f}s)", flush=True)
        return X, chiavi

    Xs, chs = cammina(PS, 0.30)
    Rs = K.ranghi(Xs, is_tv)
    K.stampa("camminata sola", K.recall_catalogo(Rs, GS, chs, is_tv, NS_CAT))
    print("")
    tre(Rs, GS, chs, fas_serie, si_serie, NS_CAT, "camminata")

    rp = K.ranghi_popolare(voti, len(chs), filtro=is_tv)
    print("")
    K.stampa("CONTROLLO — popolarita'", K.recall_catalogo(rp, GS, chs, is_tv, NS_CAT))
    gp = tre(rp, GS, chs, fas_serie, si_serie, NS_CAT, "popolarita'")
    print("")
    print(f"  >>> PROVA: la popolarita' fa {gp['testa'][10]:.2f}% sulla testa e "
          f"{gp['mezzo+coda'][10]:.2f}% su mezzo+coda (@10).")
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

print(f"\nFINE ({time.time()-t0:.0f}s)")
