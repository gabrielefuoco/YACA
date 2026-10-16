Status: ready-for-agent
Type: task
Blocked by: 01

# 08 — Touch: drag sempre attivo, hover che resta attaccato, ombre tagliate

## Perché

Tre difetti da `overflow` e da hover che il ticket 04 di `frontend-responsive` ha lasciato fuori dal
suo perimetro (si occupava di *raggiungibilità*, non di *ritagli*).

1. **`shared/CatalogItem.tsx:62`** — `draggable={Boolean(onDragStart)}`: la card è trascinabile
   **sempre**, anche su mobile. Su Android/Safari un long-press per scorrere la pagina attiva il
   trascinamento fantasma della card. `ActiveCatalogsPanel` distingue già i due mondi nei testi
   (`sm:hidden` "Frecce per riordinare" / `hidden sm:inline` "Trascina per riordinare"): il codice no.
   → abilitare il drag solo da `sm:` in su, oppure solo dalla maniglia `GripVertical`, mai sulla card
   intera.

2. **`app/globals.css:134`** — `.glass-card:hover` (`transform: translateY(-2px)` + ombra pesante)
   **non** è dentro `@media (hover: hover) and (pointer: fine)`. Su iOS/Android il tocco attiva
   l'hover emulato e lo mantiene finché non si tocca altrove: la card resta sollevata con l'ombra
   accesa. → avvolgere la regola nella media query (il desktop resta identico).

3. **`scale-105` sull'elemento attivo dentro un contenitore `overflow-*`** — `overflow-x: auto`
   impone anche `overflow-y: auto`, quindi l'ombra e l'anello vengono ritagliati dal rettangolo dello
   scroll container:
   - `dashboard/ExplorePanel.tsx:76` (nav `overflow-x-auto pb-2 pt-1 px-1`) contro `:84`
     (`scale-105 ring-2 ring-offset-1 shadow-xl`) → l'alone rettangolare visibile negli screenshot;
   - `layout/TabNav.tsx:13` (`nav … overflow-x-auto no-scrollbar`) contro `:24` (`scale-105 shadow-lg`);
   - `pages/DashboardPage.tsx:201` (`scale-105` nella griglia delle 5 tab).
   → rimuovere lo `scale-105` oppure compensare con padding interno e margine negativo
   (`py-2.5 px-2 -my-1.5`) così che ombra e anello abbiano spazio dentro il contenitore. Scegliere
   **una** delle due e applicarla a tutti e tre.

Aggiungere, se si sceglie la strada del padding: una maschera di dissolvenza sul lato destro del
carosello dei chip (`mask-[linear-gradient(to_right,black_88%,transparent_100%)]`), perché il chip
«Top & Trend» viene tagliato a metà testo contro il pulsante di ricerca senza che nulla segnali che
si può scorrere. È un'aggiunta, non una fix: se disturba, si scarta.

## Done quando

- su mobile, trascinando il dito su una card catalogo si scorre la pagina: nessun drag fantasma;
- toccando una card `.glass-card` e spostandosi altrove, la card non resta sollevata;
- nei tre punti con `scale-105` l'ombra dell'attivo è intera **oppure** lo scale è rimosso;
- a 360px nessun elemento sfondi il contenitore su «Cataloghi Attivi», «Esplora» e «Creator»
  (misura: `elementi che sfondano=0`).

## Nota

Il punto 3 è cosmetico. Il punto 1 e il punto 2 sono di **interazione**: si vedono solo su un
dispositivo con touch vero, non con l'emulazione — emulazione touch imposta `pointer: coarse` ma non
riproduce il long-press di Android né l'hover sticky di iOS.
