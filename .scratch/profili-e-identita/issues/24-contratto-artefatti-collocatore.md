Status: ready-for-agent
Type: task
Blocked by: —

# Gli artefatti del collocatore hanno un contratto, non una cartella

## Il problema, in una riga

Tutto quello che fa funzionare il collocatore vive in `.cache/` — che è **nella `.gitignore`** (riga 112).

```
.cache/fonti/                0,35 GiB    strutture congelate delle sette fonti
.cache/ingressi/             3 MB        ricetta degl'ingressi (vocab, idf, gerarchia, keep)
.cache/studente-finale.pt    237 MB      il modello (sha 4bed8686…)
.cache/studente-finale.npz   584 MB      i vettori Z
```

Un `rm -rf .cache`, un cleanup, una macchina nuova: **sparisce tutto**. Ed è esattamente la storia del
ticket 15 — `rrfstudent-norrfst.npz` stava in una cartella di lavoro, non in un contratto, e l'abbiamo
perso cancellando 33 GB di roba che sembrava derivata.

La differenza con allora: adesso sappiamo che quelle cose valgono ore di GPU e di ricostruzione, e che
due artefatti (l'originale `RRFST` e l'originale `CREWPROP`) sono già stati persi una volta.

## Cosa deve esistere

1. **Una cartella che non è una cache.** Es. `services/graph/data/collocatore/`, sorella di `v45/` che
   gode già dello statuto di «freeze intoccabile». Non deve stare sotto `.cache/`.
2. **Un `manifest.json` versionato** in git, con: nome del file, sha256, dimensione, **come si
   rigenera** (il comando esatto) e quanto costa. Un artefatto senza ricetta è già perso, solo che
   non lo sa.
3. **Un controllo che rifiuta, non ripiega.** Come `canon.A()`: se un artefatto manca o lo sha non
   torna, la pipeline del collocatore **si ferma con un messaggio che nomina il comando di
   rigenerazione**. Mai un risultato plausibile ottenuto da un artefatto diverso.
4. **Una riga nel README** di `services/graph/`: quali artefatti sono *per contratto* e quali sono
   sacrificabili. Oggi nessuno dei due elenchi esiste.

## La prova che conta

- `rm -rf .cache` su una copia del repo → la pipeline si ferma **nominando** cosa manca e come
  rifarlo, invece di produrre righe sbagliate;
- con i file al loro posto, lo sha combacia e la pipeline gira;
- un file sostituito con uno diverso → rifiuto, non silenzio.

## Fuori scope

Spostare `services/graph/data/v45/` (già congelato, e la sua immutabilità è una regola scritta),
e la politica di backup dei dati veri.
