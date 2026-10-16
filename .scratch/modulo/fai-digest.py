"""fai-digest.py — il digest per la valutazione: il codice finito e la documentazione utile.

Richiesta dell'utente (15/10/2026): «digest di solo la roba finale + la documentazione utile, poi
handoff per senior, così gli diamo il codice pulito e lo facciamo valutare».

DENTRO, e sono tre cose:
  1. IL MODULO — `graph/`: canon, bubbles, collocator, pipeline, e le quattro cartelle
     (steps · upstream · fetch · measure) coi loro README. E' il codice che si valuta.
  2. L'HANDOFF — `handoff-senior-5.md`, che dice cosa guardare, in che ordine, e cosa non e' verificato.
  3. LA DOCUMENTAZIONE UTILE — una selezione di ~8 report: quelli che portano le decisioni e le loro
     prove, non i 120 del percorso. Il criterio: se un report non cambia una decisione, non entra.

FUORI, e perche':
  · i 300+ script di misura e i 120 report del percorso: sono la storia, non il sistema
  · `graph/data/` (435 MB di binari): gli artefatti, che si rigenerano coi comandi del README
  · `src/` e tutto il prodotto: non e' stato toccato, e non si valuta qui
  · i log
"""
import pathlib
from gitingest import ingest

INCLUDE = [
    # ---------------------------------------------------------- 1. IL MODULO
    "graph/*.py",
    "graph/README.md",
    "graph/__init__.py",
    "graph/steps/*.py",
    "graph/upstream/*.py",
    "graph/fetch/*.js",
    "graph/fetch/README.md",
    "graph/measure/*.py",
    "graph/measure/README.md",
    # ---------------------------------------------------------- 2. L'HANDOFF
    ".scratch/modulo/handoff-senior-5.md",
    # ---------------------------------------------------------- 3. LA DOCUMENTAZIONE UTILE
    ".scratch/modulo/ricerche/estrazione.md",          # cosa sta dove, e perche'
    ".scratch/modulo/map.md",
    ".scratch/eterogeneo/ricerche/esiti.md",           # i risultati finali
    ".scratch/eterogeneo/map.md",
    ".scratch/coerenza/ricerche/10-consolidamento.md", # il consolidamento
    ".scratch/coerenza/ricerche/820-la-bolla-che-non-era-un-minestrone.md",   # la ritrattazione
    ".scratch/coerenza/ricerche/02-03-coerenza.md",    # l'indice di chimera e N_eff: il metodo
    ".scratch/coerenza/ricerche/04-trama.md",          # la metrica di trama, e il modello sbagliato
    ".scratch/todo-grafo/ricerche/08-congelamento.md", # il congelamento di V8
    "todo/8_seed_cronologia_decadimento.md",           # l'unica cosa aperta, ed e' fuori dal grafo
    ".scratch/documenti-origine/Ottimizzazione e Futuro del Grafo YACA.md",       # il documento da cui e' nato tutto
]

ESCLUDI = ["*.log", ".scratch/*/log/*", "graph/data/*", "digest*.txt"]

summary, tree, content = ingest(".", include_patterns=INCLUDE, exclude_patterns=ESCLUDI,
                                output="digest.txt")
print(summary)
d = pathlib.Path("digest.txt")
tok = [r.split(":")[1].strip() for r in summary.splitlines() if "Estimated tokens" in r]
print(f"\nfile: {d.resolve()}")
print(f"dimensione: {d.stat().st_size/1024/1024:.2f} MB · righe {len(content.splitlines()):,}")
print(f"token stimati: {tok[0] if tok else '?'}")
print(f"\n{'-'*72}\ncontrollo del contenuto:")
for etichetta, frammento in (("il modulo (graph/)", "graph/canon.py"),
                             ("il comando unico", "graph/pipeline.py"),
                             ("gli arbitri", "measure/"),
                             ("i produttori", "upstream/"),
                             ("i fetcher", "fetch/fetch-trakt"),
                             ("l'handoff", "handoff-senior-5"),
                             ("i report scelti", "ricerche/")):
    print(f"  {etichetta:<26} {content.count(frammento):>5}")
n_prodotto = len([l for l in tree.splitlines() if "/src/" in l and l.strip().endswith(".js")])
print(f"\nfile di src/ nell'albero: {n_prodotto} (deve essere 0 — il prodotto non si valuta qui)")
n_archivio = len([l for l in tree.splitlines()
                  if ".scratch/" in l and l.strip().endswith(".py")])
print(f"script di .scratch/ nell'albero: {n_archivio} (devono essere pochi: e' la selezione)")
