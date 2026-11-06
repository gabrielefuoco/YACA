import json

with open(r'C:\Users\gabri\APP\YACA\.scratch\v45-raccomandazioni-yaca\prototipo\sweep_m_results.json', encoding='utf-8') as f:
    res = json.load(f)

for M in ['8', '12', '20', '30']:
    print(f"\n=================== M = {M} ===================")
    r = res[M]
    print(f"Overall Tax Match: {r['tax_match_rate']:.2f}% ({r['tot_tax']}/{r['tot_served']})")
    for u, td in r['by_timeline'].items():
        tax_shelves = [s['nome'] for s in td['shelves'] if s['nome_fonte'] == 'tassonomia']
        phv_shelves = [s['nome'] for s in td['shelves'] if s['nome_fonte'] != 'tassonomia']
        print(f"{u:15s}: {td['n_tax']}/{td['n_shelves']} ({td['n_tax']/td['n_shelves']*100:.0f}%) | Tax: {tax_shelves}")
