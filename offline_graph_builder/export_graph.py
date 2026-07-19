import json
import csv
import networkx as nx

def main():
    print("Caricamento JSON...")
    with open('../src/data/graph_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 1. Esportazione CSV (Perfetta per Cosmograph)
    print("Esportazione CSV per Cosmograph...")
    with open('yaca_edges.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['source', 'target', 'weight'])
        for u, adj in data['cluster_adjacency'].items():
            for v, w in adj.items():
                if int(u) < int(v):  # Evita duplicati bidirezionali
                    writer.writerow([u, v, w])

    with open('yaca_nodes.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'label', 'size'])
        for u, members in data['cluster_members'].items():
            # Usiamo la prima keyword come etichetta principale
            label = members[0] if members else f"Cluster {u}"
            writer.writerow([u, label, len(members)])

    # 2. Esportazione GraphML (Standard per Gephi)
    print("Esportazione GraphML per Gephi...")
    G = nx.Graph()
    for u, members in data['cluster_members'].items():
        label = members[0] if members else f"Cluster {u}"
        G.add_node(u, label=label, size=len(members))

    for u, adj in data['cluster_adjacency'].items():
        for v, w in adj.items():
            if int(u) < int(v):
                G.add_edge(u, v, weight=w)

    nx.write_graphml(G, 'yaca_graph.graphml')
    print("Fatto! File generati: yaca_edges.csv, yaca_nodes.csv, yaca_graph.graphml")

if __name__ == "__main__":
    main()
