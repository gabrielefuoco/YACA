# mappa nuova

**Status**: `ready-for-human`
**Type**: `task`
**Blocked by**: 09

La mappa sulla partizione nuova: otto slot, lettura, leva.

**Solo se il banco sonda dice che la partizione nuova e' migliore.** Se non lo dice, questo ticket si
chiude dichiarando che la partizione vecchia resta, e il lavoro si ferma.

**Cosa fare**
- Ricostruire l'architettura della mappa (`grafo-servibile` ticket 12, poi 23) sulla partizione
  nuova: **k-NN diretto k=8 simmetrizzato** (non il mutuo: e' cio' che frammenta), 8 vicini tipizzati
  per bolla (4 canonici + 2 vibe + 2 cross-medium), priorita' ordinata.
- Rileggere le **6 adiacenze verificate** (Fassbinder, mostri anni '50, Star Wars, polacchi,
  argentini, norvegesi) e dire se sono ancora giuste e se i tipi sono giusti.
- Ri-misurare la **leva popolare/nicchia** (ticket 14): mai vuota su ogni bolla? Il caso Star Trek
  Into Darkness come deep cut e' risolto?

**Criterio di chiusura**
- Una componente connessa, 8 slot per bolla, le 6 adiacenze lette, la leva mai vuota — **e la lettura
  di almeno 10 bolle nuove** che prima non erano leggibili.

---

## Esito

Il criterio d'ingresso e' soddisfatto: il banco sonda dice che la partizione nuova e' migliore. Ma il ticket NON e' eseguito: ricostruire la mappa sulla partizione nuova e' un lavoro a se'. Materiale pronto: bolle-nitrile-V7.npy (1.617 bolle, mediana 34), .scratch/grafo-servibile/12-mappa.py e 23-connettivita.py, sonda.py. Domanda aperta vera: con 114 o 162 titoli in una bolla, un carosello ha ancora senso?
