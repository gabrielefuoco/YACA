# 09 — La sparsificazione del grafo delle bolle

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 05, 08

## What to build

Il grafo quoziente è quasi una clique rumorosa: **mediana 1.103 vicini su 5.297 bolle**. Basta un solo
utente generalista che ha visto un film di Fassbinder e un film Marvel per creare un arco debole fra i due
mondi. Tre correzioni, in quest'ordine.

1. **Aggregazione core-to-core.** Il peso fra due bolle somma gli archi **pesati per la purezza interna
   dei due estremi**: un arco che parte da un archetipo puro conta pieno, uno che parte da un intruso o da
   un blockbuster di confine viene abbattuto di ordini di grandezza.
2. **Regola dei testimoni disgiunti.** Un arco esiste solo se coinvolge almeno **tre coppie disgiunte** di
   titoli (o un matching bipartito di cardinalità ≥3). Un legame culturale vero fra due mondi non passa mai
   per un film solo: è una fascia di archi paralleli.
3. **Sparsificazione per normalizzazione, mai per soglia assoluta.** Si normalizza per **informazione mutua
   puntuale positiva** e si tiene il **filtro di disparità** oppure un *k* vicino mutuo con k ∈ [5,8].
   Una soglia assoluta taglierebbe fuori le bolle d'autore (volumi bassi) lasciando iper-connessi i
   mainstream: è il modo sbagliato di sbagliare.

## Acceptance criteria

- [ ] la mediana dei vicini per bolla scende da ~1.103 a ~6-8
- [ ] **nessuna bolla resta isolata**
- [ ] i 30 vicini forti campionati dalla lettura umana sono **preservati** (Fassbinder → Wenders/Herzog, Kurosawa → Ozu/Oshima, Romero → Argento/Cronenberg, Lubitsch → espressionismo tedesco): tasso di conservazione dichiarato
- [ ] una bolla di nicchia **conserva** vicini (la modalità di fallimento della soglia assoluta è esclusa per costruzione)
- [ ] *k* è esplorato, e la scelta è giustificata **dalla lettura**, non da una metrica
- [ ] i vicini persi rispetto alla versione densa sono elencati per un campione: erano rumore o erano veri?
