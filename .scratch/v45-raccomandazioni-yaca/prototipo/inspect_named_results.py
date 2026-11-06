import pickle
import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
from graph import canon as K

meta = K.metadati()
with open(".scratch/v45-raccomandazioni-yaca/prototipo/named_interest_results.pkl", "rb") as f:
    results = pickle.load(f)

for target_u in ["castoffcrown", "pepsipex"]:
    d = results[target_u]
    k, righe, plays, eta = K.storia_trakt(target_u, ordine="recente")
    print("\n" + "="*110)
    print(f"DETTAGLIO COMPLETO SCAFFALI SERVITI: {target_u.upper()} (Totale: {d['n_served']} scaffali)")
    print("="*110)
    for idx, s in enumerate(d["served"], start=1):
        titles = [f"{meta['TIT'][righe[i]]} ({int(meta['ANNO'][righe[i]])})" for i in s["seeds"][:3]]
        src_tag = "TASSONOMIA" if s["nome_fonte"] == "tassonomia" else "PHV"
        print(f"[{idx:2d}] «{s['nome']}» [{src_tag} | {s['medium']} | {s['size']} semi | min_eta={s['min_eta']:.1f}gg]")
        print(f"     Semi esempio: {', '.join(titles)}")

print("\n" + "="*110)
print("RIEPILOGO GENERALE SULLE 10 TIMELINE:")
print("="*110)
print(f"{'PROFILO':16s} | {'TOT':4s} | {'CLUST':5s} | {'SCAFF':5s} | {'SEMI COV (TOT %)':17s} | {'SEMI COV (CLUST %)':19s} | {'BISEZ':5s} | {'PHV':4s} | {'SIZES'}")
print("-" * 110)
for u, d in results.items():
    print(f"{u:16s} | {d['tot_seeds']:4d} | {d['tot_clustered']:5d} | {d['n_served']:5d} | {d['n_served_seeds']:4d} ({d['pct_served_tot']:5.1f}%)   | {d['n_served_seeds']:4d} ({d['pct_served_clust']:5.1f}%)     | {d['bisections']:5d} | {d['served_phv']:4d} | {d['sizes']}")
