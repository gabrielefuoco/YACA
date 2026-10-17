Status: needs-triage
Type: task

# 41 — Lo slider: il cablaggio dal profilo ai cataloghi (parte 2 del ticket 39)

## Perché

Il ticket 39 ha fatto la **parte 3** (calibrazione di `DELTA_FASCIA`: da `INVENTATO` a `MISURATO`, con lo sweep su
60 utenti reali) e la **parte 1** (le quattro manopole in `DnaAndAiPanel.tsx`, coi valori inviati col profilo in
`settings.sliders`). La **parte 2** è rimasta ferma perché tocca `src/profile/**`, `src/catalog/providers/**` e
`src/pool/**`, che erano il territorio di altri ticket in corso.

## Cosa deve uscire

1. **Il passaggio del valore dal profilo al percorso dei cataloghi**, che oggi non li legge: il profilo salva
   `sliders`, e il motore deve riceverli quando costruisce le righe.
2. **La verifica che la manopola cambi qualcosa**: gli assi **modulano l'attivazione** (circa un terzo dei titoli
   cambia), non filtrano — quindi la prova non è «la lista si svuota» ma «la composizione cambia», misurata con la
   ricetta (`measure/ricetta.py`).
3. Il test che fissa il contratto: stessi sliders → stessa lista; sliders diversi → composizione diversa.

## Nota

Il motore già accetta i quattro slider (`graph/motore.py`, `slider()`) e `Bolle.js` li accetta: manca solo il filo
dal profilo al motore. È un cablaggio, non un progetto.
