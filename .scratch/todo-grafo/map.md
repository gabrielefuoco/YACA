# todo-grafo — eseguire la risposta dell'esperto

## Destination

Eseguire per intero `todo grafo.md`, la terza risposta dell'esperto. Contiene cinque cose:
i **tre bug silenziosi** di `bolle-nitrile` (§0), la **soluzione in due mosse per le serie** (§1),
la **mappa a 6+2** al posto della tassonomia 4+2 (§2), il **congelamento di V7** (§3), i **tre
contratti automatici** che impediscono agli artefatti di ripetersi (§4), e i **due script** che
chiudono il cerchio prima di `src/` (§5).

Esito atteso: la partizione (V7 o la sua corretta), le serie collocate a freddo con un numero
onesto, la mappa finale, e i contratti che rendono impossibile il settimo artefatto.

## Decisions so far

- **I tre bug sono reali**, verificati sul codice il 14/10/2026:
  - `genres` manca da `COLS_M` **e** `COLS_T` (`bolle.py` 476-479) mentre viene letto a riga 513:
    `GEN` e' l'insieme vuoto per tutti i titoli, quindi la maschera di genere tagliava solo sulle
    keyword, e le firme `pg:paese|decennio|genere` perdevano il genere. **La colonna esiste nei
    parquet**: la correzione e' aggiungere `"genres"` alle due liste.
  - `min_sim_kw=0.12, min_sim_cast=0.12` con `con_shrinkage=True` in `10-vicinanza.py`: coi coseni
    schiacciati a ~[0, 0.25] dallo shrinkage, 0.12 taglia quasi tutto `CAST`. Nel modulo canonico
    il default e' gia' 0.02: **il bug e' nel chiamante**, non in `bolle.py`.
  - `potatura_nucleo`: `fuori.getrow(r)` legge solo meta' degli archi quando `M` e' il triangolo
    superiore. L'autore lo sapeva (l'helper `versus` gestisce il triangolo), ma non li' dentro.
  - **Quarto bug, non segnalato:** `costruisci_insiemi` legge `networks`, `production_countries` e
    `production_companies` e il `return` non le restituisce. Il network e lo studio — cioe' il modo
    piu' diretto di nominare il mondo di una serie — sono calcolati e buttati via. E' la ragione
    meccanica dietro l'osservazione §1.2 dell'esperto.
- **I parquet hanno molte piu' colonne di quelle usate**: `recommendations` (di TMDB), `spoken_languages`,
  `writers`, `original_language`, `type`, `ita`, `watch_providers_it`, `vote_average`.
- Il timore dell'esperto che le serie non abbiano `networks` e' **infondato**: c'e', ed e' gia' letto.
- Il taglio del 76,3% di `DIR` si e' rivelato benefico *a lettura*, ma era un effetto del bug.
  La correzione va **misurata**, non assunta migliore: il confronto V7/V8 decide.
- V7 va **congelato** solo se V8 non lo batte. L'esperto dice RB 100 definitivo (Ticket 09):
  RB 200 frantuma, RB 60 cola.

## Not yet specified

- Se correggere i tre bug migliori o peggiori la partizione: si misura.
- Il valore di `lambda` nella fusione diretto+ponte, e se convenga tararlo sulle sentinelle o
  sul banco delle 600.
- Se `networks` da solo basti per le bolle-serie, o serva anche `production_companies`.
- Se i centroidi vadano pesati per purezza interna come suggerisce l'esperto, o se il peso lineare
  peggiori (una bolla pura e una contaminata riceverebbero lo stesso vettore medio).

## Out of scope

- `src/`: nessuna modifica al prodotto. Questo effort chiude il prototipo.
- La tassonomia "4 canonici + 2 vibe": da buttare (§2), non da riparare.
- Rimpicciolire le bolle: no, 162 e' la dimensione del prodotto (§3).
