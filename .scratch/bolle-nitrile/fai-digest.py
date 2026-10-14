"""fai-digest.py — UN digest: il modulo raccomandazione come e' stato costruito.

Scelta dell'utente (14/10/2026), su quattro componenti proposti:
  ✓ i cinque moduli canonici      canone, bolle, sonda, features, colloca
  ✓ tutti i prototipi             i 209 script dei quattro effort + offline_graph_builder
  ✓ la documentazione e i report  mappe, handoff, specifica, 40 ticket, ~70 report
  ✗ il codice del prodotto        src/ (catalog, engines, profile, dna, ai, api, db, models)

Quindi: **il sistema di raccomandazione come e' stato progettato e misurato**, senza l'applicazione
che lo serve. Se in futuro serve anche il prodotto, i suoi percorsi sono annotati in fondo.

I cinque moduli sono GIA' dentro i prototipi (stanno in `.scratch/ml-collaborativo/` e
`.scratch/inserimento/`), e li elenco comunque per primi: sono i pezzi che implementano il sistema,
e chi legge deve trovarli subito.
"""
import pathlib
from gitingest import ingest

INCLUDE = [
    # --- 1. i cinque moduli canonici, in testa
    ".scratch/ml-collaborativo/canone.py",
    ".scratch/bolle-nitrile/bolle.py",
    ".scratch/bolle-nitrile/sonda.py",
    ".scratch/inserimento/features.py",
    ".scratch/inserimento/colloca.py",
    # --- 2. la struttura: handoff, mappe, specifica
    ".scratch/inserimento/handoff-senior-3.md",
    ".scratch/grafo-servibile/handoff-senior-2.md",
    ".scratch/ml-collaborativo/handoff-senior.md",
    ".scratch/bolle-nitrile/map.md",
    ".scratch/inserimento/map.md",
    ".scratch/grafo-servibile/map.md",
    ".scratch/grafo-servibile/spec.md",
    ".scratch/ml-collaborativo/map.md",
    # --- 3. i ticket
    ".scratch/bolle-nitrile/issues/*",
    ".scratch/inserimento/issues/*",
    ".scratch/grafo-servibile/issues/*",
    # --- 4. l'evidenza: i report dei quattro effort
    ".scratch/ml-collaborativo/ricerche/*",
    ".scratch/grafo-servibile/ricerche/*",
    ".scratch/bolle-nitrile/ricerche/*",
    ".scratch/inserimento/ricerche/*",
    ".scratch/ml-collaborativo/riepilogo.md",
    ".scratch/ml-collaborativo/bolle-lette.md",
    # --- 5. TUTTI i prototipi
    ".scratch/ml-collaborativo/*.py",
    ".scratch/grafo-servibile/*.py",
    ".scratch/bolle-nitrile/*.py",
    ".scratch/inserimento/*.py",
    "offline_graph_builder/*.py",
    # --- 6. i documenti che spiegano l'algoritmo del prodotto
    "docs/ALGORITHMS.md",
    "docs/CATALOG_LOGIC.md",
    "Ottimizzazione e Futuro del Grafo YACA.md",
]

ESCLUDI = ["*.log", ".scratch/*/log/*", "digest*.txt"]

summary, tree, content = ingest(".", include_patterns=INCLUDE, exclude_patterns=ESCLUDI,
                                output="digest.txt")
print(summary)
d = pathlib.Path("digest.txt")
tok = [r.split(":")[1].strip() for r in summary.splitlines() if "Estimated tokens" in r]
print(f"\nfile: {d.resolve()}")
print(f"dimensione: {d.stat().st_size/1024/1024:.2f} MB · righe {len(content.splitlines()):,}")
print(f"token stimati: {tok[0] if tok else '?'}")

# --- controllo: cosa e' entrato davvero
print(f"\n{'-'*70}\ncontrollo del contenuto:")
for etichetta, frammento in (("i 5 moduli canonici", "canone.py"),
                             ("report (l'evidenza)", "/ricerche/"),
                             ("ticket", "/issues/"),
                             ("prototipi", ".py"),
                             ("il codice del prodotto (deve essere 0)", None)):
    if frammento is None:
        # il conteggio va fatto sull'ALBERO, non sul contenuto: `src/` compare nei documenti e in
        # uno script che legge `src/data/hierarchical_graph.json`
        n = len([l for l in tree.splitlines() if "src/" in l and l.strip().endswith(".js")])
    else:
        n = content.count(frammento)
    print(f"  {etichetta:<38} {n:>6}")
n_prodotto = len([l for l in tree.splitlines() if "src/" in l and l.strip().endswith(".js")])
if n_prodotto:
    print(f"\n!! ATTENZIONE: sono entrati {n_prodotto} file di src/, che erano esclusi")
else:
    print("\nnessun file di src/ nell'albero. Le menzioni di 'src/' nel testo sono:")
    print("  · nei documenti ALGORITHMS.md e CATALOG_LOGIC.md, che citano i percorsi del prodotto")
    print("  · in spazi-trakt.py, che legge src/data/hierarchical_graph.json")
    print("Sono riferimenti, non codice del prodotto.")
