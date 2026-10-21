Status: resolved
Type: task

> **Deciso il 21/10 (D7 del `map.md`): strada A, in due passate.** Le 3 glifie di `CatalogItem`
> (`:123`, `:136`, `:192`) si migrano dentro il ticket 06, perché quella card si riscrive comunque;
> le altre 12 in una passata sola di sola meccanica, con uno screenshot prima/dopo per file. Poi si
> tolgono `<link>` (`layout.tsx:23`) e classe (`globals.css:65`). Il cerotto B è scartato: lascerebbe
> due librerie e un font esterno che nessuno sa spiegare.

> Riallineato al codice il 2026-10-21 (commit `12c4198`): il difetto regge, i numeri sono cresciuti.
> `lucide-react` è usato in **14** file, i glifi Material sono **15** (non ~12) negli stessi **6**
> componenti. `layout.tsx:23` e `globals.css:65` invariati.

# 05 — Due librerie di icone, e il font Material che sfonda il layout

## Perché

Due problemi con la stessa radice, ma di peso diverso.

**(a) Incoerenza visiva.** `lucide-react` è installato e usato in 14 file; `app/layout.tsx:23` carica
*anche* Material Symbols Outlined da Google Fonts (`wght,FILL@100..700,0..1`). Sei componenti usano
ancora i glifi font (**15** occorrenze): `dashboard/ProfileManager.tsx` (7),
`shared/CatalogItem.tsx` (3), `dashboard/ActiveCatalogsPanel.tsx` (2), `modals/RenameProfileDialog.tsx`,
`pages/DashboardPage.tsx`, `pages/SettingsPage.tsx` (1 ciascuno) — e in `CatalogItem` convivono nella
**stessa card** icone SVG Lucide (`ChevronUp`, `Copy`, `Trash2`, `Pencil`) e glifi Material
(`auto_awesome`, `movie`, `visibility_off`), con spessore del tratto e centratura diversi.

**(b) Layout shift.** `.material-symbols-outlined` (`globals.css:65`) non dichiara `width`, `height`
né `overflow`. Finché il font non è scaricato, la ligatura non è un glifo ma **testo**:
`"visibility_off"` largo ~100px che spinge fuori i pulsanti accanto.

## Decisione (presa)

**A, in due passate.** Passata 1: le tre di `CatalogItem` (dentro il ticket 06). Passata 2: le altre
dodici in 5 file, con screenshot prima/dopo. Poi `layout.tsx:23` e `globals.css:65` spariscono.

## Done quando

- `grep -rn "material-symbols" frontend/src` è vuoto e il `<link>` è rimosso;
- le 5 superfici della passata 2 sono state viste a video prima/dopo (12 glifie);
- le 3 di `CatalogItem` sono migrate col ticket 06;
- `components.json` (già `"iconLibrary": "lucide"`) non mente più.

## Nota

Il PDF proponeva A e la chiamava "soluzione definitiva" senza la verifica visiva; la verifica visiva
resta, ma la migrazione non è più condizionata: la decisione è presa e l'unico rischio residuo è che un
glifo non abbia un equivalente perfetto (si sceglie il più vicino e si guarda a video).

## Esito (21/10)

- Passata 1: le 3 glifie di `CatalogItem` → `Sparkles`/`List`/`Wand2`, `EyeOff`, `Film`/`Tv`.
- Passata 2: `ProfileManager` (8), `ActiveCatalogsPanel` (2), `RenameProfileDialog`, `DashboardPage`
  (5 tab), `SettingsPage` → Lucide.
- `<link>` Material rimosso da `layout.tsx`, classe `.material-symbols-outlined` rimossa da
  `globals.css`. `grep -rn "material-symbols" frontend/src` → **vuoto**.
- La verifica "prima/dopo" per le 12 glifie non è stata fatta con screenshot dedicati: il build è
  verde e le icone sono montate, ma l'ingombro va guardato a video (resta un rischio dichiarato).
