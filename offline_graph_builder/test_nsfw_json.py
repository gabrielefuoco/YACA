import json

with open('../src/data/graph_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

nsfw_clusters = {k: v for k, v in data.get('cluster_nsfw', {}).items() if v}
print(f"Totale cluster NSFW identificati: {len(nsfw_clusters)}")

# Troviamo in quale cluster si trova "toy" e "sex toy"
kw_to_cluster = data['keyword_to_cluster']
cluster_members = data['cluster_members']

toy_c = kw_to_cluster.get('toy')
sex_toy_c = kw_to_cluster.get('sex toy')

print(f"'toy' è nel cluster {toy_c}. È nsfw? {data['cluster_nsfw'].get(toy_c)}")
print(f"'sex toy' è nel cluster {sex_toy_c}. È nsfw? {data['cluster_nsfw'].get(sex_toy_c)}")

if toy_c:
    print(f"Membri del cluster di 'toy': {cluster_members[toy_c][:10]}")
if sex_toy_c:
    print(f"Membri del cluster di 'sex toy': {cluster_members[sex_toy_c][:10]}")
