"""
split-movielens.py — DIVISIONE PER GUSTO + CONTROLLO QUALITA' DEL DATASET RISULTANTE.

1. Si misura la POPOLARITA' RELATIVA di ogni film (percentile dei voti nel dataset) e, per ogni
   utente, la mediana di quel percentile sui film che ha visto: e' la sua "inclinazione".
2. Si dividono gli utenti in MAINSTREAM (inclinazione alta) e NICCHIA (bassa), scartando il centro.
3. Controllo qualita' di ciascun dataset: hub (utenti e film), buchi, duplicati, copertura,
   densita', e soprattutto QUANTO I DUE MONDI SI SOVRAPPONGONO.
4. Decisioni di pulizia dichiarate e applicate.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/split-movielens.py
"""
import json, pathlib
import numpy as np, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[2]
ML, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
def log(m): print(m, flush=True)

log("=== 1. DATI GREZZI ===")
r = pd.read_csv(ML/"ml-32m"/"ratings.csv", usecols=["userId","movieId","rating","timestamp"], dtype={"userId":"int32","movieId":"int32","rating":"float32","timestamp":"int64"})
links = pd.read_csv(ML/"ml-32m"/"links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId":"int64","movieId":"int64"})
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
log(f"  voti {len(r):,} · utenti {r['userId'].nunique():,} · film {r['movieId'].nunique():,} · voti per utente {len(r)/r['userId'].nunique():.0f}")
log(f"  periodo: {pd.to_datetime(r['timestamp'].min(), unit='s').date()} -> {pd.to_datetime(r['timestamp'].max(), unit='s').date()}")
log(f"  scala di voto: {r['rating'].min()}-{r['rating'].max()} · mediana {r['rating'].median()} · media {r['rating'].mean():.2f}")

log("")
log("=== 2. BUCHI E PULIZIA NECESSARIA ===")
dup = int(r.duplicated(["userId","movieId"]).sum())
log(f"  duplicati (utente, film): {dup:,}")
notmdb = r["movieId"].map(lambda m: int(m) not in mid2tmdb)
log(f"  voti su film SENZA tmdbId: {int(notmdb.sum()):,} ({100*notmdb.mean():.2f}%) -> si scartano (non agganciabili al catalogo)")
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","keywords","vote_count"])
kw_ok = set(int(i) for i,k in zip(mv["id"], mv["keywords"]) if isinstance(k,str) and k not in ("[]",""))
r = r[~notmdb].copy()
r["tmdb"] = r["movieId"].map(lambda m: int(mid2tmdb[int(m)]))
nokw = ~r["tmdb"].map(lambda t: t in kw_ok)
log(f"  voti su film SENZA keyword (il grafo non puo' rappresentarli): {int(nokw.sum()):,} ({100*nokw.mean():.2f}%) -> si scartano")
r = r[~nokw].copy()
log(f"  voti utilizzabili: {len(r):,} · utenti {r['userId'].nunique():,} · film {r['movieId'].nunique():,}")

log("")
log("=== 3. HUB: UTENTI ===")
nu = r.groupby("userId").size().sort_values(ascending=False)
log(f"  voti per utente: mediana {int(nu.median())} · p90 {int(nu.quantile(0.9))} · p99 {int(nu.quantile(0.99))} · max {int(nu.max()):,}")
log(f"  utenti con >=1000 voti: {int((nu>=1000).sum()):,} ({100*(nu>=1000).mean():.2f}%) · con <20: {int((nu<20).sum()):,} ({100*(nu<20).mean():.2f}%)")
log(f"  i 10 utenti piu' attivi fanno il {100*nu.head(10).sum()/len(r):.2f}% dei voti; i 1000 piu' attivi il {100*nu.head(1000).sum()/len(r):.1f}%")

log("")
log("=== 4. HUB: FILM ===")
ni = r.groupby("movieId").size().sort_values(ascending=False)
log(f"  voti per film: mediana {int(ni.median())} · p90 {int(ni.quantile(0.9))} · p99 {int(ni.quantile(0.99))} · max {int(ni.max()):,}")
log(f"  film con >=10000 voti: {int((ni>=10000).sum()):,} · con <10 voti: {int((ni<10).sum()):,} ({100*(ni<10).mean():.1f}% dei film)")
top = ni.head(10)
for m, c in top.items():
    log(f"    {int(c):>7,} voti  movieId {m}")
log(f"  i 10 film piu' votati fanno il {100*ni.head(10).sum()/len(r):.2f}% dei voti")

