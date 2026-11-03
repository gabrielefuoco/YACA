Status: resolved
Type: task

# Provenienza content-addressed: chiudere la classe "build sbagliata in silenzio"

## Perché

Tre bug ricorrenti hanno la stessa radice: fallback permissivi e impronte incomplete.

- `mixer.py` legge `{MIX_OUT}/pesi.json`; se manca, **tutti i pesi diventano 1,0 in silenzio** (una
  intera build V18 è andata così).
- `chiudi.py` deve girare **dopo** il mixer; invertito, produce un grafo con la stessa topologia e pesi
  diversi, senza errori.
- `transizione_pronta()` cachea su (sha del grafo, k) ma **non** tiene conto della chiusura.
- `covision-list.py` scrive un path fisso e non aggiorna il manifest.

## Cosa fare

1. `provenance.py` con `scrivi(path, matrice, step, params, inputs)` che scrive dentro l'`.npz` una
   chiave `_provenance` con: `canon_len`, `canon_sha256`, `step`, `params_sha256`,
   `inputs = {nome: sha256}`.
2. `mixer.py`: **FileNotFoundError** se `pesi.json` manca. Nessun default.
3. `chiudi.py`: rifiuta un input il cui `step != "mixer"`.
4. `camminata.transizione_pronta()`: chiave di cache = `_provenance["sha256"]`, non lo sha del file.
5. `tipi.py`, `mixer.py`, `chiudi.py`, `chiudi` → `prov` obbligatoria su ogni output.

## Criteri di accettazione

- Un test `test_provenance.py` che: (a) rimuove `pesi.json` e verifica che il mixer fallisca;
  (b) passa un output non-mixer a `chiudi.py` e verifica il rifiuto; (c) verifica che due build con
  parametri diversi abbiano `params_sha256` diversi.
- `build-v18.sh` con un input mancante si ferma al primo passo, senza produrre artefatti.
- Costo runtime < 5 ms.

## Nota

Il proprio docstring di `chiudi.py` dichiarava già che la chiusura non cambia la topologia — ed è
esattamente il tipo di informazione che va **dentro** l'artefatto, non solo in un commento: se fosse
stata nella provenienza, ci avremmo messo tre versioni a capire il moltiplicatore ×1211.

---

## Esito

`services/graph_dense/provenance.py` (`scrivi`, `leggi`, `verifica`, `chiave_cache`) + cablaggio in
`mixer.py` (`FileNotFoundError` se `pesi.json` manca o se un tipo non ha un peso dichiarato: niente più
fallback a 1,0), `chiudi.py` (rifiuta input con step ≠ `mixer`, con `--legacy-ok` esplicito e
registrato nella provenienza) e `camminata.transizione_pronta()` (chiave di cache = provenienza, non
sha del file).

Sei test coprono: andata/ritorno, artefatto senza provenienza rifiutato, step sbagliato rifiutato,
input cambiato rifiutato, chiave che cambia col contenuto, file assente → chiave vuota.
