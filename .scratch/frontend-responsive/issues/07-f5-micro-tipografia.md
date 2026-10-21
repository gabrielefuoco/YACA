Status: resolved
Type: task
Blocked by: 03, 05

# 07 — F5: micro-tipografia (91 occorrenze sotto i 12px)

## Perché
`text-[9px]`, `text-[10px]`, `text-[11px]` ricorrono **91 volte in 18 file**, quasi sempre con
`uppercase` e `tracking-widest`. Non è una scelta di stile: è la tecnica usata per far stare il testo in
griglie che non si adattavano, e rende illeggibile proprio l'informazione di stato (contatori, badge,
motivazioni di incompatibilità). (`report.md` §R3)

Distribuzione: `CreatorPanel` 34, `CatalogItem` 11, `DnaAndAiPanel` 9, `ExplorePanel` 7,
`ProfileManager` 4, `DnaBarChart` 4, `ActiveCatalogsPanel` 4, `SettingsPage` 3, altri 12.

## Cosa fare
Sostituzione **diretta** a `text-xs` (12px) — decisione D3, presa: nessun token nuovo, nessuna
astrazione, il criterio di done è meccanico.
Attenzione ai ~5 punti dove il testo più grande può sfondare il contenitore: chip dei generi
(`CreatorPanel.tsx:822,839`), badge nel footer delle card (`CatalogItem.tsx:150`), etichette accanto
agli switch (`DnaAndAiPanel.tsx:325`), pillole della cache, badge di stato in `SettingsPage.tsx:255,267`.

## Done quando
- `grep -rE 'text-\[(9|10|11)px\]' frontend/src` → **zero righe**;
- nessun chip/badge/bottone va a capo o sfonda il contenitore a 360px dopo l'aumento.

## Nota di riallineamento (21/10/2026)
Il criterio meccanico **non vale più**: al commit `12c4198` il grep restituisce **13 righe**, tutte in
`DnaAndAiPanel.tsx:348-490` (etichette `font-mono` delle manopole del motore, aggiunte dal commit
`fdc54cb`). Il ticket resta `resolved` per il suo perimetro — le 91 originali sono state chiuse e il
layout regge — ma la tecnica è rientrata da un componente nuovo. La decisione se sia un'eccezione
voluta è nel ticket **09 di `frontend-verifica`**, voce 6: non riaprire questo ticket, decidi lì.

## Nota di sequenza
Da fare **dopo** il ticket 03 (card unica) e il 05 (griglie): prima si fa stare il layout, poi si alza
il testo. Al contrario si ottiene il testo grande dentro contenitori che non lo reggevano.
