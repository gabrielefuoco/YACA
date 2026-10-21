Status: resolved
Type: task
Blocked by: 01

# 08 — Touch: drag sempre attivo, hover che resta attaccato, ombre tagliate

## Perché

Tre difetti da `overflow` e da hover che il ticket 04 di `frontend-responsive` ha lasciato fuori dal
suo perimetro (si occupava di *raggiungibilità*, non di *ritagli*). Riallineato al codice il 21/10: il
punto 3 **perde un sito** (vedi sotto).

1. **`shared/CatalogItem.tsx:62`** — `draggable={Boolean(onDragStart)}`: la card è trascinabile
   **sempre**, anche su mobile. Su Android/Safari un long-press per scorrere la pagina attiva il
   trascinamento fantasma della card. `ActiveCatalogsPanel` distingue già i due mondi nei testi
   (`sm:hidden` "Frecce per riordinare" / `hidden sm:inline` "Trascina per riordinare"): il codice no.
   → `draggable` solo da `sm:` in su (il drag non è disponibile su touch: vedi D8 del `map.md`), mai
   sulla card intera su mobile. `UserLibraryPanel:378` ha lo stesso difetto e si risolve nel ticket 11.
2. **`app/globals.css:134`** — `.glass-card:hover` (`transform: translateY(-2px)` + ombra pesante)
   **non** è dentro `@media (hover: hover) and (pointer: fine)`; in tutto il foglio non esiste nemmeno
   una media query. Su iOS/Android il tocco attiva l'hover emulato e lo mantiene finché non si tocca
   altrove: la card resta sollevata con l'ombra accesa.
3. **`scale-105` sull'attivo dentro un contenitore `overflow-*`** — `overflow-x: auto` impone anche
   `overflow-y: auto`, quindi ombra e anello vengono ritagliati dal rettangolo dello scroll container:
   - `dashboard/ExplorePanel.tsx:78` (nav `overflow-x-auto pb-2 pt-1 px-1 hide-scrollbar`) contro `:84`
     (`scale-105 ring-2 ring-offset-1 shadow-xl`);
   - `layout/TabNav.tsx:16` (`nav … overflow-x-auto no-scrollbar`) contro `:24` (`scale-105 shadow-lg`).
   → **rimuovere lo `scale-105`** (scelta: una sola regola, nessun padding negativo da spiegare) e
   tenere anello e ombra, che stanno dentro il contenitore.
   **Non** è più un caso `DashboardPage.tsx:201`: la barra dei 5 tab sta in un `<div>` senza `overflow`
   (`:187-211`) e i due `glass-panel overflow-hidden` (`:167`, `:215`) le sono **fratelli**, non
   antenati. Non viene tagliato: se lo si tocca è per coerenza, non per difetto.

## Cosa fare

1. `CatalogItem`: `draggable` spento sotto `sm`, oppure drag solo dalla maniglia `GripVertical`
   (`:109`). Scegliere **la maniglia**: è più esplicito e non richiede media query nel JS.
2. `globals.css`: avvolgere `.glass-card:hover` in `@media (hover: hover) and (pointer: fine)`.
3. Togliere `scale-105` da `ExplorePanel:84` e `TabNav:24` (e, per coerenza, da `DashboardPage:201`).
4. Maschera di dissolvenza sul carosello dei chip (`mask-[linear-gradient(to_right,black_88%,transparent_100%)]`)
   perché l'ultimo chip si taglia a metà contro il pulsante senza segnalare che si scorre.

## Done quando

- su mobile, trascinando il dito su una card catalogo si scorre la pagina: nessun drag fantasma;
- toccando una `.glass-card` e spostandosi altrove, la card non resta sollevata;
- nei due punti rimasti l'ombra dell'attivo è intera;
- a 360px nessun elemento sfondi il contenitore su «Cataloghi Attivi», «Esplora» e «Creator»
  (misura: `elementi che sfondano=0`).

## Nota

Il punto 1 e il punto 2 sono di **interazione**: si vedono solo su un dispositivo con touch vero.
L'emulazione imposta `pointer: coarse` ma non riproduce il long-press di Android né l'hover sticky di
iOS. Restano quindi nei punti B1 del ticket 08 di `frontend-responsive`.

## Esito (21/10)

- `CatalogItem`: `draggable` solo con `useFinePointer()` (mouse); su touch non esiste il drag fantasma.
  La maniglia resta l'affordance desktop.
- `.glass-card:hover` dentro `@media (hover: hover) and (pointer: fine)`: era l'unica regola di hover
  del foglio e non aveva media query.
- `scale-105` rimosso da `ExplorePanel`, `TabNav` e `DashboardPage`; maschera di dissolvenza sul
  carosello dei chip.
- Harness: 0 elementi che sfondano in modo non gestito a 360/390/768/1024/1440, su tutti i tab.
- La prova del long-press Android e dell'hover sticky iOS resta nel ticket 08 di `frontend-responsive`.
