import sys
import json

def load_graph(path='../src/data/graph_data.json'):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print("❌ File graph_data.json non trovato!")
        sys.exit(1)

def test_keyword(graph, kw):
    kw = kw.lower().strip()
    cluster_id = graph['keyword_to_cluster'].get(kw)
    
    if not cluster_id:
        print(f"[ERROR] La keyword '{kw}' non è presente nel grafo.")
        print("Potrebbe essere stata tagliata perché frequenza < 15, oppure hai scritto male.")
        return
        
    synonyms = graph['cluster_members'][cluster_id]
    print(f"==================================================")
    print(f"[ANALISI DELLA KEYWORD]: '{kw.upper()}'")
    print(f"==================================================")
    print(f"1) SINONIMI PURI (Cluster ID: {cluster_id} - Nodi: {len(synonyms)})")
    print(f"   Queste keyword verranno trattate da YACA come la stessa identica cosa:")
    print(f"   => {', '.join(synonyms)}")
    
    adj = graph['cluster_adjacency'].get(cluster_id, {})
    if not adj:
        print("\n2) PROPAGAZIONE: Nessuna adiacenza forte pre-calcolata per questo cluster.")
        return
        
    print(f"\n2) PROPAGAZIONE DELL'ENERGIA (Adiacenze Strutturali)")
    print(f"   Se il profilo utente accumula energia su '{kw}', YACA la spalmerà automaticamente qui:")
    
    sorted_adj = sorted(adj.items(), key=lambda x: x[1], reverse=True)[:7]
    for neighbor_id, weight in sorted_adj:
        neighbor_kws = graph['cluster_members'][neighbor_id]
        # Mostriamo max 4 sample per non intasare la console
        sample = neighbor_kws[:4]
        print(f"   -> Cluster {neighbor_id} [Peso: {weight:.4f}] | Keyword collegate: {', '.join(sample)}...")
        
    print(f"==================================================\n")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("💡 Uso: python test_graph.py \"tua_keyword\"")
    else:
        graph = load_graph()
        # Permettiamo di testare più keyword in un colpo solo
        for kw in sys.argv[1:]:
            test_keyword(graph, kw)
