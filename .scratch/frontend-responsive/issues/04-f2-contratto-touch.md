Status: resolved
Type: task
Blocked by: 01, 03

# 04 — F2: contratto touch (hover e dimensioni)

## Perché
Due difetti con la stessa radice: un controllo che esiste **solo** al passaggio del mouse e un controllo
alto 24-36px sono entrambi irraggiungibili al dito. Peggio: `opacity:0` non disattiva i click, quindi
ciò che è invisibile resta toccabile — nel carosello TMDB il tap "esplorativo" su una locandina
**aggiunge** il titolo alla libreria. (`report.md` §R2, §R4)

## Cosa fare
1. **Affordance hover-only** (~18 siti, admin esclusa perché cancellata dal ticket 01).
   Pattern deciso (D2): si aggiunge `pointer-coarse:opacity-100` accanto a
   `opacity-0 group-hover:opacity-100` — Tailwind 4.2.1 installato ha la variante `pointer-coarse`
   nativa (`@media (pointer: coarse)`), desktop invariato. **Una classe per sito.**
   Priorità per rischio:
   | dove | cosa si sblocca | file:line |
   |---|---|---|
   | carosello TMDB | "+ Aggiungi" invisibile ma cliccabile → aggiunte involontarie | `components/shared/AutocompleteSearch.tsx:111` |
   | libreria utente | rimozione + titolo (oggi `hidden sm:flex`) | `components/dashboard/UserLibraryPanel.tsx:407,411` |
   | PosterRow | titolo e anno | `components/shared/PosterRow.tsx:77` |
   | CatalogLivePreview | metadati (qui `pointer-events-none`: non si vedono **né** si toccano) | `components/dashboard/CatalogLivePreview.tsx:98-101` |
   | CatalogItem | 6 occorrenze | `components/shared/CatalogItem.tsx` |
   | CreatorPanel | riordino/eliminazione lista manuale; tooltip opzioni avanzate | `components/dashboard/CreatorPanel.tsx:655-701,995,1025` |
   Se un dispositivo ha touch *e* mouse (laptop touchscreen) `pointer-coarse` non basta: in quel caso
   la variante più permissiva è `any-pointer-coarse`. Valutare solo se emerge come problema reale.
2. **Portare a 44×44px** i target primari: `ProfileManager.tsx:94-121,182` (con attenzione: la card è a
   sua volta cliccabile), `CatalogItem.tsx:123,135,174`, `UserLibraryPanel.tsx:407`,
   `ui/slider.tsx:18`, `ui/switch.tsx:12`, `ui/select.tsx:18,91`, `CreatorPanel.tsx:443,822,839,1049`,
   `LoginPage.tsx:223,234`, `SettingsPage.tsx:180,193,216,229`, `TabNav.tsx:22`.
   **Aggiunto in verifica**: `components/layout/Header.tsx:18` — il badge `v2.4.0-beta` è un `<button>`
   con `cursor-pointer` per un testo **statico** (nessuna azione) ed è alto 40px: misurato dall'harness
   come l'unico touch target sotto soglia su `/` da 768px in su. Va reso un `<span>` non interattivo
   (fuori dal conteggio dei target) — non ingrandito.
   **Nota di sequenza**: `UserLibraryPanel.tsx:407` va riletto dopo il ticket 06, che riscrive quelle
   card con `PosterCard`: applicare la fix sulla versione nuova, non su quella vecchia.
3. **Invertire l'ergonomia sbagliata**: `LoginPage.tsx:172,184` — oggi `h-10` (40px) su mobile e `h-12`
   (48px) su desktop. Portare ad almeno `h-11` **a ogni** breakpoint.
4. **Fix strutturale**: `CreatorPanel.tsx:475-485` — il `<span role="button">` è annidato **dentro** il
   `<button>` dell'accordion (HTML non valido, e su mobile il tocco finisce sull'accordion). Va estratto
   come fratello, con area di tocco ≥44px.

## Done quando
- nessun controllo interattivo sotto 44×44px, né due controlli distruttivi a meno di 24px l'uno
  dall'altro;
- nessuna azione invisibile su un dispositivo senza hover;
- su mobile: `h-10` sostituito da ≥44px;
- **criterio misurato**: su `/` a 360px l'harness riporta `touch target < 44px: 0` (oggi ne riporta 2,
  i due input del login).

## Verifica
Emulazione touch con l'harness (`Emulation.setDeviceMetricsOverride` con `mobile: true`), più un giro
manuale da telefono sulle tab Libreria / Esplora / Creator (le superfici con più hover-only).
