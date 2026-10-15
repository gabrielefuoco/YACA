# L'estrazione: il grafo ha una casa

`15/10/2026` · `graph/` alla radice del repo · `src/` **intatto**

## Il problema, misurato prima di risolverlo

| | |
|---|---|
| i moduli canonici | **1.838 righe sparse in tre cartelle di `.scratch/`** |
| script che fanno il ballo dei path per importarli | **117** |
| dipendenza dalla cartella corrente | `ROOT = pathlib.Path(".").resolve()` — funzionava **solo** dalla radice |
| librerie esterne | numpy, scipy, pandas, igraph, leidenalg, sklearn — **pulite** |

Il codice era pulito; non aveva una casa. E la cosa si e' pagata: il 15/10 ho letto 100 inserimenti
contro la partizione sbagliata — *Deadpool & Wolverine* tra i telefilm americani — perche' le
dipendenze fra partizione e centroidi non erano scritte da nessuna parte.

## Cosa e' stato fatto

```
graph/
  canon.py       709 righe   <- .scratch/ml-collaborativo/canone.py
  bubbles.py     631 righe   <- .scratch/bolle-nitrile/bolle.py
  collocator.py  267 righe   <- .scratch/mappa-pesata/colloca_finale.py
  pipeline.py                il comando unico (nuovo)
  README.md                  la ricetta, l'inventario, le trappole, i numeri (nuovo)
```

**Gli originali sono shim di 9 righe** che rimandano al modulo: i 117 script continuano a funzionare,
e non c'e' nessuna copia da tenere allineata. Verificato: uno script che fa `sys.path.insert` e
`import bolle` ottiene il modulo.

**La dipendenza dalla cartella corrente e' tolta**: `ROOT = pathlib.Path(__file__).resolve().parent.parent`.
Verificato caricando il modulo da `/tmp` — prima funzionava solo dalla radice.

## Il comando unico

```bash
python -m graph.pipeline stato     # 11 artefatti vivi, 7 esperimenti, 0 mancanti, e i due hash ALLINEATI
python -m graph.pipeline ricetta   # i dieci pesi della miscela, la risoluzione, le soglie
python -m graph.pipeline colloca nuovi.json    # Verity -> bolla 820
python -m graph.pipeline pesanti   # la sequenza completa, coi tempi misurati
```

`stato` e' il comando da lanciare per primo: inventario, dimensioni, e **la verifica degli hash** di
idf e vocabolario — il controllo che ha fermato l'errore di *Deadpool*.

## Cosa NON e' stato fatto, e perche'

**Gli script pesanti restano dove sono** (`eterogeneo/01`, `eterogeneo/02-v10`, `eterogeneo/11`): sono
~600 righe che hanno **prodotto i numeri**, e spostarle dentro il modulo significherebbe non poterle
ri-eseguire com'erano — cioe' poter riprodurre solo cio' che si e' portato, non cio' che si e'
misurato. `pesanti` stampa la sequenza coi parametri esatti.

**I JSON si leggono in utf-8 con ripiego su cp1252**: su Windows un `open()` senza encoding scrive in
cp1252, e una «e'» in un titolo italiano fa fallire il caricamento. Meglio leggere che pretendere.
