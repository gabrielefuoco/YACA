Status: wontfix
Type: task
Blocked by: 01

# 09 — Rifinitura grafica: sciolta nei ticket esistenti

## Perché

Il quarto giro di `frontend.pdf` elencava otto interventi di sola estetica. Con le decisioni del
grilling (D1: il telefono cura) **sette voci su otto** sono diventate lavoro necessario, non restyling:
le ho distribuite nei ticket che già toccano quei file. Questo ticket non sopravvive come lavoro.

| voce | dove è finita |
|---|---|
| 1. cinque modal, tre stili (`TraktAuthModal:113`, `RenameProfileDialog:35`, `SyncLibraryModal:40`, `ProfileManager:239`, `EditCatalogModal:23`, `ui/dialog.tsx:33`) | **ticket 10** (nasce il sesto modal: l'action sheet) |
| 2. box dentro box (`DnaBarChart:53`, `:79`; label `:101`, percentuale `:123`) | **ticket 13** |
| 3. classi orfane `bg-slate-100/70` (`CatalogItem:72`) e `dark:text-amber-400` (`:129`) | **ticket 06** (la card si riscrive) |
| 4a. `text-emerald-400` su crema (`LoginPage:234-235`) | **ticket 03** (è contrasto, non estetica) |
| 4b. `LoginPage` senza card contenitore | **`wontfix`** — l'unica voce davvero cosmetica: non serve a nessuna delle decisioni prese |
| 5. toolbar a 4 bottoni che va a capo male (`UserLibraryPanel:284-331`) | **ticket 13** |
| 6. tipografia: 13 `text-[10px]/[11px]` in `DnaAndAiPanel:348-490`, `uppercase` ×70 | **ticket 13** |
| 7. caroselli non allineati (`PosterRow:63`, `CatalogLivePreview:78`) | **ticket 06** |
| 8. `PosterCard` con due contratti | **ticket 06** (deciso) |

## Perché `wontfix` e non un effort

Un effort `frontend-estetica` per una voce sola è un contenitore vuoto. Se un giorno si vuole la card
di login, è una riga di ticket nuovo, non un fronte.

## Done quando

La redistribuzione qui sopra è nei ticket 03, 06, 10 e 13, e il `map.md` non elenca più la rifinitura
grafica fra i lavori aperti. (Fatto il 21/10.)