# inclinazione dell'utente: mediana del percentile di popolarita' dei film visti
# POPOLARITA' del film: percentile dei voti TMDB. (Il conteggio dei voti NEL dataset e' troppo
# schiacciato: il 44,5% dei film ha <10 voti e le mediane per utente collassano su 0,99.)
vc = dict(zip(mv["id"], mv["vote_count"]))
r["vc"] = r["tmdb"].map(lambda t: float(vc.get(int(t), 0)))
films = r[["movieId","vc"]].drop_duplicates("movieId").set_index("movieId")["vc"]
pct = films.rank(pct=True)
log(f"  percentile dei voti TMDB per film: p10 {pct.quantile(0.1):.2f} · mediana {pct.median():.2f} · p90 {pct.quantile(0.9):.2f}")
r["pop_pct"] = r["movieId"].map(pct)
# La MEDIANA del percentile non separa: quasi tutti gli utenti guardano soprattutto film famosi
# (p10 0,94 · mediana 0,98). La misura che separa e' la QUOTA di film rari nella lista di ciascuno.
# Misura usata: MEDIA del percentile di popolarita' dei film visti. E' continua e con una coda
# reale (p10 0,90 · mediana 0,96 · p90 0,99). La "quota di film rari" era degenerata (0 per tutti):
# i voti sono iper-concentrati e la coda rara e' lo 0,2% dei voti.
inc = r.groupby("userId")["pop_pct"].mean()
log(f"  media del percentile di popolarita' per utente: p10 {inc.quantile(0.1):.2f} · mediana {inc.median():.2f} · p90 {inc.quantile(0.9):.2f}")
es = inc.sample(5, random_state=1)
log("  esempio (5 utenti, media percentile): " + ", ".join(f"{v:.2f}" for v in es.values))
log("")
log("=== 5. INCLINAZIONE DEGLI UTENTI (mediana del percentile di popolarita') ===")
log(f"  distribuzione: p10 {inc.quantile(0.1):.2f} · mediana {inc.median():.2f} · p90 {inc.quantile(0.9):.2f}")
q33, q67 = inc.quantile(0.33), inc.quantile(0.67)
log(f"  terzili: basso <= {q33:.2f} · alto >= {q67:.2f}")
log(f"  utenti sotto il terzile basso: {int((inc<=q33).sum()):,} · sopra l'alto: {int((inc>=q67).sum()):,}")

log("")
log("=== 6. I DUE DATASET (con le decisioni di pulizia dichiarate) ===")
MIN_U, MIN_I, CAP_U = 20, 10, 1000
r = r.sort_values("timestamp")
r = r.groupby("userId").tail(CAP_U)          # tetto agli hub: gli ultimi CAP_U voti di ogni utente
log(f"  PULIZIA: utenti con >= {MIN_U} voti · film con >= {MIN_I} voti nel gruppo · tetto {CAP_U} voti/utente (i piu' recenti) · no duplicati")
out = {}
for nome, mask in (("mainstream", inc >= q67), ("nicchia", inc <= q33)):
    users = set(inc[mask].index.tolist())
    d = r[r["userId"].isin(users)].copy()
    nu_ = d.groupby("userId").size(); nu_ = nu_[nu_ >= MIN_U]
    d = d[d["userId"].isin(set(nu_.index))]
    ni_ = d.groupby("movieId").size(); ni_ = ni_[ni_ >= MIN_I]
    d = d[d["movieId"].isin(set(ni_.index))]
    u, i = d["userId"].nunique(), d["movieId"].nunique()
    dens = len(d)/(u*i) if u*i else 0
    log(f"  {nome:<11} voti {len(d):>9,} · utenti {u:>7,} · film {i:>6,} · densita' {dens:.4f} · "
        f"voti/utente {len(d)/max(1,u):.0f} · voti/film {len(d)/max(1,i):.0f}")
    out[nome] = d
ms, nc = set(out["mainstream"]["movieId"].unique()), set(out["nicchia"]["movieId"].unique())
log(f"  film del mainstream: {len(ms):,} · della nicchia: {len(nc):,} · IN COMUNE: {len(ms&nc):,} "
    f"({100*len(ms&nc)/len(ms|nc):.1f}% di Jaccard)")
pop_ms = out["mainstream"].groupby("movieId").size().mean(); pop_nc = out["nicchia"].groupby("movieId").size().mean()
log(f"  popolarita' media dei film: mainstream {pop_ms:.0f} voti · nicchia {pop_nc:.0f} voti")
# quanto i due mondi ordinano diversamente gli stessi film
com = sorted(ms & nc)
a = out["mainstream"].groupby("movieId").size().reindex(com).fillna(0)
b = out["nicchia"].groupby("movieId").size().reindex(com).fillna(0)
if len(com) > 10:
    from scipy.stats import spearmanr
    rho = spearmanr(a, b).correlation
    log(f"  sui {len(com):,} film in comune, la correlazione di rango fra i due mondi e' rho = {rho:+.3f}")
log("")
log("=== 7. LA PROVA: I DUE MONDI SONO DIVERSI? ===")
for nome, d in out.items():
    ni2 = d.groupby("movieId").size().sort_values(ascending=False).head(10)
    titoli = []
    for m in ni2.index:
        t = mid2tmdb.get(int(m)); titoli.append(str(t))
    log(f"  {nome:<11} top-10 film (tmdbId): {', '.join(titoli)}")
com2 = sorted(set(out["mainstream"]["movieId"].unique()) & set(out["nicchia"]["movieId"].unique()))
log(f"  film in comune: {len(com2):,} · film SOLO mainstream: {len(ms)-len(com2):,} · SOLO nicchia: {len(nc)-len(com2):,}")
for nome, d in out.items():
    ni3 = d.groupby("movieId").size()
    log(f"  {nome:<11} quota dei voti sui film con <100 voti nel gruppo: {100*ni3[ni3<100].sum()/len(d):.1f}%")
log("")
log("=== 8. HUB RESIDUI NEI DUE DATASET ===")
for nome, d in out.items():
    ni2 = d.groupby("movieId").size().sort_values(ascending=False)
    nu2 = d.groupby("userId").size().sort_values(ascending=False)
    log(f"  {nome:<11} top film: {', '.join(str(int(x)) for x in ni2.head(5).values)} · "
        f"quota dei 10 film piu' votati {100*ni2.head(10).sum()/len(d):.1f}% · utente piu' attivo {int(nu2.max())} voti")
out["mainstream"].to_parquet(ML/"ratings-mainstream.parquet")
out["nicchia"].to_parquet(ML/"ratings-nicchia.parquet")
log("")
log("salvati: ratings-mainstream.parquet · ratings-nicchia.parquet")
