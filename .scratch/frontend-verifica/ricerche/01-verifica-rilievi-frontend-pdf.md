# 01 — Verifica dei rilievi del PDF `frontend.pdf` contro il codice

Data: 15/10/2026. Checkout: `C:\Users\gabri\APP\YACA`, branch `main` @ `9353d39` (+ modifiche non
committate: `blank.pdf` cancellato, `src/data/bolle.json`).
Corpus analizzato: `C:\Users\gabri\APP\YACA\frontend.pdf` — stampa di una conversazione con Gemini
(5 pagine, 4 giri di risposta, 2 prompt pronti da incollare). Frontend: Next.js 16.1.6, Tailwind CSS v4,
React 19.

**Metodo.** Nessun rilievo è stato accolto a scorta: ogni voce è stata cercata nel codice con
`grep -rn` / `sed -n` su `frontend/src`. I numeri di riga del PDF sono stati ricontrollati uno per uno.
Lo stato dei lavori già fatti è stato confrontato con `.scratch/frontend-responsive/` (ticket 01-08).

## Esito in una riga

I rilievi **tecnici** del PDF sono quasi tutti reali e presenti nel codice: non sono allucinazioni.
Sbagliati i **numeri di riga** (4 su 10 controllati), sbagliata la **spiegazione** del difetto più
visibile (header trasparente: non è z-index/`backdrop-filter`, sono due token mancanti), e **frainteso**
un rilievo (il doppio titolo sulle locandine è la conseguenza di una decisione presa in questo repo,
non un difetto dimenticato).

## Rilievi verificati

| # | Rilievo del PDF | Esito | Evidenza (`frontend/src/`) |
|---|---|---|---|
| 1 | Header trasparente allo scroll | **confermato**, causa diversa | `app/globals.css:10-53` `@theme inline` non registra `--color-background`/`--color-foreground` (esistono solo in `:root`, righe 5-8) |
| 2 | "Esplora" taglia bordo, descrizione e pulsante Aggiungi | **confermato** | `components/dashboard/ExplorePanel.tsx:116` `grid gap-4 sm:gap-8` senza `minmax(0,1fr)`; `shared/CatalogItem.tsx:63` root senza `min-w-0`; `pages/DashboardPage.tsx:215` `overflow-hidden` |
| 3 | Chip "Top & Trend" mozzato e ombra del chip attivo tagliata | **confermato** | `ExplorePanel.tsx:76` `overflow-x-auto pb-2 pt-1 px-1` + `:84` `scale-105 ring-2 ring-offset-1 shadow-xl` |
| 4 | Testo bianco su fondo crema in `components/ui/` | **confermato** | `ui/button.tsx:13-15` (`text-white` su outline/secondary/ghost), `ui/switch.tsx:12`, `ui/slider.tsx:15`, `ui/badge.tsx:16`, `ui/skeleton.tsx:9` (refuso `bg-marrow-light/5 /5`) |
| 5 | Due librerie di icone + layout shift da Material Symbols | **confermato** | `app/layout.tsx:23` `<link>` Google; `.material-symbols-outlined` in `globals.css:65` senza `width/height/overflow`; 6 file con `<span className="material-symbols-outlined">` |
| 6 | Locandine: doppia scritta su mobile | **confermato, ma è una decisione** | `shared/PosterCard.tsx:85` e `shared/AutocompleteSearch.tsx:109` `pointer-coarse:opacity-100`; `dashboard/CreatorPanel.tsx:657` stesso pattern; `dashboard/UserLibraryPanel.tsx:414-415` lo ha **rimosso** con un commento che ne spiega il costo |
| 7 | `draggable` attivo anche su mobile | **confermato** | `shared/CatalogItem.tsx:62` `draggable={Boolean(onDragStart)}` |
| 8 | Classi scrollbar inesistenti | **confermato** | `custom-scrollbar`: `CatalogLivePreview.tsx:79`, `ProfileManager.tsx:240`, `AutocompleteSearch.tsx:98`; `scrollbar-hide`: `modals/EditCatalogModal.tsx:33`. Definite: `globals.css:104-110` |
| 9 | `.glass-card:hover` resta attaccato al tocco | **confermato** | `globals.css:134`, non è dentro `@media (hover: hover) and (pointer: fine)` |
| 10 | Badge "% Match" nero su rosso scuro | **confermato** | `dashboard/CatalogLivePreview.tsx:94` `bg-primary/90 text-black` |
| 11 | Barra sticky della libreria sotto l'header | **confermato**, riga diversa | `UserLibraryPanel.tsx:356` `sticky top-4 z-20` (header a `z-50`), il PDF dice 257 |
| 12 | `https://` forzato sul manifest | **confermato**, riga diversa | `app/page.tsx:256` (una occorrenza, non alle righe 239 e 275) |
| 13 | Doppia `fetchAnalytics()` al mount in DNA & AI Lab | **confermato** | `DnaAndAiPanel.tsx:157-159` e `:163-166` (`localIsSyncing` parte da `false`) |
| 14 | Codice morto nell'editor manuale del DNA | **confermato** | `DnaAndAiPanel.tsx` `handleAddManualDna`/`handleRemoveManualDna`/`handleSync`, mai usati nel JSX (commento a riga 168) |
| 15 | `ExplorePanel.tsx:100` / righe del PDF | **riga sbagliata** | il `grid` è a `:116` |
| 16 | Header: colpa di z-index e `backdrop-filter` (1° giro) | **spiegazione sbagliata** | l'header ha già `sticky top-0 z-50`; il difetto è la classe vuota (riga 1 della tabella) |
| 17 | Overlay poster: "usa un gradiente più coprente" | **frainteso** | coprirebbe il voto già stampato nel JPEG ERDB: è una scelta di design, non un fix |
| 18 | Refactor grafici (4° giro, 8 voci) | **non verificati** | restyling, non difetti → ticket 09 |

