Status: resolved
Type: task

# 01 — F0: togliere il mascheramento e l'isola admin morta

## Perché
`overflow-x-hidden` sul wrapper di root (`frontend/src/app/layout.tsx:20`) nasconde **ogni** difetto di
larghezza: il contenuto che non ci sta viene tagliato, senza scroll e senza avviso. È la ragione per cui
il taglio della tabella cache è arrivato in produzione senza che nessuno lo vedesse in sviluppo.
Finché resta lì, ogni altra fix di questo piano è invisibile mentre la si fa. (`report.md` §R1)

## Cosa fare
1. `frontend/src/app/layout.tsx:20` — rimuovere `overflow-x-hidden` dal wrapper di root.
2. `frontend/src/app/layout.tsx:19-20` — `min-h-screen` → `min-h-dvh`; esportare
   `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`.
3. `frontend/src/app/page.tsx:539-540` — `min-w-0` su `<main>` e su `.layout-content-container`
   (è la causa tecnica per cui i figli flex non possono restringersi sotto la loro larghezza minima).
4. `frontend/src/app/page.tsx:525` — allineare il container dello **skeleton** a quello a regime:
   `px-3 sm:px-6 md:px-10`, `max-w-[1200px]`, senza `pb-32` (oggi `max-w-6xl px-3 sm:px-4 pb-32`:
   produce layout shift a ogni caricamento).
5. Cancellare la console admin frontend (668 righe, **zero riferimenti entranti** — verificato con
   `grep` su tutto `frontend/src`):
   - `frontend/src/app/admin/page.tsx` (84)
   - `frontend/src/app/admin/cache/page.tsx` (242)
   - `frontend/src/components/admin/AdminDashboard.tsx` (280)
   - `frontend/src/lib/adminApi.ts` (62)

## NON fare
Non cancellare `src/api/admin.js`, `src/middleware/adminAuth.js` né `index.js:25,130`: sono l'accesso
operativo usato via `curl -H "x-admin-pass: ..."` dalle procedure di deploy e manutenzione
(`docs/DEPLOYMENT_HOME_SERVER.md`; flush cache e trigger script). Si cancella la **UI**, non l'API.
Non sostituire `overflow-x-hidden` con `overflow:hidden` più in profondità né con `max-w-[100vw]`:
si sposta il taglio, non si corregge la larghezza.

## Done quando
- `grep -rn "admin" frontend/src` non restituisce più nulla;
- zero elementi oltre il bordo del viewport a 360/390/768/1024/1440 su `/`, e nessuna scrollbar
  orizzontale su nessuna pagina;
- `cd frontend && npm run build` passa.

## Verifica
Harness di misura (fuori dal repo, senza dipendenze):
`node C:/tmp/measure.mjs <baseUrl> <pagina> 360 390 768 1024 1440` → stampa, per ogni viewport,
`scrollWidth` del documento e **quali** elementi sfondano (classe CSS, larghezza, `min-width`).
Server: `cd frontend && npm run dev`. Ricorda che la produzione è l'export statico in `out/` servito
da Express (`index.js:86`): la fix si vede solo dopo build + redeploy del container.
