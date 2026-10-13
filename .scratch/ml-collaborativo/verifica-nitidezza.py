"""verifica-nitidezza.py — IL NUMERO TROPPO BELLO E' VERO?

Il riordino dice: fra i 500 candidati dell'attivazione, ordinare per POPOLARITA' CRESCENTE
porta il top-10 dal 1,69% al 21,02%. Fattore 12. Non si scrive senza averlo verificato.
Qui: che cos'e' davvero il campo `votes`, e i colpiti sono piu' o meno popolari dei non colpiti?
"""
import pathlib
import numpy as np
import pandas as pd

ML = pathlib.Path(".cache/movielens")
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, votes = z["tmdb"], z["tipo"], z["votes"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
TIT = {}
mv = pd.read_parquet(".cache/tmdb/movies.parquet", columns=["id", "title", "vote_count", "vote_average"])
tv = pd.read_parquet(".cache/tmdb/tv.parquet", columns=["id", "name", "vote_count", "vote_average"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t in zip(df["id"], df[col]):
        TIT[f"{typ}:{int(i)}"] = str(t)

print("=" * 96)
print("1 · CHE COS'E' `votes`?")
print("=" * 96)
print(f"  min {votes.min()} · mediana {np.median(votes):.0f} · media {votes.mean():.0f} · max {votes.max():,}")
print(f"  con 0 voti: {int((votes==0).sum()):,} ({100*(votes==0).mean():.1f}%)")
print("  i 5 PIU' votati:")
for i in np.argsort(-votes)[:5]:
    print(f"    {votes[i]:>8,}  {TIT.get(keys[i],'?')}")
print("  i 5 MENO votati (con titolo):")
for i in np.argsort(votes)[:5]:
    print(f"    {votes[i]:>8,}  {TIT.get(keys[i],'?')}")

# confronto col vero vote_count di TMDB
vk = {}
for typ, df in (("movie", mv), ("tv", tv)):
    for i, v in zip(df["id"], df["vote_count"]):
        vk[f"{typ}:{int(i)}"] = v
confronto = np.array([vk.get(k, np.nan) for k in keys], dtype=float)
ok = ~np.isnan(confronto)
print(f"\n  confronto con TMDB vote_count su {int(ok.sum()):,} titoli:")
print(f"    correlazione (Spearman): {pd.Series(votes[ok]).corr(pd.Series(confronto[ok]), method='spearman'):.3f}")
print(f"    coincidono esattamente: {100*np.mean(votes[ok]==confronto[ok]):.1f}%")

print("")
print("=" * 96)
print("2 · I COLPI SONO PIU' O MENO POPOLARI DEI NON COLPI? (dentro i 500 candidati)")
print("=" * 96)
DF = pd.read_parquet(ML / "nitidezza.parquet")
DF["u"] = np.repeat(np.arange(len(DF) // 500), 500)
c1, c0 = DF[DF.colpito == 1], DF[DF.colpito == 0]
print(f"  colpiti:     n {len(c1):,} · popolarita' mediana {c1.popolarita.median():.1f}° · media {c1.popolarita.mean():.1f}°")
print(f"  non colpiti: n {len(c0):,} · popolarita' mediana {c0.popolarita.median():.1f}° · media {c0.popolarita.mean():.1f}°")
print(f"  colpiti:     rank mediano nell'attivazione {c1['rank'].median():.0f} · non colpiti {c0['rank'].median():.0f}")
print("")
print("  tasso di colpi per decile di POPOLARITA' *dentro la stessa fascia di posizione*")
print(f"  {'posizione':<12} " + " ".join(f"{('D'+str(i+1)):>6}" for i in range(10)))
for lo, hi in ((0, 50), (50, 150), (150, 500)):
    m = (DF["rank"] >= lo) & (DF["rank"] < hi)
    sub = DF[m]
    q = pd.qcut(sub.popolarita, 10, labels=False, duplicates="drop")
    tas = [100 * sub.colpito[q == i].mean() for i in range(int(q.max()) + 1)]
    print(f"  {lo:>3}-{hi:<8} " + " ".join(f"{t:5.2f}%" for t in tas))

print("")
print("=" * 96)
print("3 · LA PROVA CHE CONTA — quanti dei 10 'meno popolari' sono colpi, contro i 10 dell'attivazione")
print("=" * 96)
tot_m = tot_a = tot_p = 0
utenti = DF.u.unique()[:400]
for u in utenti:
    d = DF[DF.u == u]
    tot_m += int(d.nsmallest(10, "popolarita").colpito.sum())
    tot_a += int(d.nsmallest(10, "rank").colpito.sum())
    tot_p += int(d.nlargest(10, "popolarita").colpito.sum())
print(f"  su {len(utenti)} utenti:")
print(f"    i 10 MENO popolari dei 500 candidati : {tot_m:>5} colpi su {10*len(utenti):,} = {100*tot_m/(10*len(utenti)):.2f}%")
print(f"    i 10 dell'attivazione                : {tot_a:>5} colpi = {100*tot_a/(10*len(utenti)):.2f}%")
print(f"    i 10 PIU' popolari                   : {tot_p:>5} colpi = {100*tot_p/(10*len(utenti)):.2f}%")
