Status: needs-triage
Type: task

# 09 — Rifinitura grafica (4° giro del PDF): otto voci, nessun difetto

## Perché

Il quarto giro di `frontend.pdf` elenca otto interventi di **sola estetica** ("zero nuove feature").
Nessuno è un difetto: sono incoerenze. Le registro perché alcune sono reali e utili, ma **non entrano**
nell'effort `frontend-verifica`: mescolare restyling e correzioni rende impossibile dire cosa ha
migliorato cosa. Da triare: quali si fanno, in che ordine, e in che effort.

Verificate nel codice (le prime due hanno evidenza forte, le altre sono opinioni di stile):

1. **Modal incoerenti** — `modals/TraktAuthModal.tsx` è quello più fuori palette: `bg-white`
   `border-slate-200` (`:117`), `bg-red-500/20 text-red-400` (`:120`), `from-primary to-red-600`
   (`:153`), `bg-background-light border-slate-200` (`:163`), `bg-red-600 hover:bg-red-700` (`:181`),
   `bg-red-50 border-red-200 text-red-600` (`:197-198`). Gli altri due sono semitrasparenti:
   `RenameProfileDialog.tsx:35` e `SyncLibraryModal.tsx:40` usano `glass-panel` (poco staccato dal
   fondo sottostante), mentre `ProfileManager.tsx:239` e `EditCatalogModal.tsx:23` usano
   `bg-background-light`. Cinque modal, tre stili. Il posto giusto è `ui/dialog.tsx:33`.
2. **Box dentro box** — `DnaBarChart.tsx:52` apre un contenitore bordato
   (`rounded-2xl bg-marrow-light/5 border p-4 sm:p-6`) dentro il `glass-panel` di
   `DashboardPage.tsx:215`, e per ogni categoria ne apre un terzo (`DnaBarChart.tsx:79`,
   `rounded-xl p-3 sm:p-4 bg-white/40`). A 360px il padding annidato lascia alla barra del grafico
   pochi pixel, tra la label fissa (`w-24`) e la percentuale (`w-9`).
3. **Classi orfane di una dark mode che non esiste** — `CatalogItem.tsx` `bg-slate-100/70` e
   `dark:text-amber-400` (in un tema chiaro, `dark:` non si accende mai: è codice morto).
4. **`LoginPage` senza card contenitore**, appoggiata sul fondo pagina mentre tutto il resto vive
   dentro pannelli; e nello step 2 il messaggio di successo usa `text-emerald-400`
   (`LoginPage.tsx:234-235`, verde pensato per fondo nero: illeggibile su crema).
5. **Toolbar a 4 bottoni della libreria** in `flex flex-wrap items-center gap-2`
   (`UserLibraryPanel.tsx:284-329`): su mobile va a capo in modo irregolare (2 + 1 + 1 con vuoti a
   destra). *(Il PDF indica `:199-243`: dopo `97a65e0` la riga è la 284.)*
6. **Gerarchia tipografica** — quasi ogni testo è `uppercase font-black tracking-wider`: quando tutto
   è maiuscolo l'occhio non distingue più titolo, pulsante e micro-badge. **Attenzione**: il
   ticket 07 di `frontend-responsive` ha già fatto la parte pesante — le classi `text-[9px]`,
   `text-[10px]`, `text-[11px]` oggi sono **0 occorrenze** nel repo (erano 91 in 18 file). Quello che
   resta è la scelta di stile su `uppercase tracking-wider` alle taglie normali, e va provata su
   schermo: è una decisione, non un `sed`.
7. **Caroselli non allineati** — `PosterRow.tsx:69` (`flex max-w-full gap-2 overflow-x-auto pb-4
   hide-scrollbar`) e `CatalogLivePreview.tsx:79` (`flex gap-4 overflow-x-auto p-2 snap-x pb-4
   custom-scrollbar`) renderizzano lo stesso carosello di `PosterCard` con spaziature, snap e
   skeleton diversi; e il secondo usa la classe inesistente del ticket 04.
8. **`PosterCard` vuole due contratti** — è il ticket 06: non è rifinitura, e va tenuto separato.

## Da decidere

- quali voci si fanno, e se tutte insieme o in due blocchi (prima le incoerenze vere — 1, 2, 3 —
  poi le scelte di stile — 4, 5, 6, 7);
- se il fronte vive in un effort nuovo (`frontend-estetica`) o come coda di `frontend-verifica` dopo
  che i ticket 01-08 sono chiusi;
- se la voce 6 (tipografia) non sia a sua volta una decisione di design da mettere alla prova su
  schermo, non un elenco di classi da sostituire.

## Done quando

La decisione è scritta: o l'effort nuovo esiste con i suoi ticket, o la lista è dichiarata
non voluta e questo ticket passa a `wontfix` con il motivo.
