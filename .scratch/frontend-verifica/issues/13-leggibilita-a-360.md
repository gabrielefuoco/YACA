Status: resolved
Type: task
Blocked by: 01

# 13 — Leggibilità a 360: box annidati, toolbar, micro-tipografia

## Perché

Tre voci del vecchio ticket 09 che non sono estetica: a 360px sono **leggibilità** e **layout**. Sono
qui perché il telefono deve curare (D1 del `map.md`) e queste sono le superfici che lo impediscono.

1. **Box dentro box** — `dashboard/DnaBarChart.tsx:53` apre un contenitore bordato
   (`rounded-2xl bg-marrow-light/5 border p-4 sm:p-6`) dentro il `glass-panel` di
   `DashboardPage.tsx:215`, e per ogni categoria ne apre un terzo (`:79`, `rounded-xl p-3 sm:p-4
   bg-white/40`). A 360px il padding annidato lascia alla barra pochi pixel, tra la label fissa
   (`:101`, `w-24 sm:w-32 md:w-36`) e la percentuale (`:123`, `w-9 sm:w-11`).
2. **Toolbar a 4 bottoni** in `flex flex-wrap items-center gap-2` (`UserLibraryPanel.tsx:284-331`): a
   mobile va a capo 2 + 1 + 1 con vuoti a destra, e con l'aggiunta di «Ordina» (ticket 11) diventano
   cinque.
3. **Micro-tipografia** — 13 occorrenze di `text-[10px]`/`text-[11px]`, **tutte** in
   `DnaAndAiPanel.tsx:348-490` (etichette `font-mono` delle manopole), rientrate dopo che F5 le aveva
   azzerate: il ticket 07 di `frontend-responsive` le dichiara chiuse, questo le riapre. A 360px 10px
   non si leggono. `uppercase` resta 70 volte e `tracking-wider/widest` 48: non si toccano in blocco,
   si decide solo dove il maiuscolo impedisce di distinguere un titolo da un pulsante (header, tab,
   titoli di sezione) e si lascia il resto.

## Cosa fare

1. `DnaBarChart`: un solo livello di contenitore (togliere il bordo esterno, la card è già dentro il
   pannello); la label scende **sopra** la barra sotto `sm` invece di stare a fianco, e la percentuale
   va a fine riga della label. Così la barra prende tutta la larghezza.
2. `UserLibraryPanel` toolbar: a 360px `grid grid-cols-2 gap-2` (i 5 bottoni stanno in 3 righe piene,
   nessun vuoto a destra) e `sm:flex`.
3. `DnaAndAiPanel`: `text-[10px]` → `text-xs`, `text-[11px]` → `text-xs`; le etichette `(largo)`,
   `(lontano)`, `(cozy)`, `(canone)` restano `font-mono` ma leggibili.
4. **Sweep di chiusura**: `grep -rnE 'text-\[(9|10|11)px\]' frontend/src` → vuoto, e la stessa regola
   vale per il futuro: nessuna taglia sotto i 12px, mai.

## Done quando

- a 360px le manopole del motore si leggono e la barra del DNA ha almeno metà della larghezza;
- la toolbar della libreria non ha buchi a destra;
- il grep delle micro-taglie è vuoto;
- nessun testo va a capo in modo da spezzare una parola nei tre punti toccati.

## Esito (21/10)

- `DnaBarChart`: un livello di contenitore in meno; a 360 nome e percentuale stanno sopra e la barra
  prende tutta la larghezza (`order-last basis-full`).
- Toolbar della libreria: `grid grid-cols-2 sm:flex`, ultimo bottone a due colonne.
- Micro-tipografia: 13 occorrenze → `text-xs`; `grep -rnE 'text-[(9|10|11)px]'` → **vuoto**
  (regola per il futuro: nessuna taglia sotto 12px).
- «Ripristina Default» portato a 44px: era l'unico bersaglio piccolo rimasto nella tab DNA.
