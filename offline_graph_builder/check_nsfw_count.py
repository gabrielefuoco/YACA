import json

with open('../src/data/graph_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

nsfw_clusters = {k: v for k, v in data['cluster_nsfw'].items() if v}
print(f"Totale cluster NSFW: {len(nsfw_clusters)}")

for c_id in nsfw_clusters:
    print(f"Cluster {c_id}: {data['cluster_members'][c_id]}")
