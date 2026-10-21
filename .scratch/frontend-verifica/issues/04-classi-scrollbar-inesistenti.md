Status: resolved
Type: task

> Riallineato al codice il 2026-10-21 (commit `12c4198`): le quattro classi inventate ci sono ancora
> tutte. È scesa di uno solo la riga di `CatalogLivePreview` (`:79` → `:78`).

# 04 — Classi che non esistono: `custom-scrollbar` e `scrollbar-hide`

## Perché

Il foglio di stile definisce due utility per nascondere la barra di scorrimento — `.hide-scrollbar` e
`.no-scrollbar` (`app/globals.css:104-110`, con la variante `::-webkit-scrollbar`) — ma quattro
componenti usano **nomi diversi, che non esistono in nessun file CSS**. Effetto: la barra resta
visibile dove il progetto la vuole nascosta, e la classe non fa nulla.

| file:riga | classe scritta | classe vera |
|---|---|---|
| `components/dashboard/CatalogLivePreview.tsx:78` | `custom-scrollbar` | `hide-scrollbar` |
| `components/dashboard/ProfileManager.tsx:240` | `custom-scrollbar` | `hide-scrollbar` |
| `components/shared/AutocompleteSearch.tsx:98` | `custom-scrollbar` | `hide-scrollbar` |
| `components/modals/EditCatalogModal.tsx:33` | `scrollbar-hide` | `hide-scrollbar` |

## Cosa fare

Quattro sostituzioni, nient'altro. Non aggiungere alias nel CSS: la classe giusta esiste già e il
progetto ha *una* utility per questo scopo — scegliere `hide-scrollbar` (la più usata) e usare quella.

## Done quando

```bash
cd frontend/src && grep -rn "custom-scrollbar\|scrollbar-hide" --include="*.tsx" .
```

non restituisce nulla, e nei quattro punti la barra di scorrimento non è più visibile.

## Esito (21/10)

- `custom-scrollbar`/`scrollbar-hide` → `hide-scrollbar` in quattro punti (più l'omonimo in
  `AutocompleteSearch:97`, trovato durante il lavoro).
- `grep -rn "custom-scrollbar|scrollbar-hide" frontend/src` → vuoto.
