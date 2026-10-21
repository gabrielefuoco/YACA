Status: resolved
Type: task
Blocked by: 01

# 06 — Contratto delle locandine: tocco inerte, azioni esplicite, titolo dove serve

## Perché

Su mobile le locandine mostrano **due volte** titolo e voto: una stampata nel JPEG, una nell'overlay
HTML. Il `pointer-coarse:opacity-100` su `PosterCard:85`, `AutocompleteSearch:109`, `CreatorPanel:657`
viene dal commit `97a65e0` (decisione D2 del ticket 04 di `frontend-responsive`): rendere raggiungibili
al dito azioni che esistevano solo all'hover. Il motivo era buono; la conseguenza non era stata
misurata sull'immagine vera, e in `UserLibraryPanel:414-415` era già stata smentita.

Il grilling del 21/10 ha deciso il contratto (D2, D3, D4 del `map.md`), non una classe.

## Il contratto

1. **Il tocco non fa niente.** Fuori dalla modalità selezione nessuna locandina reagisce al tap:
   niente aggiunte, niente rimozioni, niente aperture. `PosterCard.onClick` resta solo per la
   selezione in `UserLibraryPanel`.
2. **Niente azioni sopra l'immagine.** Un'icona 44px in alto a destra se l'azione è una; più di una →
   «⋯» che apre l'action sheet del ticket 10. Il riordino del composer fa eccezione: frecce visibili
   sotto la card.
3. **Il titolo ha una posizione dichiarata.** `PosterCard` espone `titlePlacement: 'none' | 'below'`;
   sparisce `showTitleOverlay`. `none` dove il poster parla da sé (preview di Stremio), `below` dove
   l'utente deve riconoscere le sue cose.

Superfici e scelte:

| superficie | titolo | azione |
|---|---|---|
| `shared/PosterRow.tsx:65` (preview query) | `none` | nessuna |
| `dashboard/CatalogLivePreview.tsx:84` | `none` | badge `% Match` (non cliccabile) |
| `dashboard/UserLibraryPanel.tsx:373` | `below` | «⋯» (rimuovi) + selezione |
| `shared/AutocompleteSearch.tsx:102` | `below` | «+» / «Aggiunto» |
| `dashboard/CreatorPanel.tsx:650` (item manuali) | `below` | «⋯» sopra + ← → sotto |
| `dashboard/CreatorPanel.tsx:931` (lista statica) | `below` (già così, `:936`) | nessuna |

## Cosa fare

1. `PosterCard`: togliere `showTitleOverlay` e il velo-titolo; aggiungere `titlePlacement` e uno slot
   `actions` (assoluto, in alto a destra, `z-20`, `pointer-events-auto`) e un `selected?: boolean` per
   l'anello. La card cresce solo con `below`.
2. `AutocompleteSearch`: via il velo `bg-black/60` e il bottone grande; «+» 44px in alto a destra, che
   diventa «Aggiunto» (disabilitato) quando già presente. `onSelect` invariato: **sei chiamanti**
   (`CreatorPanel` ×4, `DnaAndAiPanel`, `UserLibraryPanel:336`) non si toccano.
3. `PosterRow` e `CatalogLivePreview`: `titlePlacement="none"`, nessun velo.
4. `UserLibraryPanel`: `titlePlacement="below"`, via il velo `sm:` e il cestino separato (assorbito dal
   «⋯» del ticket 10), selezione invariata.
5. `CreatorPanel` item manuali: via il velo; «⋯» in alto a destra, frecce sotto la card.
6. Allineare i due caroselli (`PosterRow:63` `gap-2`, `CatalogLivePreview:78` `gap-4` + `snap-x`):
   una sola forma, `hide-scrollbar` (vedi ticket 04).

## Done quando

- nessuna occorrenza di `pointer-coarse` in `frontend/src`;
- nessuna locandina ha un click che cambia lo stato della libreria;
- a 360px, in «Esplora», «Libreria», «Creator» e «Cataloghi attivi» non esiste un punto in cui un
  titolo è stampato due volte;
- `grep -rn "showTitleOverlay" frontend/src` è vuoto.

## Verifica

`grep -rn "pointer-coarse\|showTitleOverlay" frontend/src` → vuoto. Poi screenshot a 360 di una riga di
preview (deve somigliare a Stremio) e della griglia libreria (deve avere il nome sotto).

## Esito (21/10)

- `PosterCard` riscritta: `titlePlacement` (`none`/`below`), slot `actions`, `selected`; via velo-titolo
  e `showTitleOverlay`; `overflow-hidden` spostato sul riquadro, così il titolo sotto non viene tagliato.
- `PosterRow` e `CatalogLivePreview`: nessun titolo (fedeltà a Stremio). `AutocompleteSearch`: titolo
  sotto + «+» 44px. `UserLibraryPanel` e item manuali del `CreatorPanel`: titolo sotto.
- `grep -rn "pointer-coarse|showTitleOverlay" frontend/src` → **vuoto**.
- Screenshot a 390 di «Esplora» e «Libreria»: nessun titolo doppio, caroselli con la stessa forma.
- Il tocco che aggiunge è sparito: l'unico ingresso è il «+».
