Status: ready-for-agent
Type: task
Blocked by: 01

# 07 — Micro-difetti verificati (logica e contrasto)

## Perché

Sei difetti piccoli, indipendenti tra loro, tutti confermati nel codice. Nessuno è estetico: due sono
chiamate di rete sbagliate o doppie, uno è un problema di contrasto, uno è un elemento nascosto
dietro l'header.

## Cosa fare

1. **`app/page.tsx:256`** — `https://${window.location.host}${manifestPath}` forza `https` anche in
   locale (`http://127.0.0.1:7860`) e su un IP Tailscale non-Funnel: la chiamata al manifest fallisce
   senza un errore comprensibile. Usare `window.location.protocol`. *(Il PDF indica le righe 239 e
   275: è una sola occorrenza, a riga 256.)*

2. **`dashboard/DnaAndAiPanel.tsx:157-159` e `:163-166`** — due `useEffect` che al mount fanno la
   stessa `fetchAnalytics()`: il secondo ha la guardia `if (!localIsSyncing)`, ma `localIsSyncing`
   parte `false`, quindi parte subito. Risultato: **due** `GET /api/profiles/:id/analytics` a ogni
   apertura del tab, e la seconda può risolversi dopo la prima (stato vecchio che sovrascrive il
   nuovo). Tenere un solo percorso.

3. **`DnaAndAiPanel.tsx`** — codice morto: `handleAddManualDna`, `handleRemoveManualDna`,
   `handleSync` e i relativi stati non sono collegati a nessun JSX (c'è già un commento che lo dice,
   riga 168). L'editor manuale è stato sostituito dal delta update del backend: rimuovere.

4. **`dashboard/CatalogLivePreview.tsx:94`** — `bg-primary/90 text-black`: nero su rosso cupo, il
   contrasto del badge `% Match` è nullo. `text-white`.

5. **`dashboard/UserLibraryPanel.tsx:356`** — la barra degli elementi selezionati è
   `sticky top-4 z-20`, mentre l'header è `sticky top-0 z-50`: durante lo scroll finisce **sotto**
   l'header. `top-16 sm:top-20 z-30` (lo sticky deve stare sotto l'header, non sopra).
   *(Il PDF indica la riga 257: è la 356.)*

6. **`pages/SettingsPage.tsx:52-77`** — `handleSave` chiama `onUpdateProfile`, attende con
   `setTimeout(50)` e poi mappa su `profiles`, che appartiene alla closure del render precedente: non
   si aggiorna dopo l'attesa, e nel frattempo l'auto-save di `page.tsx:194` è già partito → due
   `POST /api/configure` concorrenti. **Prima di toccare**: stabilire se l'auto-save copre già il caso.
   Se sì, `handleSave` è ridondante e va rimossa; se no, va resa l'unica via (senza `setTimeout`, senza
   map sulla closure).

## Done quando

- il manifest si carica in locale e via IP senza forzare `https`;
- aprendo il tab DNA & AI Lab si vede **una** richiesta `/analytics`;
- il badge `% Match` si legge; la barra della libreria resta sotto l'header durante lo scroll;
- salvando le impostazioni parte un solo `POST /api/configure` (verificare nel pannello di rete);
- nessun handler dichiarato e non usato in `DnaAndAiPanel`.
