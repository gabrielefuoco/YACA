"""cataloghi.py — i cataloghi attivi, valutati offline: la prima fetta, e la piu' significativa.

PERCHE' ESISTE. Il freddo (§3c) semina dai **cataloghi attivi** del profilo: i titoli presenti in piu'
di un catalogo, o i top 2-3 di ognuno. Ma i cataloghi non sono mai stati valutati fuori dal prodotto, e
senza non sappiamo **se la regola ha materiale**: se nessun titolo sta in due cataloghi, la prima
strada e' vuota e parte sempre la seconda. I tre `CATALOGHI_*` di `graph/parametri.py` sono marcati
INVENTATI proprio per questo.

LA FETTA. Si comincia dalla famiglia «Registi & Autori», dove il filtro **e' una persona** e quindi e'
replicabile dal nostro parquet: 16 cataloghi tipo `preset_nolan` (`with_crew: 525`, `vote_count >= 200`,
ordina per voto). La struttura completa dei preset e' in `src/data/presets.js`: ogni voce ha `queries`
con parametri in stile TMDB (`with_crew`, `without_genres`, `vote_count.gte`, `sort_by`), quindi il
resto e' replicabile allo stesso modo — con due approssimazioni dichiarate:

  1. `with_crew` nel prodotto e' TUTTA la troupe; nei nostri parquet ci sono solo **registi** e cast.
     Per questa famiglia l'approssimazione e' quasi esatta (sono registi), ma va detta.
  2. un catalogo e' una **pagina** in cima a un ordinamento, non tutto cio' che combacia: si prende
     `PAGINA` titoli, il numero lo decide il prodotto (`ITEMS_PER_PAGE`).

    python graph/measure/cataloghi.py
"""
import json
import pathlib
import re
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K
from graph import parametri as P

T0 = time.time()
PAGINA = 40          # quanti titoli mostra un catalogo: il prodotto usa ITEMS_PER_PAGE (config)

# GLI ID DI presets.js E I NOMI CHE USIAMO NOI. I parquet hanno i nomi come stringhe, i preset usano
# gli id TMDB: la mappa e' corta (28 persone in TMDB_PEOPLE) e va scritta a mano una volta.
PERSONE = {
    525: "Christopher Nolan", 138: "Quentin Tarantino", 488: "Steven Spielberg",
    1032: "Martin Scorsese", 240: "Stanley Kubrick", 137427: "Denis Villeneuve",
    7467: "David Fincher", 5602: "David Lynch", 10828: "Guillermo del Toro",
    291263: "Jordan Peele", 190: "Clint Eastwood", 2710: "James Cameron",
    865: "Michael Bay", 11770: "John Carpenter", 2636: "Alfred Hitchcock",
    578: "Ridley Scott", 608: "Hayao Miyazaki", 510: "Tim Burton", 108: "Peter Jackson",
    5655: "Wes Anderson",
}


def chiavi_a_id():
    """{chiave di TMDB_PEOPLE: id} — letto da presets.js invece di riscriverlo a mano."""
    testo = (K.ROOT / "src" / "data" / "presets.js").read_text(encoding="utf-8")
    blocco = re.search(r"const TMDB_PEOPLE = \{(.*?)\n\};", testo, re.S)
    if not blocco:
        return {}
    return {k: int(v) for k, v in re.findall(r"(\w+): (\d+)", blocco.group(1))}


def leggi_preset():
    """Estrae i preset della famiglia «registi» da `src/data/presets.js`.

    Non si interpreta tutto il file (179 voci con parametri TMDB diversi): si prendono le voci che
    hanno `with_crew` con UNA persona di TMDB_PEOPLE — la famiglia «Regia: X» — e i suoi numeri.
    """
    testo = (K.ROOT / "src" / "data" / "presets.js").read_text(encoding="utf-8")
    fuori = []
    for m in re.finditer(r"\{ id: '([^']+)', name: '([^']+)'.*?queries: \[\{(.*?)\}\]", testo):
        pid, nome, corpo = m.group(1), m.group(2), m.group(3)
        crew = re.search(r"with_crew: (?:\$\{TMDB_PEOPLE\.(\w+)\}|TMDB_PEOPLE\.(\w+))", corpo)
        if not crew:
            continue
        chiave = crew.group(1) or crew.group(2)
        voti = re.search(r"'vote_count\.gte': (\d+)", corpo)
        fuori.append(dict(id=pid, nome=nome, persona=chiave,
                          voti=int(voti.group(1)) if voti else 0,
                          tipo="tv" if "'tv'" in m.group(0) else "movie"))
    return fuori


