Status: ready-for-agent
Type: task

# 01 — Il token `background` non esiste: l'header è trasparente

## Perché

`frontend/src/app/globals.css:10-53` (`@theme inline`) registra 28 token `--color-*` ma **non**
`--color-background` né `--color-foreground`. In `:root` (righe 5-8) esistono `--background` e
`--foreground`, che Tailwind v4 **non** usa per generare utility: servono solo al `body`, che li legge
con `background: var(--background)`.

Conseguenza: le 5 occorrenze di `bg-background` / `text-foreground` non producono **nessuna** classe.
L'`<header>` resta senza sfondo — ha solo `sticky top-0 z-50` e il `border-b` — e il contenuto che
scorre si vede passare attraverso il logo. È il difetto più visibile degli screenshot, e non c'entra
lo z-index: lo `z-50` c'è già.

| file:riga | classe | effetto oggi |
|---|---|---|
| `components/layout/Header.tsx:6` | `bg-background/80` | nessuno sfondo → header trasparente allo scroll |
| `app/layout.tsx:25` | `bg-background text-foreground` | nullo (il colore arriva dal CSS di `body`) |
| `app/page.tsx:522` | `bg-background` | nullo |
| `components/pages/LoginPage.tsx:216` | `text-foreground` | nullo (eredita da `body`) |
| `components/pages/LoginPage.tsx:227` | `hover:text-foreground` | hover che non cambia nulla |

## Cosa fare

1. In `globals.css`, dentro `@theme inline`, aggiungere i due token con gli stessi valori di `:root`
   (`:root` resta: `body` li usa diretti):
   ```css
   --color-background: #EED9B9;
   --color-foreground: #5E0006;
   ```
2. **Non** hardcodare colori nei componenti, e **non** toccare `z-50`.
3. Dopo la fix `Header.tsx:6` *avrà* davvero uno sfondo all'80%: con un crema sotto, il testo che
   scorre si intravede ancora. Decidere se alzare a `/95` + `backdrop-blur-md` **misurando** a 360px,
   non copiando il PDF. Se si alza l'opacità, verificare che il blur non reintroduca un costoso
   `backdrop-filter` su un elemento sempre visibile (il repo ha già `glass-*` con `blur`).
4. Ripetere lo sweep dei token (sotto): deve uscire vuoto. Oggi non ci sono altri token mancanti.

## Done quando

- lo sweep non riporta più `background`/`foreground`;
- a 360px, scorrendo la dashboard, nessun testo o card si vede attraverso l'header;
- login e impostazioni invariati a video.

## Verifica

```bash
cd frontend/src
grep -rnE '\b(bg|text|border|from|via|to|ring)-(background|foreground)([/"]|\s|$)' --include="*.tsx" .
```

più un giro a video su `/` a 360px con scroll fino in fondo.
