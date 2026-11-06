import pickle
import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
from graph import canon as K

meta = K.metadati()
with open(".scratch/v45-raccomandazioni-yaca/prototipo/named_interest_results.pkl", "rb") as f:
    results = pickle.load(f)

for target_u in ["pepsipex", "castoffcrown"]:
    d = results[target_u]
    k, righe, plays, eta = K.storia_trakt(target_u, ordine="recente")
    print("\n" + "="*90)
    print(f"TOP 10 SHELVES FOR {target_u.upper()} (Total served: {d['n_served']})")
    print("="*90)
    for idx, s in enumerate(d["served"][:10], start=1):
        titles = [f"{meta['TIT'][righe[i]]} ({int(meta['ANNO'][righe[i]])})" for i in s["seeds"][:3]]
        src = "TASSONOMIA" if s["nome_fonte"] == "tassonomia" else "PHV"
        print(f"[{idx:2d}] «{s['nome']}»")
        print(f"     Origine: {src} | Medium: {s['medium']} | Dimensione: {s['size']} semi | min_eta: {s['min_eta']:.1f}gg")
        print(f"     Semi: {', '.join(titles)}")
