Status: resolved
Type: task
Blocked by: 01

# 10 — Action sheet sul Dialog, e i cinque modal diventano uno

## Perché

D3 del `map.md`: quando le azioni di una locandina sono più di una stanno dietro un «⋯», e il «⋯»
apre un **action sheet**. Il repo non ha un primitivo per i menù (`src/components/ui/` contiene solo
dialog, select, slider, switch, input, label, badge, button, skeleton), e non ne serve uno nuovo: il
`Dialog` esiste, va in portal (quindi non lo taglia nessun `overflow-hidden`, che è la classe di bug
del ticket 08) e trattiene il focus.

Lo stesso lavoro chiude la voce 1 del vecchio ticket 09: **cinque modal, tre stili**
(`ui/dialog.tsx:33` è il posto giusto).

| modal | oggi | problema |
|---|---|---|
| `modals/TraktAuthModal.tsx:113` | `bg-white border-slate-200`, `bg-red-500/20 text-red-400:116`, `from-primary to-red-600:149`, `bg-red-600 hover:bg-red-700:177`, `bg-red-50 border-red-200 text-red-600:193-194` | fuori palette, colori di un'altra app |
| `modals/RenameProfileDialog.tsx:35` | `glass-panel` | poco staccato dal fondo |
| `modals/SyncLibraryModal.tsx:40` | `glass-panel` | idem |
| `dashboard/ProfileManager.tsx:239` | `bg-background-light` | ok |
| `modals/EditCatalogModal.tsx:23` | `bg-background-light` | ok |

## Cosa fare

1. `ui/dialog.tsx:33` — fissare lo stile base: `bg-background-light border-marrow-light/20
   shadow-2xl rounded-2xl`, `max-h-[90dvh] overflow-y-auto`. I cinque modal non lo ridefiniscono più.
2. Nuovo `ui/action-sheet.tsx` — `Dialog` + lista di voci (`icona + etichetta`, 44px di altezza,
   variante `destructive`), `open`/`onOpenChange`, una sola azione per riga. Su mobile è un pannello
   che sale dal basso, su desktop resta il modal centrato: nessun posizionamento da calcolare.
3. `TraktAuthModal` riallineato: `slate-*`/`red-*` → token del tema (`border-marrow-light/20`,
   `bg-destructive/10 text-destructive`, `from-primary to-accent`).
4. `RenameProfileDialog` e `SyncLibraryModal`: via `glass-panel`, ereditano lo stile base.

## Done quando

- esiste `ui/action-sheet.tsx` e la libreria lo usa per il «⋯» (ticket 11) e il Creator (ticket 06);
- `grep -rn "slate-\|bg-red-\|text-red-" frontend/src/components/modals/` → solo classi del tema;
- i cinque modal si aprono e si chiudono a 360px senza sbordare e con lo stesso fondo;
- nessun `<DialogContent>` ridefinisce `bg-*` (eredita da `ui/dialog.tsx`).

## Esito (21/10)

- `ui/action-sheet.tsx` creato su `ui/dialog.tsx`: voci da 48px, variante `destructive`, portal (non
  lo taglia nessun `overflow`).
- `ui/dialog.tsx`: stile base unico (`bg-background-light`, `border-marrow-light/20`, `shadow-2xl`,
  `rounded-2xl`, `max-h-[90dvh]`). I cinque modal non ridefiniscono più il fondo.
- `TraktAuthModal` riallineato alla palette (via `slate-*`, `red-*`, `bg-white`).
- `grep -rn "slate-|red-[0-9]" components/modals/` → vuoto.
