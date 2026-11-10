from graph import canon as K
from graph.servizio import get_engine_v45, get_vicini_affinita
from graph.interessi import scaffali

engine = get_engine_v45()
W_aff = get_vicini_affinita()
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")

chiavi, _, plays, eta = K.storia_trakt("pepsipex", ordine="recente")
semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
shs = scaffali(engine=engine, semi=semi, n=8, W_aff=W_aff)

sh_auteur = next(s for s in shs if "autore" in s.nome.lower() and s.medium == "series")
print(f"=== Counterpart: {sh_auteur.nome} ({sh_auteur.medium}) [ratio={sh_auteur._ratio:.4f}] ===")
print("Top 10 candidates:")
for i, t in enumerate(sh_auteur.titoli[:10], 1):
    r = engine.row_of.get(t["key"])
    tit = str(titles[r]) if r is not None and titles is not None else t["key"]
    yr = int(years[r]) if r is not None and years is not None else 0
    print(f"{i:2d}. {tit} ({yr}) — key={t['key']} score={t['punteggio']:.6f}")
