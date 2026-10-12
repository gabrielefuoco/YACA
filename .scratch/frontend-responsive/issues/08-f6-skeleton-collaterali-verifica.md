Status: ready-for-human
Type: task
Blocked by: 04, 05, 06, 07

# 08 — F6: skeleton, difetti collaterali e verifica finale

## Parte A — agente

### A1. Skeleton ≠ pagina reale
- `components/dashboard/DashboardSkeleton.tsx:46-49` — 4 blocchi `w-32` (128px) + `mx-1` dentro
  `inline-flex w-fit p-1` = **552px garantiti**: nei 360px non ci stanno e (prima del ticket 01)
  venivano tagliati. Correggere in `grid grid-cols-2 sm:flex sm:w-fit`.
- `DashboardSkeleton.tsx:53` — griglia a 3 colonne mentre la vista reale è una lista a colonna
  singola: allineare alla vista reale (CLS).
- `DashboardSkeleton.tsx:19,28,46,55` — classi Tailwind malformate `border-zinc-200 /50`,
  `bg-primary/5 /40`, `bg-primary/5 /60`: token di opacità orfani, effetto nullo. Ripulire.

### A2. Collaterali
- `components/pages/LoginPage.tsx:189-191` — il box errore è renderizzato **incondizionatamente**:
  con `error` vuoto resta un rettangolo rosso bordato vuoto sopra "Continua" (visibile nello screenshot
  360). Mettere dentro `{error && ...}`.
- Verificare che i due container (skeleton e a regime) non producano più layout shift all'avvio.

## Parte B — verifica a video (richiede un umano + backend; al termine portare il ticket a `ready-for-human`)

### B0 — Verifica strumentale, senza backend (fatta dall'agente, prima di tutto)

L'harness ora sa rendersare la dashboard dietro login **e** navigare i suoi tab: simula
`/api/auth/me` e `/api/presets` (`MOCK=1`) e clicca un tab per etichetta (`CLICK=...`). Il resto delle
API fallisce, gli hook degradano nei loro stati vuoti — sufficiente per misurare i contenitori.

```
MOCK=1 CLICK="Esplora" node C:/tmp/measure.mjs http://localhost:3000 / 360 390 768 1024 1440
```

Tab della dashboard (etichette reali): `Cataloghi Attivi`, `Esplora`, `Creatore`, `DNA & AI Lab`, `Libreria Utente`.
Più `/` (login) e `Impostazioni`.

**Criterio di accettazione**: `elementi che sfondano=0` a **tutte** le larghezze su **ogni** tab, e
`touch target < 44px: 0` su `/` a 360px. Le istantanee (`SHOTS=1 SHOT_DIR=...`) si ispezionano a occhio:
un tab può non sfondare e restare sbagliato.

> Trappola già pagata una volta: gli screenshot con `captureBeyondViewport` colgono i font in fase di
> swap e mostrano le icone Material come testo letterale (`auto_awesome`, `grid_view`) che sembra
> sfondare le card. **Non è un difetto del prodotto**: è un artefatto del metodo. L'harness ora allarga
> il viewport e cattura senza `captureBeyondViewport`.

### B1 — Verifiche che richiedono un dispositivo reale

Dopo build e deploy (l'export statico `out/` è servito da Express, `index.js:86`):

1. **CreatorPanel dentro `EditCatalogModal`** con la tastiera virtuale aperta su un telefono reale: la
   barra sticky "Annulla / Anteprima / Salva" resta raggiungibile?
2. **Carosello TMDB**: toccando una locandina si aggiunge il titolo? (azione oggi invisibile: decidere
   il comportamento, non solo lo stile).
3. **`position: sticky` dell'header** su Safari iOS dopo la rimozione di `overflow-x-hidden`
   (ticket 01).
4. **PosterRow**: la riga orizzontale è scorrevole col dito senza scrollbar visibile?
5. **Codice di attivazione Trakt** a 360px e **modale Creator** a 360px: nessun testo tagliato;
6. **Una card catalogo vista in Esplora e in Cataloghi attivi**: identiche tranne i pulsanti (è il
   criterio del ticket 03, verificabile solo dove i preset si caricano davvero).

## Done quando
La parte A è chiusa e verde, la **B0 è verde su tutti i tab e le larghezze**, e i 6 punti della B1 sono
stati visti su un dispositivo reale (telefono, non solo emulazione).
