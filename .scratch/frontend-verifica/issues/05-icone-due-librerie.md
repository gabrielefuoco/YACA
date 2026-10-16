Status: needs-info
Type: task

# 05 — Due librerie di icone, e il font Material che sfonda il layout

## Perché

Due problemi con la stessa radice, ma di peso diverso.

**(a) Incoerenza visiva.** `lucide-react` è installato e usato in 13 file; `app/layout.tsx:23` carica
*anche* Material Symbols Outlined da Google Fonts (`wght,FILL@100..700,0..1`). Sei componenti usano
ancora i glifi font: `dashboard/ActiveCatalogsPanel.tsx`, `dashboard/ProfileManager.tsx`,
`modals/RenameProfileDialog.tsx`, `pages/DashboardPage.tsx`, `pages/SettingsPage.tsx`,
`shared/CatalogItem.tsx` — e in `CatalogItem` convivono nella **stessa card** icone SVG Lucide
(`ChevronUp`, `Copy`, `Trash2`, `Pencil`) e glifi Material (`auto_awesome`, `movie`,
`visibility_off`), con spessore del tratto e centratura diversi.

**(b) Layout shift.** `.material-symbols-outlined` (`globals.css:65`) non dichiara `width`, `height`
né `overflow`. Finché il font non è scaricato, la ligatura non è un glifo ma **testo**:
`"visibility_off"` largo ~100px che spinge fuori i pulsanti accanto.

## Decisione richiesta (una delle due)

| | strada | costo | cosa risolve |
|---|---|---|---|
| A | portare le ~12 icone rimaste su `lucide-react`, rimuovere il `<link>` da `layout.tsx:23` e la classe da `globals.css:65` | 6 file, meccanico | (a) **e** (b), più ~300 KB di font esterno in meno |
| B | cerotto: dare a `.material-symbols-outlined` `width:1em; height:1em; overflow:hidden; flex-shrink:0` | 1 file | solo (b) |

**Raccomandazione: A.** `components.json` dichiara già `"iconLibrary": "lucide"`; il cerotto B lascia
due librerie da mantenere e non spiega perché il progetto ne avrebbe bisogno. Ma A tocca 6 file e va
fatto con uno screenshot prima/dopo per ciascuno: alcune icone Material non hanno un equivalente
Lucide perfetto e l'ingombro cambia (è il tipo di lavoro che sembra meccanico e non lo è).

## Done quando

- la decisione è scritta qui in una riga;
- se A: `grep -rn "material-symbols" frontend/src` è vuoto, il `<link>` è rimosso, e le 6 superfici
  sono state viste a video prima/dopo;
- se B: la misura dell'harness non mostra più elementi che sfondano durante il primo caricamento a
  rete lenta (**il difetto si vede solo prima del download del font**: va riprodotto, non solo letto).

## Nota

Il PDF propone A e la chiama "soluzione definitiva", ma elenca anche il cerotto B come "soluzione
rapida". Nel prompt finale chiede A. La scelta resta da fare perché A contiene una verifica visiva che
il PDF non ha fatto.
