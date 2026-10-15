# modulo — il grafo ha una casa, e un comando

## Destination

Estrarre il sistema di raccomandazione da `.scratch/` e dargli una casa usabile: un pacchetto `graph/`,
un comando unico, e la documentazione che risponde a «come lo usiamo?» senza leggere 120 report.

## Decisions so far

- **`graph/`** alla radice del repo, fuori da `src/` (che resta intatto): `canon.py` 709 righe,
  `bubbles.py` 631, `collocator.py` 267, `pipeline.py`, `README.md`.
- **Gli originali sono shim di 9 righe** che rimandano al modulo: i 117 script di misura continuano a
  funzionare e la verità resta una sola. Nessuna copia, nessuna divergenza.
- **La dipendenza dalla cartella corrente è stata tolta**: `ROOT` si ricava dal file, non da
  `pathlib.Path(".")`. Verificato caricando il modulo da `/tmp`.
- **Il comando unico**: `stato` (inventario + hash), `ricetta` (i parametri), `colloca` (i titoli
  nuovi), `voti`, `pesanti` (la sequenza, coi tempi).
- **Le due trappole** sono scritte nel README e in `RICETTA`: il triangolo non dipende dalla
  risoluzione, e i centroidi sono legati a UNA partizione.

## Not yet specified

- Se portare anche gli script pesanti dentro il modulo (oggi si lanciano come sottoprocessi). Sono
  ~600 righe che hanno prodotto i numeri, e spostarle significa non poterli ri-eseguire com'erano.
- Se il modulo debba leggere i parquet TMDB direttamente o da un'interfaccia: oggi li legge, e sono
  117.198 righe in `.cache/tmdb/`.

## Out of scope

- Toccare `src/`: la scelta resta job notturno offline.
- Rifare le misure: il modulo esegue, non ri-misura. I numeri hanno la loro data nel README.
