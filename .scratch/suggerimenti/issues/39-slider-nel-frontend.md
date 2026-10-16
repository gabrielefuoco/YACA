Status: ready-for-agent
Type: task

# Gli slider del motore non esistono nell'interfaccia

Il motore accetta quattro slider e li applica gia': `largo` (quanti mondi), `lontano` (quanto diversi),
`cozy` (leggero/impegnativo) e `canone` (nicchia/popolare). Sono dichiarati in `slider()` di
`graph/motore.py`, viaggiano nell'artefatto dove servono, e `Bolle.js` li accetta. **Nella configurazione
del prodotto non ci sono**: l'utente non puo' toccarli.

Cosa manca, in concreto:
 · i controlli nell'interfaccia (probabilmente accanto alle righe dei cataloghi, in
   `frontend/src/components/dashboard/DnaAndAiPanel.tsx`);
 · il passaggio del valore dal profilo al percorso dei cataloghi, che oggi non li legge;
 · e il valore di `DELTA_FASCIA` (quanto sposta la finestra lo slider `canone`) e' marcato **INVENTATO**
   in `parametri.py`: va calibrato su `measure/ricetta.py` prima di esporlo, altrimenti si espone una
   manopola che non si sa cosa fa.

Nota di comportamento, misurata: gli assi **modulano l'attivazione**, non filtrano. E' la differenza fra
un terzo dei titoli che cambia (modulando) e le liste che si svuotano (filtrando) — vedi la sezione 13
della mappa, in `.scratch/suggerimenti/map.md`.