## Misure riproducibili

Sweep dei token di colore usati nei componenti ma non registrati in `@theme`. Oggi restituisce **solo**
`background` e `foreground` (5 occorrenze, 4 file):

```bash
cd frontend/src
grep -rnE '\b(bg|text|border|from|via|to|ring)-(background|foreground)([/"]|\s|$)' --include="*.tsx" .
```

Occorrenze: `app/layout.tsx:25`, `app/page.tsx:522`, `components/layout/Header.tsx:6`,
`components/pages/LoginPage.tsx:216`, `components/pages/LoginPage.tsx:227`.

Classi CSS usate nei componenti che non esistono nel foglio di stile:

```bash
cd frontend/src
grep -rn "custom-scrollbar\|scrollbar-hide" --include="*.tsx" .   # → 4 file
grep -n "hide-scrollbar\|no-scrollbar" app/globals.css            # → le classi vere, righe 104-110
```

## Su `.scratch/frontend-responsive` (11-12/10/2026)

Ticket 01-07 `resolved`, 08 `ready-for-human`. Ricontrollata la parte A del ticket 08 in codice:
chiusa (`DashboardSkeleton.tsx:17,47` allineati alla vista reale, classi malformate rimosse;
`LoginPage.tsx:189` box errore ora dentro `{error && ...}`). Resta aperta solo la parte B1, che
richiede un telefono vero.

**Relazione con questo effort.** Il fix del 04 e del 06 di quel piano
(`97a65e0 fix(frontend): responsività — un solo contratto per card, poster e touch`) ha introdotto
`pointer-coarse:opacity-100` su `PosterCard`, `AutocompleteSearch` e `CreatorPanel`: è la causa diretta
del rilievo 6. La scelta era deliberata (decisione D2: rendere raggiungibili al dito azioni che
esistevano solo all'hover) e il report di quel lavoro aveva già rifiutato la stessa tecnica su un velo a
tutta card — `UserLibraryPanel.tsx:414-415` conserva il commento — ma la decisione non è stata applicata
in modo uniforme. Il PDF non poteva saperlo: da qui l'importanza di rimisurare, non di copiare.

Il 4° giro del PDF (refactor grafici) tocca in parte gli stessi file del ticket 06 e del ticket 07 di
quel piano: va letto sulla versione attuale, non su quella citata dal PDF.

## Anomalia di contesto (da risolvere una volta sola)

- `C:\Users\gabri\APP\YACA` → `main` @ `9353d39`, 8 modifiche non committate.
- `C:\Users\gabri\orca\workspaces\YACA\stingaree` (cwd della sessione) → stesso repo, `main` @ `e467446`,
  **0 avanti / 26 indietro** rispetto al primo. `.scratch` **non** è collegata (inode diverso, nessuna
  junction): è una copia vecchia, con le mappe ferme al 12/10.
- `git diff e467446..9353d39 -- frontend/src` è **vuoto**: il codice del frontend è identico, quindi
  l'analisi vale per entrambi. Ma un agente che scrivesse in `stingaree/.scratch` produrrebbe memoria
  che non incontrerà mai quella vera.

Questo effort è scritto in `APP/YACA/.scratch/`.
