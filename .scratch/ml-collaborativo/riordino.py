"""riordino.py — COSA ORDINA MEGLIO LA TESTA (via A, parte 2).

L'attivazione recupera bene e ordina male: nei suoi 500 candidati il tasso di colpi e' 5,40%,
ma il suo top-10 fa 1,69% — PEGGIO della media della propria lista.

Qui si prende la STESSA lista di 500 candidati e la si riordina con una caratteristica alla
volta, misurando il top-10. Non e' un modello: e' un riordino, e la sua risposta e'
"cosa deve brillare" nella forma piu' diretta possibile.

ATTENZIONE ALLE ETICHETTE: nella prima stesura le avevo scambiate (sort_values ascending=False
e' DISCENDENTE = i piu' grandi prima) e ho riportato l'opposto del vero. Qui la direzione e'
scritta con nlargest/nsmallest, che non ammette ambiguita', e i pareggi si rompono con
l'ordine dell'attivazione (keep='first').
"""
import pathlib
import numpy as np
import pandas as pd

ML = pathlib.Path(".cache/movielens")
DF = pd.read_parquet(ML / "nitidezza.parquet")
DF["u"] = np.repeat(np.arange(len(DF) // 500), 500)
DF["pos"] = np.tile(np.arange(500), len(DF) // 500)
NS = (10, 50, 100, 500)


def tasso(df, come, N):
    if come == "head":
        sel = df.sort_values(["u", "pos"]).groupby("u").head(N)
    else:
        sel = getattr(df, come)(N, "caratteristica", keep="first")
    return 100 * sel.colpito.mean()


print(f"coppie {len(DF):,} · utenti {DF.u.nunique():,} · tasso base nei 500: {100*DF.colpito.mean():.2f}%")
print("")
print(f"{'riordino dei 500 candidati':<44} " + " ".join(f"{('@'+str(k)):>7}" for k in NS))
print(f"{'attivazione (riferimento)':<44} " + " ".join(
    f"{100*DF.sort_values(['u','pos']).groupby('u').head(N).colpito.mean():6.2f}%" for N in NS))
print("")
print("TUTTE LE CARATTERISTICHE, nei due versi (i pareggi si rompono come l'attivazione)")
print(f"{'caratteristica':<20} {'verso':<14} " + " ".join(f"{('@'+str(k)):>7}" for k in NS))
for f in ("popolarita", "cos_profilo", "dim_foglia", "foglia_toccata", "grado",
          "anno_diff", "curati", "coerenza_foglia"):
    D = DF.rename(columns={f: "caratteristica"})
    for verso, fn in (("discendente", "nlargest"), ("ascendente", "nsmallest")):
        out = []
        for N in NS:
            s = D.groupby("u", group_keys=False).apply(
                lambda g, N=N, fn=fn: getattr(g, fn)(N, "caratteristica", keep="first"))
            out.append(100 * s.colpito.mean())
        print(f"{f:<20} {verso:<14} " + " ".join(f"{v:6.2f}%" for v in out))
    print("")

print("=" * 96)
print("LE COMBINAZIONI (z-score per utente, poi somma pesata)")
print("=" * 96)


def z(f):
    g = DF.groupby("u")[f]
    return (DF[f] - g.transform("mean")) / (g.transform("std") + 1e-9)


COMB = {
    "z(popolarita)": z("popolarita"),
    "z(cos_profilo)": z("cos_profilo"),
    "z(pop) + z(cos)": z("popolarita") + z("cos_profilo"),
    "z(pop) + z(foglia_toccata)": z("popolarita") + z("foglia_toccata"),
    "z(pop) + z(cos) + z(toccata)": z("popolarita") + z("cos_profilo") + z("foglia_toccata"),
    "z(pop) - z(dim_foglia)": z("popolarita") - z("dim_foglia"),
}
print(f"{'combinazione':<34} " + " ".join(f"{('@'+str(k)):>7}" for k in NS))
for nome, sc in COMB.items():
    d = DF.assign(sc=sc)
    out = []
    for N in NS:
        s = d.groupby("u", group_keys=False).apply(lambda g, N=N: g.nlargest(N, "sc", keep="first"))
        out.append(100 * s.colpito.mean())
    print(f"{nome:<34} " + " ".join(f"{v:6.2f}%" for v in out))
