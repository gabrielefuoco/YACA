import json

with open('../src/data/graph_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

words_to_check = ['black cinema', 'racial prejudice', 'mind control theatre', 'horror spoof', 'black british', 'revenge', 'lgbtq+', 'coincidence']

import re
nsfw_pattern = re.compile(r'\b(sex|sexy|sexual|sexuality|porn\w*|eroti\w*|nude|nudity|rape|incest|masturbat\w*|vibrator|dildo|bdsm|fetish\w*|orgasm)\b')

print("--- ANALISI FALSI POSITIVI ---")
for w in words_to_check:
    c_id = data['keyword_to_cluster'].get(w)
    if not c_id:
        print(f"Keyword '{w}' non trovata nel grafo.")
        continue
    
    members = data['cluster_members'][c_id]
    is_nsfw = data['cluster_nsfw'].get(c_id)
    
    # Trova il colpevole con la regex
    infectors = []
    for m in members:
        if nsfw_pattern.search(m):
            infectors.append(m)
                
    print(f"\n[{w}] -> Cluster {c_id} (Quarantena NSFW: {is_nsfw})")
    print(f"Membri del cluster: {members}")
    if infectors:
        print(f"Infettato da: {infectors}")
    else:
        print("Nessun infettore trovato nel cluster.")
