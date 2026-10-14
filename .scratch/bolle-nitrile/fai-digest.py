"""fai-digest.py — UN digest unico, con tutto quello che serve per giudicare il sistema.

`ingest(".")` prendeva 1.097 file e 2,6M token: era tutto il repo, non tutto il necessario. Qui la
lista e' esplicita, e il criterio e' uno solo: **serve a capire o a giudicare il sistema di
raccomandazione?**

DENTRO
  · i tre handoff, le quattro mappe, la specifica
  · i 36 ticket dei tre effort con i ticket
  · i ~70 report dei quattro effort: sono l'EVIDENZA, ogni numero sta li'
  · TUTTO il codice dei prototipi (209 script): e' il sistema come e' stato costruito
  · il codice del PRODOTTO che tocca la raccomandazione: catalog, engines, profile, dna, ai,
    services, api, db, models, config
  · i documenti del prodotto: ALGORITHMS.md, CATALOG_LOGIC.md e gli altri che spiegano il sistema
  · offline_graph_builder

FUORI, e va detto
  · l'infrastruttura del prodotto che non c'entra: cache, poster, middleware, handlers, utils,
    assets. Se serve, si aggiunge con una riga.
  · i log grezzi (~2 MB): sono l'output di cio' che i report gia' raccontano
  · package-lock.json, i binari, i modelli: li salta gitingest
"""
import pathlib
from gitingest import ingest

INCLUDE = [
    # --- la struttura: si legge per prima
    ".scratch/inserimento/handoff-senior-3.md",
    ".scratch/grafo-servibile/handoff-senior-2.md",
    ".scratch/ml-collaborativo/handoff-senior.md",
    ".scratch/bolle-nitrile/map.md",
    ".scratch/inserimento/map.md",
    ".scratch/grafo-servibile/map.md",
    ".scratch/grafo-servibile/spec.md",
    ".scratch/ml-collaborativo/map.md",
    ".scratch/bolle-nitrile/issues/*",
    ".scratch/inserimento/issues/*",
    ".scratch/grafo-servibile/issues/*",
    # --- l'evidenza: i report dei quattro effort
    ".scratch/ml-collaborativo/ricerche/*",
    ".scratch/grafo-servibile/ricerche/*",
    ".scratch/bolle-nitrile/ricerche/*",
    ".scratch/inserimento/ricerche/*",
    ".scratch/ml-collaborativo/riepilogo.md",
    ".scratch/ml-collaborativo/bolle-lette.md",
    # --- il codice dei prototipi: TUTTO
    ".scratch/ml-collaborativo/*.py",
    ".scratch/grafo-servibile/*.py",
    ".scratch/bolle-nitrile/*.py",
    ".scratch/inserimento/*.py",
    "offline_graph_builder/*.py",
    # --- il prodotto, la parte che tocca la raccomandazione
    "src/catalog/**/*.js",
    "src/engines/**/*.js",
    "src/profile/**/*.js",
    "src/dna/**/*.js",
    "src/ai/**/*.js",
    "src/services/**/*.js",
    "src/api/**/*.js",
    "src/db/**/*.js",
    "src/models/**/*.js",
    "src/cache/cacheInstances.js",
    "src/cache/CacheManager.js",
    "src/config.js",
    "src/index.js",
    # --- i documenti che spiegano il sistema
    "docs/ALGORITHMS.md",
    "docs/CATALOG_LOGIC.md",
    "docs/AI_ENGINE.md",
    "docs/DUCKDB_ARCHITECTURE.md",
    "README.md",
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
print(f"\n{'-'*70}\nper capire cosa c'e' dentro:")
for etichetta, glob in (("report (evidenza)", "ricerche/"),
                        ("ticket", "issues/"),
                        ("codice prototipi", ".scratch/*.py"),
                        ("codice prodotto", "src/")):
    print(f"  {etichetta:<20} {content.count(etichetta if etichetta != 'codice prototipi' else '.scratch')}")
