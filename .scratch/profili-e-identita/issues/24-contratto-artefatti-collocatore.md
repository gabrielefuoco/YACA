Status: resolved
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

## Esito (11/11/2026)

| | |
|---|---|
| artefatti | `services/graph/data/collocatore/` — **28 file, 1,19 GiB** |
| manifesto versionato | `.scratch/profili-e-identita/artefatti-collocatore.manifest.json` (sha256, byte, comando di rigenerazione e costo di ognuno) |
| controllo | `.scratch/profili-e-identita/verifica-artefatti.py` — verifica esistenza, dimensione e **sha**, e rifiuta |
| collegamento | `colloca-riga.py` chiama il controllo **prima** di toccare qualsiasi cosa |

La prova del rifiuto, fatta davvero (file spostato via):

```
ARTEFATTI DEL COLLOCATORE: 1 problemi

  · MANCA fonti/righe/CREWPROP.npz
      rigenera con: py .scratch/profili-e-identita/crewprop-camminata.py  (~80 min, camminata sul grafo)

Il collocatore rifiuta di lavorare: un titolo collocato con un artefatto diverso sarebbe sbagliato
senza sembrarlo.
codice di uscita: 1
```

Due cose che il contratto fissa e che prima non esistevano:

1. **la distinzione fra sacrificabile e per contratto**: `services/graph/data/collocatore/` non è una
   cache, e il manifesto lo dice in apertura insieme alla ragione (il modello non si ricostruisce
   identico);
2. **la ricetta accanto all'artefatto**: un file senza comando di rigenerazione è già perso, solo che
   non lo sa. Le tre ricette lunghe (`congela-kwsem` 40 min, `crewprop-camminata` 80 min,
   `studente-addestra` 25 min di GPU) sono scritte con il loro costo, così chi le legge sa cosa sta
   per spendere.

**Nota sul posto**: gli artefatti restano sotto `services/graph/data/`, che è gitignored (riga 208) —
come tutti i dati del grafo. Il *manifesto* invece è versionato, perché è il contratto. Quando il
collocatore passerà in produzione (ticket 22), il controllo e il manifesto traslocheranno in
`services/graph/`.