def main():
    print("=" * 104)
    print("I CATALOGHI, VALUTATI OFFLINE — prima fetta: la famiglia «Registi»")
    print("=" * 104, flush=True)

    id_di = chiavi_a_id()
    print(f"  persone lette da presets.js: {len(id_di)}", flush=True)
    N = B.N
    VOTI = np.zeros(N)
    VAVG = np.zeros(N)
    REGISTI = [set() for _ in range(N)]
    ANNO = np.zeros(N)
    for tipo, f, col_regia, col_data in (("movie", "movies.parquet", "directors", "release_date"),
                                        ("tv", "tv.parquet", "created_by", "first_air_date")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f,
                            columns=["id", "vote_count", "vote_average", col_regia, col_data])
        for k in range(len(d)):
            riga = d.iloc[k]
            r = B.ROW_OF.get(f"{tipo}:{int(riga['id'])}")
            if r is None:
                continue
            v = pd.to_numeric(riga["vote_count"], errors="coerce")
            VOTI[r] = float(v) if not pd.isna(v) else 0.0
            a = pd.to_numeric(riga["vote_average"], errors="coerce")
            VAVG[r] = float(a) if not pd.isna(a) else 0.0
            ax = str(riga.get(col_data) or "")[:4]
            ANNO[r] = float(ax) if ax.isdigit() else 0.0
            grezzo = riga.get(col_regia)
            try:
                voci = json.loads(grezzo) if isinstance(grezzo, str) else (grezzo or [])
            except Exception:
                voci = []
            for x in voci:
                n = x.get("name") if isinstance(x, dict) else x
                if n:
                    REGISTI[r].add(str(n).strip().lower())
    print(f"  parquet letti: {int((VOTI > 0).sum()):,} titoli con voti · "
          f"{sum(1 for s in REGISTI if s):,} con un regista ({time.time()-T0:.0f}s)", flush=True)

    presets = leggi_preset()
    print(f"  preset della famiglia «registi» trovati in presets.js: {len(presets)}")
    catal = {}
    for pr in presets:
        nome = PERSONE.get(id_di.get(pr["persona"], -1), None)
        if nome is None:
            print(f"    {pr['id']}: persona {pr['persona']} non mappata, salto")
            continue
        chiave = nome.lower()
        idx = [r for r in range(N) if chiave in REGISTI[r] and VOTI[r] >= pr["voti"]]
        idx.sort(key=lambda r: -VAVG[r])
        catal[pr["nome"]] = idx[:PAGINA]
    if catal:
        print(f"  cataloghi costruiti: {len(catal)} · titoli per catalogo: mediana "
              f"{int(np.median([len(v) for v in catal.values()]))}")
    else:
        print("  NESSUN catalogo costruito: controllo la mappa delle persone")
        return

    tutti = [r for v in catal.values() for r in v]
    conteggio = pd.Series(tutti).value_counts()
    ripetuti = conteggio[conteggio >= P.CATALOGHI_MIN_RIPETIZIONI]
    print(f"\n  TITOLI IN PIU' DI UN CATALOGO (la regola del freddo): "
          f"{len(ripetuti)} su {len(conteggio)} distinti ({100*len(ripetuti)/max(len(conteggio),1):.1f}%)")
    if len(ripetuti):
        print("  i piu' ripetuti:")
        for r, c in ripetuti.head(8).items():
            dove = [n for n, v in catal.items() if r in v][:3]
            print(f"    {str(TITOLO.get(r, r))[:40]:<42} in {c} cataloghi: {dove}")
    else:
        print("  -> NESSUNO. La prima strada del freddo e' vuota per questa famiglia: parte sempre la")
        print("     seconda (i top 2-3 di ogni catalogo). E' un fatto, non un'ipotesi.")

    print(f"\n  SOVRAPPOSIZIONE FRA CATALOGHI (quanti titoli in comune, su {PAGINA} per catalogo):")
    nomi = list(catal)
    coppie = []
    for i in range(len(nomi)):
        for j in range(i + 1, len(nomi)):
            si, sj = set(catal[nomi[i]]), set(catal[nomi[j]])
            if si and sj:
                coppie.append((len(si & sj), nomi[i], nomi[j]))
    coppie.sort(reverse=True)
    for n, a, b in coppie[:6]:
        print(f"    {n:>3} in comune · {a} <-> {b}")
    print(f"    mediana delle coppie: {int(np.median([c[0] for c in coppie]))} titoli in comune")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


TITOLO = {}


if __name__ == "__main__":
    # i titoli servono solo per la stampa degli esempi
    for tipo, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
        for i, t in zip(d["id"], d[col]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is not None:
                TITOLO[r] = str(t)
    main()
