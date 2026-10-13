"""ablazione.py — LA PASSATA DI SOTTRAZIONE.

La ricetta finale ha 5 componenti + la curatela, e i pesi sono stati tarati a strati: prima le
parti uguali (report 49), poi CF x5 e k=60 (56), poi CFst x3 (54), poi B x5 per le serie (64).
Nessuno ha mai tolto niente. L'ablation e' stata fatta UNA volta sola (report 49) sul grafo a
PESI UGUALI e sul solo metro del prodotto.

Qui si toglie un componente per volta DALLA RICETTA FINALE, e si misura:
  * catalogo FILM   (Trakt, 356 utenti)      con i pesi dei film
  * PRODOTTO        (MovieLens, 500 utenti)  con i pesi dei film
  * catalogo SERIE  (Trakt, 356 utenti)      con i pesi delle serie
piu' la POPOLARITA' come ancora di riferimento.

Se togliere qualcosa non cambia niente, quel componente non si guadagna il posto.
"""
import pathlib, sys, time
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]

CASI = K.banco_trakt(row_of)
PF = {i: c["pf"] for i, c in enumerate(CASI)}
GF = {i: c["gf"] for i, c in enumerate(CASI)}
PS = {i: c["ps"] for i, c in enumerate(CASI)}
GS = {i: c["gs"] for i, c in enumerate(CASI)}
print(f"Trakt: {len(CASI)} utenti")

PROF, ORO = K.banco_prodotto(row_of, quanti=500, parte="calibrazione")
US = np.array(list(PROF.keys()))
print(f"MovieLens: {len(US)} utenti ({time.time()-t0:.0f}s)")

CMP = K.Componenti(n)
C = CMP(60)
print(f"componenti pronti ({time.time()-t0:.0f}s)", flush=True)


def attiva(M, semi_di, alpha=0.30, lotto=120):
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
    return X, chiavi


PESI_FILM = {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}
PESI_SERIE = {"CF": 5, "CFst": 3, "Kc": 1, "B": 5, "T": 1}
CONF = [("RICETTA COMPLETA", None, None)]
for c in ("CF", "CFst", "Kc", "B", "T"):
    CONF.append((f"senza {c}", c, None))
CONF.append(("senza la curatela", None, 0.0))

# la popolarita' come ancora
z = np.load(K.ML / "spazi-trakt.npz", allow_pickle=True)
votes = z["votes"].astype(np.float32)
pop = np.argsort(np.argsort(votes)).astype(np.float32)
print("")
print("=" * 104)
print(f"ANCORA — POPOLARITA'")
print("=" * 104)
for nome, gold, chiavi, filtro in (("catalogo FILM (Trakt)", GF, PF, ~is_tv),
                                   ("catalogo SERIE (Trakt)", GS, PS, is_tv)):
    R = K.ranghi(np.tile(pop[:, None], (1, len(chiavi))))
    K.stampa(nome, K.recall_catalogo(R, gold, chiavi, filtro), 26)

RIS = {}
for etichetta, togli, wc in CONF:
    print("")
    print("=" * 104)
    print(f"{etichetta}")
    print("=" * 104)
    # --- i pesi dei FILM: catalogo film + prodotto ---
    pesi = {k: v for k, v in PESI_FILM.items() if k != togli}
    M = K.costruisci(C, pesi, wc=(0.60 if wc is None else wc), beta=0.50)
    Xf, chf = attiva(M, PF)
    a = K.recall_catalogo(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv)
    K.stampa("catalogo FILM (Trakt)", a, 26)
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    Xp = K.rwr(M, E, alpha=0.30)
    for j, u in enumerate(US):
        Xp[PROF[u], j] = -1e9
    b = K.recall_film(K.ranghi(Xp), US, PROF, ORO, IDX_FILM)
    K.stampa("PRODOTTO (MovieLens 500)", b, 26)
    del M, Xf, Xp
    # --- i pesi delle SERIE: catalogo serie ---
    pesi = {k: v for k, v in PESI_SERIE.items() if k != togli}
    Ms = K.costruisci(C, pesi, wc=(0.60 if wc is None else wc), beta=0.50)
    Xs, chs = attiva(Ms, PS)
    c = K.recall_catalogo(K.ranghi(Xs, is_tv), GS, chs, is_tv)
    K.stampa("catalogo SERIE (Trakt)", c, 26)
    del Ms, Xs
    RIS[etichetta] = (a, b, c)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

print("")
print("=" * 104)
print("COSA SI PERDE TOGLIENDO — delta in punti percentuali")
print("=" * 104)
rif = RIS["RICETTA COMPLETA"]
print(f"{'tolto':<20} {'FILM @10':>10} {'FILM @100':>10} {'PROD @100':>10} {'PROD @500':>10} "
      f"{'SERIE @10':>10} {'SERIE @100':>10}")
print(f"{'(completa)':<20} {rif[0][10]:>10.2f} {rif[0][100]:>10.2f} {rif[1][100]:>10.2f} "
      f"{rif[1][500]:>10.2f} {rif[2][10]:>10.2f} {rif[2][100]:>10.2f}")
for etichetta, (a, b, c) in RIS.items():
    if etichetta == "RICETTA COMPLETA":
        continue
    print(f"{etichetta:<20} {a[10]-rif[0][10]:>+10.2f} {a[100]-rif[0][100]:>+10.2f} "
          f"{b[100]-rif[1][100]:>+10.2f} {b[500]-rif[1][500]:>+10.2f} "
          f"{c[10]-rif[2][10]:>+10.2f} {c[100]-rif[2][100]:>+10.2f}")
print(f"\n({time.time()-t0:.0f}s)")
