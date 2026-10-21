Status: resolved
Type: task
Blocked by: 01

> Riallineato al codice il 2026-10-21 (commit `12c4198`): i sei difetti reggono tutti, ma **le righe
> sono quasi tutte cambiate** e il primo è passato da una occorrenza a tre. Il sesto (doppio POST) è
> uscito di qui ed è diventato il ticket 12: era più grande del previsto.

# 07 — Micro-difetti verificati (logica e contrasto)

## Perché

Cinque difetti piccoli, indipendenti tra loro, tutti confermati nel codice. Nessuno è estetico: due
sono chiamate di rete sbagliate (una tripla), uno è un problema di contrasto, uno è un elemento
nascosto dietro l'header, uno è codice morto.

## Cosa fare

1. **`app/page.tsx:242`, `:287`, `:403`** — `https://${window.location.host}${manifestPath}` (e la
   variante con `host` locale) forza `https` anche in locale (`http://127.0.0.1:7860`) e su un IP
   Tailscale non-Funnel: la chiamata al manifest fallisce senza un errore comprensibile. Usare
   `window.location.protocol`. **Sono tre occorrenze, non una**: quando il ticket fu scritto ce n'era
   una sola a riga 256, il commit `12c4198` ne ha portate altre due. Se ne sistemi solo una, il difetto
   resta.

2. **`dashboard/DnaAndAiPanel.tsx:212-215` e `:226-230`** — due `useEffect` che al mount fanno la
   stessa `fetchAnalytics()`: il secondo ha la guardia `if (!localIsSyncing)`, ma `localIsSyncing`
   parte `false`, quindi parte subito. Risultato: **due** `GET /api/profiles/:id/analytics` a ogni
   apertura del tab, e la seconda può risolversi dopo la prima (stato vecchio che sovrascrive il
   nuovo). Tenere un solo percorso.

3. **`DnaAndAiPanel.tsx:236-275`** — codice morto: `handleAddManualDna` (`:236`),
   `handleRemoveManualDna` (`:248`), `handleSync` (`:261`) e i relativi stati non sono collegati a
   nessun JSX (il commento che lo dice è a `:232`). L'editor manuale è stato sostituito dal delta
   update del backend: rimuovere. **Attenzione**: `DNAItem` resta usato (`:30`, `:57`, `:66`), quindi
   l'import non va tolto.

4. **`dashboard/CatalogLivePreview.tsx:93`** — `bg-primary/90 text-black` (il testo `% Match` è a
   `:94`): nero su rosso cupo, il contrasto del badge è nullo. `text-white`.

5. **`dashboard/UserLibraryPanel.tsx:356`** — la barra degli elementi selezionati è
   `sticky top-4 z-20`, mentre l'header è `sticky top-0 z-50` (`layout/Header.tsx:6`): durante lo
   scroll finisce **sotto** l'header. `top-16 sm:top-20 z-30` (lo sticky deve stare sotto l'header, non
   sopra).

6. **`pages/SettingsPage.tsx` → ticket 12.** Il doppio `POST /api/configure` non è un micro-difetto:
   è lo **scrittore unico** mancante, insieme al debounce dell'auto-save e agli slider legati a
   `onValueChange` (una tirata = 20 POST). Vedi ticket 12: qui non si tocca.

## Done quando

- il manifest si carica in locale e via IP senza forzare `https`, in **tutti e tre** i punti di
  `page.tsx` (`242`, `287`, `403`);
- aprendo il tab DNA & AI Lab si vede **una** richiesta `/analytics`;
- il badge `% Match` si legge; la barra della libreria resta sotto l'header durante lo scroll;
- nessun handler dichiarato e non usato in `DnaAndAiPanel`;
- il salvataggio è tracciato dal ticket 12, non da qui.

## Esito (21/10)

- `https://` forzato → `${window.location.protocol}//` in tutti e tre i punti di `page.tsx`
  (`242`, `287`, `403`); `grep 'https://${' app/page.tsx` → vuoto.
- `DnaAndAiPanel`: un solo `fetchAnalytics()` al mount; la ricarica avviene solo quando il sync
  **finisce** (`wasSyncingRef`).
- Codice morto rimosso (`handleAddManualDna`, `handleRemoveManualDna`, `handleSync`, `manualScore`) e
  la prop `syncProfileVectors` che serviva solo a quello.
- Badge `% Match`: `text-white`. Barra di selezione: `top-16 sm:top-20 z-30`.
- Il doppio POST è nel ticket 12 (risolto lì).
