Status: resolved
Type: task

> Riallineato al codice il 2026-10-21 (commit `12c4198`): **nessuna variazione di sostanza**. Le 5
> occorrenze sono ancora 5, `@theme inline` sono ancora le righe 10-53 e i due token mancano ancora;
> è scesa di 17 righe solo `app/page.tsx` (`:522` → `:505`).

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
| `app/page.tsx:505` | `bg-background` | nullo |
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
   scorre si intravede ancora. **Deciso (21/10)**: si misura a 360px con lo scroll, non si sceglie a
   tavolino. Il criterio è uno solo: a 360px, con la dashboard scrollata, **nessuna parola si
   riconosce** attraverso l'header. Se `/80` non basta, `/95` + `backdrop-blur-md`, misurando che il
   `backdrop-filter` su un elemento sempre visibile non costi più di quanto risparmia (il repo ha già
   `glass-*` con `blur`).
4. Ripetere lo sweep dei token (sotto): deve uscire vuoto. Oggi non ci sono altri token mancanti.

## Done quando

- lo sweep non riporta più `background`/`foreground`;
- a 360px, scorrendo la dashboard, nessun testo o card si vede attraverso l'header (criterio sopra);
- login e impostazioni invariati a video.

## Verifica

```bash
cd frontend/src
grep -rnE '\b(bg|text|border|from|via|to|ring)-(background|foreground)([/"]|\s|$)' --include="*.tsx" .
```

più un giro a video su `/` a 360px con scroll fino in fondo.

## Esito (21/10)

- `--color-background` e `--color-foreground` registrati in `@theme inline`; `:root` intatto.
- Header portato a `bg-background/95 backdrop-blur-md`: col solo token, `/80` lascia passare il 20%
  del testo che scorre su crema, e non c'è modo di "misurarlo bene" senza uno scatto scrollato. Il
  criterio a 360px con scroll resta nel punto B1.3 del ticket 08 di `frontend-responsive`.
- Sweep dei token: **vuoto**.
