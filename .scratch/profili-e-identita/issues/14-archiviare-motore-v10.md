# Archiviare il motore V10 e gli esperimenti Python offline

Status: resolved
Type: task
Blocked by: —

## Cosa è stato verificato

Il percorso di servizio importa esattamente questi moduli Python:

```
servizio.py · interessi.py · tassonomia.py · assi.py · kids.py · canon.py
parametri.py · camminata.py · provenance.py · runtime/{engine,prepara,bench}.py
```

Tutto il resto di `services/graph/` è **offline**: `motore.py` (1.714 righe, il motore V10) è importato solo da `pipeline.py` e da `measure/*`; `collocator.py`, `uscite.py`, `bubbles.py`, `estensione_bolle.py`, `anime.py`, `steps/*`, `upstream/*`, `measure/*` non sono raggiungibili dal servizio.

`camminata.py` **resta**: il runtime lo importa per `pota()` e `pesi_semi()`, anche se poi non usa `transizione_pronta()`.

## Cosa va fatto

1. **Archiviare** (spostare in una cartella dichiarata, non cancellare: sono esperimenti documentati e alcuni test li citano) `motore.py`, `pipeline.py`, `collocator.py`, `uscite.py`, `bubbles.py`, `estensione_bolle.py`, `anime.py`, `measure/`, `steps/`, `upstream/`, `legacy`. Destinazione proposta: `services/graph/_archivio-v10/` con un `README.md` che dice cos'è, perché è lì, e come si riattiva.
2. **`services/graph/build/` resta dov'è**: è la pipeline riproducibile dai dati grezzi, una decisione presa prima e non da rivedere qui.
3. **Togliere i riferimenti stale nei commenti** dei moduli vivi: `V10`, `bolle`, `graph_dense` compaiono in ~25 file e rendono difficile capire cosa è vivo. Non riscrivere la documentazione: correggere solo dove il commento descrive un percorso che non esiste più.
4. **`services/graph/pipeline.py`**: se va in archivio, dichiarare che il comando offline ora è `python -m graph.build`. Se resta, togliere `largo`/`lontano` dal comando `lista` (cursori rimossi).

## Vincoli

- Dopo l'archiviazione, `PYTHONPATH=services py -m pytest services/graph/tests -q` deve passare: i test importano `camminata`, `canon`, `interessi`, `assi`, `kids`, `servizio`. Se un test importa un modulo archiviato, il test si archivia con lui e lo si nomina.
- Il servizio deve avviarsi: `/health` verde, `/scaffali` e `/raccomanda` invariati.
- Nessun commit, nessun deploy.

## Esito

`services/graph/` contiene solo ciò che serve a costruire e servire; gli esperimenti stanno in una cartella che si capisce a colpo d'occhio; i commenti non rimandano più a un motore che non esiste.


## Esito (sintesi)

Fatto: nove moduli spostati in `services/graph/_archivio-v10/` con README; `camminata.py` resta perché il runtime ne usa `pota()` e `pesi_semi()`. 96 test verdi, golden 0.000e+00.
