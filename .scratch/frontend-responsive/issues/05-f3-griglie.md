Status: resolved
Type: task
Blocked by: 01

# 05 — F3: griglie a colonne fisse, senza scaglioni intermedi

## Perché
Le griglie saltano da 3 a 6 colonne senza passaggio intermedio, o restano a 2 colonne fisse da 360px a
1920px. Il sintomo tipico: titoli troncati a metà parola e controlli schiacciati. (`report.md` §R5)

## Cosa fare
| file:line | oggi | domani |
|---|---|---|
| `components/dashboard/ProfileManager.tsx:135` | `grid-cols-2 sm:grid-cols-3 md:grid-cols-6` | `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6` (a 768px ogni card ha ~101px, utile interno ~69px) |
| `components/dashboard/UserLibraryPanel.tsx:369` | `grid-cols-3 sm:grid-cols-4 … xl:grid-cols-8` | `grid-cols-2 min-[400px]:grid-cols-3 …` (a 360px le card sono ~100px con poster + due pulsanti) |
| `components/dashboard/CreatorPanel.tsx:726` | `grid grid-cols-2 gap-3` (Select "Ordina per" / "Lingua") | `grid-cols-1 sm:grid-cols-2` (a 360px le voci lunghe si troncano a pochi caratteri) |
| `components/dashboard/CreatorPanel.tsx:755-768` | `grid grid-cols-2 gap-3` (due Slider voto) | `grid-cols-1 sm:grid-cols-2` (~125px per slider con 20 step = ~6px per step: mira impossibile) |
| `components/dashboard/DashboardPage.tsx:188` | 5 tab in `grid-cols-2` / `min-[420px]:grid-cols-3` | ultimo tab `col-span-2` sotto 420px (oggi resta isolato con mezza riga vuota) |
| `components/dashboard/CreatorPanel.tsx:645` | card `w-[100px] sm:w-[120px]` | griglia fluida `grid-cols-2 sm:grid-cols-3` (~80px di buco sul margine destro) |

## Done quando
A 360/390/768/1024 nessuna colonna scende sotto la larghezza minima del proprio contenuto: nessun
titolo troncato a metà parola, nessun controllo con area utile < 44px dentro la colonna.

## Verifica
`node C:/tmp/measure.mjs http://localhost:3000 / 360 390 768 1024 1440` con backend attivo, sulla tab
che contiene la griglia modificata (le griglie stanno dietro il login: servono sessione e dati reali).
