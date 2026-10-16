Status: ready-for-agent
Type: task
Blocked by: 08

# 09 — L'artefatto esce dal prodotto

## Perché

`src/data/bolle.json` è **3,2 MB tracciati in git**, dentro il prodotto, generati da un altro progetto
(`graph/`) a mano. Ogni clone se li porta dietro, ogni patch di codice ne trascina una versione, e il
prodotto legge un formato di cui non conosce il produttore. Dopo il ticket 08 nessuno lo legge più: resta da
decidere **come ci arriva, l'artefatto**, e chi lo possiede.

## Cosa deve uscire

- **Il file esce dal prodotto**: via da `src/data/` e via dal tracking git (con `git rm --cached`, e la regola
  in `.gitignore`).
- **La decisione su come l'artefatto raggiunge la produzione**, che è la parte vera del ticket. Candidati da
  valutare *con i numeri* (dimensione 3,2 MB, 138 MB la cartella `graph/data/` completa sul mate):
  1. **build in CI**: il workflow lo genera (`python -m graph.pipeline esporta`, ~10 s di codice, ma il
     modulo vuole i parquet TMDB in `.cache/tmdb/`) e lo mette nell'immagine;
  2. **volume sul mate**: già c'è `/srv/yaca/modulo/` con un venv e i parquet; il deploy non lo tocca;
  3. **download da `ops/`**: uno script che scarica l'artefatto da dove è pubblicato.
  La scelta deve dire anche **cosa succede quando l'artefatto non c'è** (il degrado lo definisce il contratto
  01: una riga vuota, non un feed rotto).
- **La versione**: l'artefatto porta `versione`, e il prodotto non deve cablare nessun numero (i parametri
  viaggiano lì, lezione del modulo). Dopo questo ticket, se un parametro cambia, che cosa si rifà — e chi se
  ne accorge.
- **Il cugino**: `src/data/hierarchical_graph.json` (1 MB tracciato) è l'artefatto del **vecchio** stack. La
  stessa domanda vale per lui, e la risposta sta nel 02/06 — non decidere qui al posto loro, ma lasciare la
  riga aperta nel ticket 13 se resta tracciato senza ragione.

## Come si verifica

Il test è il deploy: si cambia il codice del motore, si pubblica un artefatto nuovo, e il prodotto serve le
righe nuove **senza che nessuno tocchi il prodotto**. Se per aggiornare l'artefatto serve un commit nel
prodotto, la separazione non è finita.

## Attenzione

Il file è anche un oggetto di git: cancellarlo dal tracking **non** cancella la storia (i 3,2 MB restano nel
`.git` per sempre, 66 MB in totale). Se il peso della storia diventa un problema, è un ticket suo, con la sua
misura — non un effetto collaterale di questo.
