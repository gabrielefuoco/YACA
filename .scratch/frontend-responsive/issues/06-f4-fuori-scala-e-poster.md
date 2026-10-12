Status: resolved
Type: task
Blocked by: 01, 03

# 06 — F4: elementi fuori scala + una sola primitiva poster

## Perché
Alcuni elementi hanno dimensioni fisse che non scalano col viewport: su un telefono occupano l'intero
schermo, su desktop appaiono microscopici rispetto al contesto. È il difetto segnalato come "elementi
fuori scala". (`report.md` §R6)

## Parte A — dimensioni fuori scala
| file:line | oggi | domani | perché |
|---|---|---|---|
| `components/pages/DashboardPage.tsx:215` | `min-h-[500px]` | `min-h-[280px] sm:min-h-[500px]` | su un telefono è il 78% dello schermo anche quando il tab è vuoto |
| `components/dashboard/DnaAndAiPanel.tsx:349` | `min-h-[140px]` × 4 cataloghi | `p-3 sm:p-6`, `min-h-[80px] sm:min-h-[140px]` | ~880px di spazio per poche righe |
| `components/modals/TraktAuthModal.tsx:149` | `text-4xl` + `tracking-[0.3em]` (8 caratteri ≈ 259px in 235px utili) | `text-2xl sm:text-4xl` + `break-all` | il codice di attivazione va a capo in mezzo al codice |
| `components/modals/TraktAuthModal.tsx:117` + card interna | doppio `p-6` (48+48px su 92vw) | `p-4 sm:p-6` + `p-4 sm:p-6` | a 360px ruba il 30% della larghezza |
| `components/dashboard/CreatorPanel.tsx:919-937` | poster `w-16 h-24` (64×96) | `w-full aspect-[2/3] max-w-[120px]` | francobolli dentro colonne larghe 140-180px |
| `components/modals/EditCatalogModal.tsx:23` | `h-[90dvh]` su mobile | `h-[100dvh] rounded-none` sotto `sm:` | con la tastiera virtuale l'area di scroll collassa a <150px |

## Parte B — una sola primitiva poster (decisione D6, presa: si fa qui)
Oggi i poster nascono in **6 file** con 4 contratti geometrici diversi (100 / 120 / 140 / 150px,
`rounded-md`/`lg`/`xl`) e **5 siti su 6 renderizzano `<img>` nudo, senza `onError`**: un poster rotto
(host morto, 404) resta rotto per sempre. È lo stesso bug già risolto una volta in
`shared/PosterImage.tsx` e mai propagato.

Estrarre `frontend/src/components/shared/PosterCard.tsx` come da specifica completa in
`slaves/ui-unify-catalogs.md` (interface TS + 3 siti before/after):
- taglie: `sm` 100×150 (picker/autocomplete), `md` 120×180 → `sm:` 150×225 (caroselli),
  `fluid` (`w-full aspect-[2/3]`, griglie);
- **il formato orfano 140×210 di `CatalogLivePreview.tsx:84,90` muore** (e con esso il CLS: lo skeleton
  lì è già a 150px);
- il fallback robusto è quello di `PosterImage` (che già gestisce il cambio di `src`);
- un solo raggio (`rounded-xl`) su tutte le superfici.

Bilancio dichiarato e accettato: **~−6 righe nette** (+159 migrazioni). Non si fa per il codice: si fa
per la correttezza (5 siti senza `onError`) e per avere un solo contratto di forma.

Migrazioni: `shared/PosterRow.tsx`, `dashboard/CatalogLivePreview.tsx`,
`shared/AutocompleteSearch.tsx`, `dashboard/CreatorPanel.tsx` (lista manuale + anteprima statica),
`dashboard/UserLibraryPanel.tsx`.

## Done quando
- nessun blocco di altezza fissa supera il 60% del viewport del proprio breakpoint;
- `grep -rn "h-\[210px\]\|w-\[140px\]\|w-16 h-24" frontend/src` → nessun risultato;
- un solo file dichiara le taglie dei poster; nessun `<img>` di locandina senza `onError`;
- `npm run build` passa.

## Verifica
Harness a 360/390/768/1024/1440 + verifica a video di: codice Trakt a 360px, modale Creator con la
tastiera aperta, griglia libreria a 360px (peek della terza colonna).
