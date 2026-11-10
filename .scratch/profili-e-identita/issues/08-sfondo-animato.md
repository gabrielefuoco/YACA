# Lo sfondo si muove: onde o bolle, senza diventare un videogioco

Status: resolved
Type: prototype
Blocked by: —

## Question

Lo sfondo beige scuro è noioso. Deve animarsi mantenendo gli stessi colori: onde o bolle, leggero, minimale, pulito. Il rischio è opposto e speculare: un'animazione che stanca dopo due minuti, che pesa sulla batteria, o che rende il testo meno leggibile.

Serve un prototipo da guardare in movimento, con due o tre varianti, per decidere:

1. **Onde o bolle** — le onde danno calma e orizzonte, le bolle danno profondità e movimento irregolare. Il prototipo le mostra entrambe sullo stesso contenuto (una card e una riga di cataloghi sopra), perché la domanda vera è quale delle due non disturba la lettura.
2. **Intensità** — quanto contrasto, quanta velocità, quanto rumore. Tre livelli per variante: appena percepibile, visibile, evidente. Il punto di partenza è "appena percepibile": uno sfondo che si nota è uno sfondo che compete col contenuto.
3. **Tecnica** — CSS puro (gradienti animati, `filter: blur`, trasformazioni) o canvas/WebGL. Vincoli: la dashboard è un export statico Next.js, deve girare su telefoni modesti, e non deve rubare frame allo scrolling. Preferire CSS se regge; dire dove non regge.
4. **Movimento ridotto** — `prefers-reduced-motion: reduce` deve fermare l'animazione, non rallentarla. Lo sfondo fermo deve comunque essere bello, perché per alcuni utenti sarà l'unico sfondo che vedranno.
5. **Coerenza fra pagine** — lo sfondo è globale (dashboard, Esplora, Impostazioni, Creator) o solo della dashboard? Un'animazione che cambia o riparte cambiando pagina si nota e infastidisce.
6. **Costo** — misurare: numero di elementi animati, proprietà animate (solo `transform` e `opacity`), e l'effetto su una scheda mobile. Se una variante costa troppo, scartarla qui e non in produzione.

Esito: la variante scelta, con intensità, tecnica, comportamento a movimento ridotto e la misura del costo.

## Esito

Applicato in produzione (commit `6fb3c2f1`, container `yaca-app`).

**Cosa ha vinto e perché.** Tre direzioni sono state scartate dall'utente: onde e bolle (forme riconoscibili), gradienti CSS con aloni (invisibili o rigidi), immagine generata poi animata (pixelata, e comunque una fotografia trascinata). La direzione scelta è un **campo di colore continuo**: rumore a bassissima frequenza calcolato per pixel via WebGL, nessuna forma disegnata, nessun bordo che l'occhio possa seguire.

**La lezione, che vale più dello sfondo.** Per sei giri ho regolato parametri alla cieca. L'utente ha detto tre volte "non si vede il movimento" e una volta "le linee sono troppo rigide": la causa vera era che *un gradiente ha un bordo*, e un bordo in movimento si legge come un oggetto rigido. La soluzione non era un parametro. Il metodo che ha chiuso il giro è stato **renderizzare in headless e misurare il delta fra due istanti** (Chrome `--headless --screenshot` + confronto pixel): da lì ogni scelta è diventata verificabile invece che sperata.

**Parametri finali.** Campo fluido, velocità `0.375`, 30 fps, DPR massimo 1.5, `prefers-reduced-motion` → un solo fotogramma, scheda nascosta → animazione ferma. Senza WebGL resta il beige del body.

**Peso.** Nessun asset: niente immagini, niente grana. Il costo è un `requestAnimationFrame` a 30 fps e uno shader a quattro ottave.

**Aperto.** Il costo su telefono modesto non è stato misurato. Non è un dettaglio: è l'unica cosa che può far decidere di ridurre le ottave o il frame rate.

**Cancellati.** Vecchio componente CSS, pagina di laboratorio `/anteprima-sfondo` (finiva nell'export di produzione), tile di grana.
