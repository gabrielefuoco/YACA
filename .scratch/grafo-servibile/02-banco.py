"""02-banco.py — TICKET 02: il banco curato diviso in caldo e freddo, mai mediato.

Cosa deve dimostrare (i criteri del ticket):
  1. la divisione riproduce le due popolazioni misurate (83 calde / 163 fredde);
  2. ogni report stampa (Curato-Warm @10/@100, Curato-Cold @10/@100) come numeri DISTINTI;
  3. il controllo dell'ordine di indice e' stampato per ENTRAMBE le popolazioni;
  4. nessun numero aggregato e' prodotto senza le sue due componenti accanto;
  5. il divario fra le due popolazioni e' dichiarato come proprieta' del banco, non risultato.

Uso:  python .scratch/grafo-servibile/02-banco.py
"""
import pathlib, sys, time
import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

NS = (10, 50, 100, 500)
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
voti = K.voti()
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])

SOGG, BERS, US, COL, CALDE = K.banco_curato_split(row_of)
print("=" * 100)
print("IL BANCO CURATO, DIVISO — e perche' non si media")
print("=" * 100)
print(f"  legami {len(BERS):,} · sorgenti {len(US)} "
      f"(serie {int(is_tv[US].sum())} · film {int((~is_tv[US]).sum())})")
print(f"  bersagli: film {int((~is_tv[BERS]).sum()):,} · serie {int(is_tv[BERS].sum()):,}")
for nome, m in (("CALDE", CALDE), ("FREDDE", ~CALDE)):
    nsrc = int(m.sum())
    nleg = int(np.isin(COL, np.where(m)[0]).sum())
    print(f"  {nome:<7} {nsrc:>4} sorgenti · {nleg:>4} legami · mediana legami/sorgente "
          f"{np.median([int((COL == c).sum()) for c in np.where(m)[0]]):.0f}")

print(f"\ncomponenti ... ({time.time()-t0:.0f}s)", flush=True)
CMP = K.Componenti(n)
C = CMP(60)
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
print(f"grafo canonico: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

EC = np.zeros((n, len(US)), np.float32)
EC[US, np.arange(len(US))] = 1.0
XC = K.rwr(M, EC, alpha=0.70)
XC[US, np.arange(len(US))] = -1e9        # protocollo corretto: la sorgente mascherata
Rw = K.ranghi(XC)
print(f"camminata fatta ({time.time()-t0:.0f}s)", flush=True)

rnd = np.random.default_rng(3)
CONTROLLI = {
    "CONTROLLO ordine di indice": np.tile(np.arange(n, dtype=np.int32)[:, None], (1, len(US))),
    "CONTROLLO casuale": np.tile(rnd.permutation(n).astype(np.int32)[:, None], (1, len(US))),
}
Rp = K.ranghi_popolare(voti, len(US))


def tre(R, maschera, etichetta):
    """I tre numeri insieme, SOLO sui legami della popolazione. Mai un aggregato."""
    rk = R[BERS, COL][maschera[COL]]
    fb = fas_film[BERS][maschera[COL]]
    si = si_film[BERS][maschera[COL]]
    g = K.per_fascia(rk, fb, NS)
    K.stampa_strati(etichetta, g)
    for gamma in (0.5, 1.0):
        d = K.recall_si(rk, si, gamma, NS)
        print(f"  {'':<46} {'auto-inf g=' + str(gamma):>11}  "
              + " · ".join(f"@{N} {v:6.2f}%" for N, v in d.items()), flush=True)
    return g


RIS = {}
for nome, maschera in (("CALDE (il titolo e' gia' nel mondo curato)", CALDE),
                       ("FREDDE (cold start vero)", ~CALDE)):
    print("")
    print("=" * 100)
    print(f"{nome}")
    print("=" * 100)
    K.stampa("camminata sola (alpha 0.70, sorgente mascherata)", K.recall_curato(Rw, BERS, COL, NS))
    RIS[nome] = tre(Rw, maschera, "camminata")
    print("")
    K.stampa("popolarita' (controllo del banale)", K.recall_curato(Rp, BERS, COL, NS))
    tre(Rp, maschera, "popolarita'")
    print("")
    for et, R in CONTROLLI.items():
        K.stampa(et, K.recall_curato(R, BERS, COL, NS))
        tre(R, maschera, et)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

# ------------------------------------------------------------------ il confronto che conta
print("")
print("=" * 100)
print("IL DIVARIO — proprieta' del BANCO, non risultato di un metodo")
print("=" * 100)
k_c, k_f = "CALDE (il titolo e' gia' nel mondo curato)", "FREDDE (cold start vero)"
for N in NS:
    a, b = RIS[k_c]["tutto"][N], RIS[k_f]["tutto"][N]
    print(f"  @{N:<4} calde {a:6.2f}%  ·  fredde {b:6.2f}%   ->  rapporto {a/max(b,1e-9):5.1f}x")
print("")
print("  >>> L'AGGREGATO CHE NON VA PIU' STAMPATO (e' la media che non descrive nessuna delle due):")
rk = Rw[BERS, COL]
print(f"      @10 {100*float((rk<10).mean()):.2f}% · @100 {100*float((rk<100).mean()):.2f}% "
      f"· @500 {100*float((rk<500).mean()):.2f}%")
print(f"\nFINE ({time.time()-t0:.0f}s)")
