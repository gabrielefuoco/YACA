import json
from collections import Counter

with open('.scratch/v45-raccomandazioni-yaca/prototipo/sweep_m_results.json', encoding='utf-8') as f:
    res = json.load(f)['12']

print("=" * 80)
print("VERIFICA M = 12 SU TUTTE LE 10 TIMELINE")
print("=" * 80)

total_shelves = 0
max_shelf_size = 0
duplicates_found = {}
shelf_counts = {}

for u, td in res['by_timeline'].items():
    n_sh = td['n_shelves']
    shelf_counts[u] = n_sh
    total_shelves += n_sh
    
    names = [s['nome'] for s in td['shelves']]
    counts = Counter(names)
    dups = [k for k, v in counts.items() if v > 1]
    if dups:
        duplicates_found[u] = dups
        
    print(f"\nProfilo: {u:15s} | Semi tot: {td['n_seeds']:3d} | Scaffali: {n_sh}/5 | Copertura split: {td['cov_split']:.1f}%")
    for s in td['shelves']:
        sz = s['size']
        if sz > max_shelf_size:
            max_shelf_size = sz
        print(f"  [{s['shelf_idx']}] {s['nome']}")
        print(f"      Fonte: {s['nome_fonte']} | Medium: {s['medium']} | Size: {sz} semi | Consistenza: {s['consistency']:.4f}")
        print(f"      Semi ({len(s['all_seed_titles'])}): {', '.join(s['all_seed_titles'][:4])}...")
        print(f"      Top 3 cands: {', '.join(s['cands'][:3])}")

print("\n" + "=" * 80)
print("ESITO DEI CONTROLLI")
print("=" * 80)
print(f"1. Controllo duplicati nei profili: {'FALLITO: ' + str(duplicates_found) if duplicates_found else 'SUPERATO (0 duplicati su 10 profili)'}")
print(f"2. Dimensione massima scaffale: {max_shelf_size} semi (Vincolo <= 12: {'SUPERATO' if max_shelf_size <= 12 else 'FALLITO'})")
print(f"3. Conteggi scaffali per timeline: {shelf_counts} (Totale serviti: {total_shelves})")
print(f"4. Match rate tassonomia globale: {res['tax_match_rate']:.2f}% ({res['tot_tax']}/{res['tot_served']})")
