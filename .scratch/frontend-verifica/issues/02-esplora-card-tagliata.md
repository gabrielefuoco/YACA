Status: resolved
Type: task

> Riallineato al codice il 2026-10-21 (commit `12c4198`): il difetto regge, è cambiata **una riga**.
> Il root di `CatalogItem` è a **`:68`** (la `:63` è `onDragEnd`); `className` a `:68-74`. Il grid di
> `ExplorePanel` è ancora `:116`, senza `grid-cols` né `minmax`.

# 02 — "Esplora": la card esce dal contenitore e viene tagliata

## Perché

`components/dashboard/ExplorePanel.tsx:116` dispone le card con `grid gap-4 sm:gap-8`, **senza**
`grid-columns` esplicito e senza `min-w-0` sul figlio. In CSS Grid una traccia implicita ha minimo
`auto` = `min-content`: dentro `CatalogItem` c'è la riga orizzontale delle locandine, quindi il
`min-content` della card somma le locandine e supera il 100% del viewport.

Il contenitore dei pannelli ha `overflow-hidden` (`pages/DashboardPage.tsx:215`), quindi non nasce
scroll: la parte destra viene **mozzata**. Si perdono il bordo arrotondato, la coda della descrizione
(«…e costantemente aggior») e il pulsante `Aggiungi` / `Aggiunto`, che finisce fuori schermo.

`ActiveCatalogsPanel` non ha il difetto perché usa una lista flex (`flex flex-col gap-3 sm:gap-4 w-full`).
Su 360px `CatalogItem` paga inoltre `p-3` (24px) e le azioni a 44px per lato.

## Cosa fare

1. `ExplorePanel.tsx:116` — sostituire il grid con la stessa forma dell'altro pannello:
   `<div className="flex flex-col gap-4 sm:gap-6 w-full min-w-0">`.
   In alternativa `grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-8`, ma la lista flex è già il pattern
   del repo: una sola forma per lo stesso contenuto.
2. `shared/CatalogItem.tsx:68` (root, `className` a `:68-74`) — aggiungere `w-full min-w-0` alle classi esistenti.
   **Non** aggiungere `overflow-hidden` sul root: taglierebbe ombra (`shadow-*`) e anelli del chip
   attivo, che sono già un problema aperto (ticket 08).
3. Controllare che lo stesso difetto non esista altrove: cercare altri `grid` senza `minmax` che
   contengano `CatalogItem`, `PosterRow` o caroselli `overflow-x-auto`.

## Done quando

A 360px, in «Esplora», ogni card mostra bordo destro arrotondato, descrizione chiusa con l'ellissi e
il pulsante `Aggiungi`/`Aggiunto` in alto a destra. Nessuno scorrimento orizzontale della pagina.

## Verifica

Harness con `elementi che sfondano=0` sul tab «Esplora» a 360 / 390 / 768, più un'istantanea d'occhio
(la misura da sola non distingue "non sfonda" da "corretto").

## Esito (21/10)

- `ExplorePanel`: grid → `flex flex-col gap-4 sm:gap-8 w-full min-w-0`; `CatalogItem` root
  `w-full min-w-0`.
- Harness: `elementi che sfondano non gestiti = 0` su «Esplora» a 360/390/768/1024/1440.
