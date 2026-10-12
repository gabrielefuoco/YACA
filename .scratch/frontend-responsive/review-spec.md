# Revisione SPEC — Frontend Responsive

Stato verifica meccanica: `npm run build` passa; backend admin (`src/api/admin.js`, `index.js`) integro; `admin` in frontend rimosso (0 occorrenze); micro-tipografia (`text-[9-11px]`) azzerata (0); `h-screen` assente; nessun elemento eccede il viewport a 360/390/768/1024/1440px (`measure.mjs`).

### (a) Requisiti mancanti o parziali
- **Titolo card libreria su mobile**:
  - *Spec* (`issues/04-f2-contratto-touch.md:22`): `| libreria utente | rimozione + titolo (oggi hidden sm:flex) | components/dashboard/UserLibraryPanel.tsx:407,411 |`.
  - *Tree* (`UserLibraryPanel.tsx:388,414`): impostato `showTitleOverlay={false}` su `PosterCard` e l'overlay con il titolo (`p className="text-white..."`) è rimasto confinato dentro `<div className="hidden sm:flex ...">`. Su mobile (`<640px`) il container è `display: none`: il tasto cestino è stato esposto via `sm:hidden`, ma il titolo del contenuto rimane completamente assente su smartphone.

### (b) Scope creep (comportamenti non richiesti)
- **Accessibilità tastiera in AutocompleteSearch** (`AutocompleteSearch.tsx:151-154`): aggiunti `role="button"`, `tabIndex={0}` e gestore `onKeyDown` per i risultati verticali TMDB. Non richiesto dai ticket (lo scope era puramente touch/responsive).
- **Pulsanti freccia categorie Explore** (`ExplorePanel.tsx:84,93`): portati a `h-11 w-11 min-h-[44px]` con `touch-manipulation`, benché abbiano `hidden sm:flex` e non fossero tra i target primari di F2.

### (c) Requisiti implementati in modo errato
- **`pointer-coarse` neutralizzato da `hidden sm:flex`** (`UserLibraryPanel.tsx:414`):
  La classe `pointer-coarse:opacity-100` è applicata a un elemento con `hidden sm:flex`. Su mobile (`<640px`) `display: none` prevale sull'opacità, rendendo il fix inefficace. Su tablet touch (`≥640px`), la stessa classe forza l'overlay nero (`bg-black/60`) e il pulsante "Rimuovi" permanentemente visibili al 100%, oscurando le locandine.
- **Gruppo hover non corrispondente** (`CatalogItem.tsx:170-171`):
  Applicato `group-hover/poster:opacity-100 pointer-coarse:opacity-100` all'alone di sfondo dentro un contenitore dichiarato come `group/row` (nessun antenato `group/poster`). Su desktop l'hover non si attiva; su touch l'alone resta acceso permanentemente senza che la regola base fosse valida.
- **Tipografia arbitraria anziché token** (`PosterCard.tsx:89`):
  Usato `text-[12px]` invece di `text-xs` (Decisione D3 / F5). Non viene intercettato dal grep meccanico ma elude il contratto tipografico stabilito.
