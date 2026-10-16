"""fai-digest.py — UN digest: il modulo raccomandazione come e' stato costruito.

Scelta dell'utente (14/10/2026), su quattro componenti proposti:
  ✓ i cinque moduli canonici      canone, bolle, sonda, features, colloca
  ✓ tutti i prototipi             gli script dei sei effort
  ✓ la documentazione e i report  mappe, handoff, ticket, report
  ✓ GLI ESEMPI DI BOLLE           `bolle-esempi.md`: dodici bolle lette, per far vedere la struttura
  ✗ il codice del prodotto        src/ (catalog, engines, profile, dna, ai, api, db, models)

Aggiunta del 14/10/2026 (richiesta dell'utente): **un po' di esempi di bolle**, cosi' chi legge capisce
la struttura senza dedurla dai numeri. Sono in `.scratch/mappa-pesata/bolle-esempi.md`.

I sei effort, in ordine di tempo:
  ml-collaborativo   la fase 1: il grafo, i banchi, l'ordinamento, le bolle
  grafo-servibile    il primo piano dell'esperto
  bolle-nitrile      la riparazione delle bolle -> V7
  inserimento        il cold start
  todo-grafo         la terza risposta dell'esperto: i tre bug, V8, i contratti, i centroidi
  mappa-pesata       il grafo pesato, i cross-medium, il collocatore, e l'obiezione su Verity
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
    ".scratch/mappa-pesata/colloca_finale.py",
    # --- 2. GLI ESEMPI DI BOLLE: la struttura, da vedere
    ".scratch/mappa-pesata/bolle-esempi.md",
    # --- 3. la struttura: handoff, mappe, specifiche
    ".scratch/*/handoff-senior*.md",
    ".scratch/*/map.md",
    ".scratch/grafo-servibile/spec.md",
    # --- 4. i ticket
    ".scratch/*/issues/*.md",
    # --- 5. l'evidenza: i report
    ".scratch/*/ricerche/*.md",
    ".scratch/ml-collaborativo/riepilogo.md",
    ".scratch/ml-collaborativo/bolle-lette.md",
    # --- 6. TUTTI i prototipi
    ".scratch/ml-collaborativo/*.py",
    ".scratch/grafo-servibile/*.py",
    ".scratch/bolle-nitrile/*.py",
    ".scratch/inserimento/*.py",
    ".scratch/todo-grafo/*.py",
    ".scratch/mappa-pesata/*.py",
    "offline_graph_builder/*.py",
    # --- 7. i documenti che spiegano l'algoritmo del prodotto
    "docs/ALGORITHMS.md",
    "docs/CATALOG_LOGIC.md",
    ".scratch/documenti-origine/Ottimizzazione e Futuro del Grafo YACA.md",
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
print(f"\n{'-'*70}\ncontrollo del contenuto:")
for etichetta, frammento in (("i moduli canonici", "canone.py"),
                             ("GLI ESEMPI DI BOLLE", "bolle-esempi.md"),
                             ("gli handoff", "handoff-senior"),
                             ("report (l'evidenza)", "/ricerche/"),
                             ("ticket", "/issues/"),
                             ("mappe", "/map.md")):
    print(f"  {etichetta:<34} {content.count(frammento):>6}")
n_prodotto = len([ln for ln in tree.splitlines() if "src/" in ln and ln.strip().endswith(".js")])
if n_prodotto:
    print(f"\n!! sono entrati {n_prodotto} file di src/, che erano esclusi")
else:
    print("\nnessun file di src/ nell'albero: il codice del prodotto resta fuori.")
