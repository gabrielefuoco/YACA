"""fai-digest.py — il digest di TUTTO il modulo e dei ticket svolti, per il senior.

Richiesta del proprietario (16/10/2026): «fai il digest di tutto il modulo e dei ticket svolti, con un
handoff. chiedigli se c'e' qualche altro bug, qualcosa da controllare o i prossimi passi».

Dentro, in quest'ordine di importanza:
  1. L'HANDOFF 7 — la porta d'ingresso, e in fondo le TRE DOMANDE (BUG / COSA CONTROLLARE / PROSSIMI PASSI).
     C'e' anche l'handoff 6, che e' il riepilogo precedente: il 7 dice cosa e' cambiato dopo la revisione.
  2. I TICKET — i 16 file di `.scratch/suggerimenti/issues/`, con le prove, i fix e le cose NON verificate.
     E' lo stato del lavoro, raccontato ticket per ticket.
  3. IL MODULO — `graph/`: il codice, i 21 arbitri (le misure), gli step della costruzione, i README.
  4. IL PRODOTTO — l'engine `src/engines/bolle/` e il suo README.
  5. I TEST — `tests/test_graph_pipeline.py` (12 + 5 prove, 2,5 s) e `tests/bolleParity.test.js`.
  6. GLI SCRIPT degli edit — `sostituisci-ppr.py` e `parametri-nei-file.py`: servono a leggere il §2
     dell'handoff 7, che parla dei loro effetti collaterali.
  7. LA MAPPA — il registro della ricerca (15 sezioni, ogni decisione con la sua misura). E' anteriore
     alla revisione: le cose cambiate dopo stanno nei ticket e nell'handoff 7.

Fuori, e perche':
  · `src/data/bolle.json` (2,5 MB di JSON) e `graph/data/` (655 MB di artefatti): si rigenerano con
    `python -m graph.pipeline build` (e adesso c'e' il DAG che dice cosa va rifatto)
  · `.cache/` (i dati scaricati), i log, i file temporanei
  · `graph/upstream/`: la preparazione dei dati, non il sistema
"""
import pathlib

from gitingest import ingest

INCLUDE = [
    # ------------------------------------------------------------- 1. l'handoff, e quello prima
    ".scratch/suggerimenti/handoff-senior-7.md",
    ".scratch/suggerimenti/handoff-senior-6.md",
    # ------------------------------------------------------------- 2. i ticket svolti
    ".scratch/suggerimenti/issues/*.md",
    # ------------------------------------------------------------- 3. il modulo
    "graph/*.py",
    "graph/README.md",
    "graph/measure/*.py",
    "graph/measure/README.md",
    "graph/steps/*.py",
    "graph/fetch/README.md",
    # ------------------------------------------------------------- 4. il prodotto
    "src/engines/bolle/Bolle.js",
    "src/engines/bolle/README.md",
    # ------------------------------------------------------------- 5. i test
    "tests/test_graph_pipeline.py",
    "tests/bolleParity.test.js",
    # ------------------------------------------------------------- 6. gli script degli edit
    ".scratch/suggerimenti/sostituisci-ppr.py",
    ".scratch/suggerimenti/parametri-nei-file.py",
    ".scratch/suggerimenti/prova-pesi.js",
    # ------------------------------------------------------------- 7. la mappa
    ".scratch/suggerimenti/map.md",
]

ESCLUDI = ["*.json", "*.log", "graph/data/*", "src/data/*", "digest*.txt", "__pycache__/*", "*.npy",
           "*.npz", "*.parquet"]

if __name__ == "__main__":
    summary, tree, contenuto = ingest(".", include_patterns=INCLUDE, exclude_patterns=ESCLUDI,
                                      output="digest_7.txt")
    print(summary)
    d = pathlib.Path("digest_7.txt")
    tok = [r.split(":")[1].strip() for r in summary.splitlines() if "Estimated tokens" in r]
    print(f"\nfile: {d.resolve()}")
    print(f"dimensione: {d.stat().st_size/1024/1024:.2f} MB · righe {len(contenuto.splitlines()):,}")
    print(f"token stimati: {tok[0] if tok else '?'}")

    # I CONTROLLI GUARDANO I FILE, NON LE OCCORRENZE DEL TESTO.
    # La volta scorsa contavano le stringhe — e `bolle.json` risultava «presente» perche' il nome
    # compare nel codice, mentre `ml-collaborativo` risultava incluso perche' e' citato nei commenti.
    righe = [l.strip() for l in tree.splitlines() if l.strip() and not l.strip().endswith("/")]
    nomi = [righe_i.split("/")[-1].replace("\\", "").strip() for righe_i in righe]
    nomi = [n for n in nomi if "." in n]
    print(f"\n{'-'*72}\ncontrollo sull'ALBERO (file inclusi: {len(nomi)}):")
    for etichetta, presente, frammento in (
            ("handoff 7", True, "handoff-senior-7"),
            ("handoff 6", True, "handoff-senior-6"),
            ("i 16 ticket", True, "06-slider-canone"),
            ("il DAG", True, "pipeline.py"),
            ("la diffusione unificata", True, "camminata.py"),
            ("la storia unica", True, "canon.py"),
            ("la tabella dei parametri", True, "parametri.py"),
            ("gli step", True, "03_divisione_voti.py"),
            ("gli arbitri", True, "intero.py"),
            ("l'engine del prodotto", True, "Bolle.js"),
            ("i test python", True, "test_graph_pipeline.py"),
            ("il test di parita'", True, "bolleParity.test.js"),
            ("gli script degli edit", True, "sostituisci-ppr.py"),
            ("la mappa", True, "map.md"),
            ("l'ARTEFATTO (2,5 MB di JSON)", False, "bolle.json"),
            ("gli artefatti (655 MB)", False, "bolle-eterogeneo-subvoti.npy"),
            ("altre cartelle della repo", False, "HierarchicalGraph.js"),
            ("gli upstream", False, "00_pulizia_movielens.py")):
        n = sum(1 for x in nomi if frammento in x)
        esito = "OK" if (n > 0) == bool(presente) else "!!"
        print(f"  [{esito}] {etichetta:<30} {n:>3} file (atteso {'presente' if presente else 'assente'})")
