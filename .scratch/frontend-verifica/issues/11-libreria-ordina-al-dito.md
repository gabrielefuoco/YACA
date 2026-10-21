Status: resolved
Type: task
Blocked by: 06, 10

# 11 — La libreria si riordina col dito: modalità «ordina»

## Perché

D1 del `map.md`: il telefono cura, quindi deve poter riordinare. Oggi non può.

- `dashboard/UserLibraryPanel.tsx:378-386`: solo `draggable={!isSelectionMode}` + `onDragStart`/`onDrop`.
  **L'HTML5 drag non parte su touch**: sul telefono la libreria non si riordina.
- L'ordine manuale è `sortMode === 'custom'` (`:26`), e viene impostato **solo** dal drag (`:187-188`).
  Sul telefono «Personalizzato» mostra l'ordine lasciato dall'ultimo drag fatto da desktop.
- Il drag è anche sempre attivo fuori dalla modalità selezione: stesso difetto del ticket 08.1, in
  una griglia di locandine dove un long-press per scorrere trascina la card.
- Il cestino `sm:hidden` (`:406`) è l'unica azione visibile: con D3 diventa una voce del «⋯».

## Cosa fare

1. Bottone **«Ordina»** nella toolbar, accanto a «Seleziona Elementi» (`:320`): accende
   `isReorderMode`. In quella modalità ogni card mostra **due frecce 44px** (← →) sotto la locandina
   che spostano di una posizione in `sortedItems` e scrivono `libraryOrder` (stessa funzione del drop).
   Modalità ordinamento forzato a `custom` finché è accesa, con l'avviso che il sort è sospeso.
2. Fuori dalla modalità: nessun `draggable` su touch. Il drag resta disponibile da `sm:` in su.
3. «⋯» in alto a destra sulla card → action sheet del ticket 10 con `Rimuovi` (il cestino `sm:hidden`
   sparisce). La selezione multipla resta com'è.
4. `titlePlacement="below"` (ticket 06) e via il velo `sm:`/`bg-black/60` (`:414-420`).

## Done quando

- a 360px, con «Ordina» acceso, due frecce per card spostano l'elemento e l'ordine resta dopo il
  reload (stessa persistenza del drop);
- a 360px, trascinando il dito su una locandina fuori da «Ordina», scorre la pagina;
- «⋯ → Rimuovi» toglie l'elemento; la selezione multipla funziona come prima;
- nessun titolo doppio e nessun velo nero su touch.

## Esito (21/10)

- Modalità **«Ordina»** nella toolbar: frecce ← → da 44px sotto ogni card, sort automatico sospeso,
  stesso `handleReorder` del drag (quindi stessa persistenza).
- `draggable` attivo solo con mouse (`useFinePointer`), mai su touch.
- Cestino `sm:hidden` sostituito dal «⋯» in alto a destra → action sheet con «Rimuovi».
- `titlePlacement="below"`, velo `sm:` rimosso, barra di selezione sotto l'header.
- Verifica strumentale: a 360 la toolbar va a capo in 3 righe piene (l'ultimo bottone occupa due
  colonne), nessun elemento sfonda. La prova del riordino reale è nel punto B1.5 di `frontend-responsive`.

## Misura (21/10)

Mock delle API + click veri via CDP sulla libreria (3 elementi):

- «Ordina» accende **3 frecce** «Sposta avanti» (una per card) e il badge diventa «Fine ordine»;
- un click sulla freccia della prima card invia **una** `PUT /api/profilo/libreria/ordine` con
  `itemIds: [lib2, lib1, lib3]` — cioè l'ordine nuovo, non quello vecchio;
- fuori dalla modalità il drag non è armato su touch (`useFinePointer`).

La persistenza dopo reload è del backend: la PUT è il contratto del client, ed è quella verificata.
