"""fai-digest.py — il digest del lavoro, per il senior.

Richiesta dell'utente (16/10/2026): «crea digest del lavoro svolto e handoff (solo di riepilogo/
esplicativo) per il collega senior».

DENTRO, e sono quattro cose:
  1. L'HANDOFF — `handoff-senior-6.md`, che e' la porta d'ingresso: cosa e' cambiato, i numeri col
     loro metodo, le decisioni, e SOPRATTUTTO le cinque cose ritirate e le cose non verificate.
  2. LA MAPPA — `.scratch/suggerimenti/map.md`: 15 sezioni, ogni decisione con la sua misura accanto.
  3. IL CODICE — il modulo `graph/` (canon, bubbles, camminata, collocator, motore, parametri,
     pipeline) e il primo pezzo dentro il prodotto (`src/engines/bolle/`).
  4. LE MISURE — i dodici arbitri che hanno deciso il disegno attuale. Gli altri nove arbitri del
     modulo restano fuori: sono citati nella mappa, e si eseguono con un comando.

FUORI, e perche':
  · `src/data/bolle.json` (1,55 MB di JSON): e' l'artefatto, si rigenera con `pipeline esporta`
  · gli altri nove arbitri, gli script della fase 1, i report del percorso: sono la storia,
    non il sistema
  · i dati (`graph/data/`, 655 MB): si rigenerano
  · i log
"""
import pathlib

from gitingest import ingest

INCLUDE = [
    # ------------------------------------------------------------------ 1. L'HANDOFF
    ".scratch/suggerimenti/handoff-senior-6.md",
    # ------------------------------------------------------------------ 2. LA MAPPA
    ".scratch/suggerimenti/map.md",
    # ------------------------------------------------------------------ 3. IL CODICE
    "graph/*.py",
    "graph/README.md",
    "graph/measure/README.md",
    "graph/fetch/README.md",
    "src/engines/bolle/Bolle.js",
    "src/engines/bolle/README.md",
    # ------------------------------------------------------------------ 4. LE MISURE che hanno deciso
    "graph/measure/diffusione.py",
    "graph/measure/alfa.py",
    "graph/measure/pesi.py",
    "graph/measure/equilibrio.py",
    "graph/measure/freddo.py",
    "graph/measure/soglia.py",
    "graph/measure/cache.py",
    "graph/measure/ricetta.py",
    "graph/measure/intero.py",
    "graph/measure/liste.py",
    "graph/measure/lettura.py",
    "graph/measure/cataloghi.py",
    # ------------------------------------------------------------------ e i due todo di prodotto
    "todo/8_seed_cronologia_decadimento.md",
    "todo/9_assi_del_profilo.md",
]

ESCLUDI = ["*.json", "*.log", "graph/data/*", "digest*.txt", "src/data/*"]

if __name__ == "__main__":
    summary, tree, contenuto = ingest(".", include_patterns=INCLUDE, exclude_patterns=ESCLUDI,
                                      output="digest.txt")
    print(summary)
    d = pathlib.Path("digest.txt")
    tok = [r.split(":")[1].strip() for r in summary.splitlines() if "Estimated tokens" in r]
    print(f"\nfile: {d.resolve()}")
    print(f"dimensione: {d.stat().st_size/1024/1024:.2f} MB · righe {len(contenuto.splitlines()):,}")
    print(f"token stimati: {tok[0] if tok else '?'}")
    print(f"\n{'-'*70}\ncontrollo del contenuto (deve esserci, non deve esserci):")
    for etichetta, frammento, atteso in (
            ("l'handoff", "handoff-senior-6", True),
            ("la mappa", "map.md", True),
            ("il motore", "graph/motore.py", True),
            ("la camminata", "graph/camminata.py", True),
            ("la tabella", "graph/parametri.py", True),
            ("l'engine del prodotto", "Bolle.js", True),
            ("le misure", "intero.py", True),
            ("il JSON del prodotto", "bolle.json", False),
            ("script della fase 1", "ml-collaborativo", False)):
        n = contenuto.count(frammento)
        esito = "OK" if (n > 0) == atteso else "!!"
        print(f"  [{esito}] {etichetta:<24} {n:>4} occorrenze (atteso {'presente' if atteso else 'assente'})")
