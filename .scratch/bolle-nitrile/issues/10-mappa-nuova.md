# mappa nuova

**Status**: `claimed`
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


---

## Prima meta' fatta: LA VICINANZA FRA BOLLE (14/10/2026)

Script `10-vicinanza.py`, log in `log/10-vicinanza.log`. Misurato sulla partizione V7 (1.617 bolle).

**1. Il grafo delle bolle e' quasi completo.** 1.037.438 adiacenze fra 1.617 bolle: **il 79% di tutte
le coppie possibili e' adiacente**, e ogni bolla tocca in media **642** delle altre 1.616. La
vicinanza non sta quindi nell'esistenza di un arco, ma **nel peso**.

**2. La sparsificazione conferma il ticket 23, sulla partizione nuova:**
- **k-NN DIRETTO k=8**: **6 componenti**, 12.896 archi, grado mediano 8, **5 bolle isolate** -> la
  mappa tiene
- **k-NN MUTUO k=8**: **245 componenti**, 239 bolle isolate, la piu' grande 1.368 -> si sbriciola

**3. Gli 8 vicini letti sono un quartiere vero.** Il k-NN diretto sul peso sceglie:
- il **film noir americano** -> Hitchcock (Frenzy), commedia classica (Colazione da Tiffany),
  espressionismo tedesco (Il gabinetto del Dr. Caligari), Psyco
- il **fantasy anni '80** -> **tutto il decennio**: WarGames, Breakfast Club, Stand by Me, Indiana
  Jones, RoboCop, Ghostbusters, Corto circuito, Mr. Crocodile Dundee, Ricomincio da capo
- la **commedia romantica** -> il suo universo: Love Actually, Hitch, Amelie, Mean Girls, 40 anni vergine
- **l'horror** (Argento) -> Crimson Peak, Gli uccelli, Zombi 2, Sleepaway Camp, La casa, L'armata delle tenebre
- **Tarkovsky** <-> **Kurosawa** <-> il gattopardo/disprezzo: un grappolo di cinema d'autore strettissimo
  (peso 449 e 182)
- **l'anime** -> Death Note, Battle Royale, Vinland Saga, Ergo Proxy

**4. L'intruso e' diventato un VICINO, non un membro** — ed e' la struttura giusta:
- la bolla Star Trek (7) e' adiacente a **Guerre stellari** (peso 71) e ai **vecchi film di Star Trek**
  (Star Trek II, Primo contatto, peso 61)
- la bolla Star Wars (13) e' adiacente alla **bolla TV di Star Wars** (The Mandalorian, peso 21)
- **il ponte cross-medium ESISTE come adiacenza.** Non serve fondere le due bolle: serviva collegarle.

**5. La tipizzazione dice una cosa che non ci aspettavamo**: su 160 coppie lette, **156 sono
"comportamento"**. La vicinanza fra bolle e' guidata dalla **co-visione**, non dai metadati. L'unico
legame "struttura" fra quelli letti e' proprio **Star Wars <-> Star Wars TV**.

**Resta da fare**: gli 8 slot tipizzati (4 canonici + 2 vibe + 2 cross-medium), la leva
popolare/nicchia sulle bolle nuove, e la lettura di 10 bolle nuove.
