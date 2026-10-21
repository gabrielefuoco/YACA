Status: resolved
Type: task

> Riallineato al codice il 2026-10-21 (commit `12c4198`): tutti i difetti reggono. Spostati i due
> richiami ai modal (`RenameProfileDialog.tsx:58`, `SyncLibraryModal.tsx:61`), gli switch del tab DNA &
> AI Lab (`DnaAndAiPanel.tsx:538,546`) e aggiunta una classe sfuggita al primo giro
> (`hover:bg-white/20` su `secondary`).

# 03 — Token del tema scuro rimasti in `components/ui/`: testo bianco su fondo crema

## Perché

I componenti base di `components/ui/` portano ancora i colori di una dark mode che il progetto non ha
più (il tema è crema `#EED9B9` / `#fdfaf5`). Su fondo chiaro il bianco sparisce.

| file:riga | oggi | conseguenza |
|---|---|---|
| `ui/button.tsx:13` | `outline: "border border-white/20 bg-transparent text-white …"` | bordo e testo invisibili |
| `ui/button.tsx:14` | `secondary: "bg-marrow-light/10 text-white hover:bg-white/20 …"` | testo bianco su crema, e hover che **schiarisce** invece di scurire |
| `ui/button.tsx:15` | `ghost: "text-white hover:bg-marrow-light/10"` | **i pulsanti «Annulla» dei modal** (`RenameProfileDialog.tsx:58`, `SyncLibraryModal.tsx:61`) sono quasi invisibili |
| `ui/switch.tsx:12` | `data-[state=unchecked]:bg-white/20` | gli switch FILM/SERIE spenti (`DnaAndAiPanel.tsx:538,546`) sono bianchi su chiaro |
| `ui/slider.tsx:15` | `bg-white/20` sulla track | traccia invisibile |
| `ui/badge.tsx:16` | `outline: "… text-white/50"` | variante outline illeggibile |
| `ui/skeleton.tsx:9` | `bg-marrow-light/5 /5` | **classe malformata**: il secondo `/5` è un token di opacità orfano, nessun effetto; e `/5` è troppo debole |

L'ultima riga è la stessa famiglia dei `border-zinc-200 /50` ripuliti dal ticket 08 di
`frontend-responsive`: classi scritte due volte, mai valide.

## Cosa fare

1. `ui/button.tsx` — `text-white` → `text-marrow-deep` su `outline`, `secondary`, `ghost`;
   `border-white/20` → `border-marrow-light/20`; e su `secondary` anche `hover:bg-white/20` →
   `hover:bg-marrow-light/20` (oggi l'hover rende il pulsante *più* chiaro del fondo). **Lasciare**
   `text-white` su `default` e `destructive` (righe 11-12): lì il fondo è rosso e il bianco è giusto.
2. `ui/switch.tsx:12` — `data-[state=unchecked]:bg-white/20` → `bg-marrow-deep/20`.
3. `ui/slider.tsx:15` — `bg-white/20` → `bg-marrow-deep/15`.
4. `ui/badge.tsx:16` — `text-white/50` → `text-marrow-deep/70`.
5. `ui/skeleton.tsx:9` — rimuovere il `/5` orfano e portare il fondo a `bg-marrow-deep/10`.
6. **Assorbe la voce 4a del vecchio ticket 09** — `pages/LoginPage.tsx:234-235`:
   `text-emerald-400` su fondo crema è illeggibile (verde pensato per fondo nero). `text-success`
   esiste già come token (`globals.css:31`): usare quello, sul box `bg-emerald-500/10` (o
   `bg-success/10`).
6. Prima di chiudere, passare gli altri `ui/` con lo stesso sweep: `input.tsx`, `select.tsx`,
   `dialog.tsx`, `tooltip` se esiste. Il criterio è uno: nessun `white` su fondo chiaro. **Sweep del
   21/10**: in `ui/` resta solo `select.tsx:18` (`bg-white/60`, fondo chiaro su fondo chiaro: è
   corretto) e `switch.tsx:20` (`bg-white` sulla pallina dello switch: è il pomello, non testo —
   lascialo).
## Done quando

- `grep -rn "text-white\|bg-white/" frontend/src/components/ui/` restituisce solo `button.tsx:11-12`
  (fondo rosso) e le classi su `bg-primary`/`bg-primary-dark`;
- «Annulla» in `RenameProfileDialog` e `SyncLibraryModal` si legge; gli switch spenti in DNA & AI Lab
  si distinguono dallo sfondo; la traccia dello slider si vede; il messaggio «Trakt connesso!» a
  `LoginPage:234-235` si legge su crema;
- nessuna classe malformata con due token di opacità.

## Verifica

`grep -rnE '([a-z-]+/[0-9]+ )+/[0-9]+' frontend/src --include="*.tsx"` → vuoto (cerca gli orfani),
più un'occhiata a video ai due modal e al tab DNA & AI Lab.

## Esito (21/10)

- `button` (outline/secondary/ghost), `switch`, `slider`, `badge` outline, `skeleton` corretti.
- Assorbita la voce 4a del 09: `text-emerald-700` sul messaggio Trakt connesso in `LoginPage`.
- In `components/ui/` restano solo `bg-primary text-white` (fondo rosso) e `bg-white/60` del select.
- Sweep delle classi malformate: **vuoto**.
