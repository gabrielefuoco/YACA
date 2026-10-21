Status: ready-for-human
Type: task
Blocked by: 04, 05, 06, 07

> Riallineato al codice il 2026-10-21 (commit `12c4198`): **la Parte A è già in codice.**
> `DashboardSkeleton.tsx:47` è `grid grid-cols-2 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap sm:w-fit`,
> la vista a regime è a colonna singola (`:54`), nessuna classe malformata nei 4 punti segnalati, e
> `LoginPage.tsx:189` rende il box errore dentro `{error && …}`. Resta solo la Parte B (verifica a
> video), più il rinvio del punto B1.2 al ticket 06 di `frontend-verifica`, dove è già tracciato.

# 08 — F6: skeleton, difetti collaterali e verifica finale

## Parte A — agente (**fatta**, verificata il 21/10)

### A1. Skeleton ≠ pagina reale
- ✅ `components/dashboard/DashboardSkeleton.tsx:47` — era un `inline-flex w-fit` da 552px, oggi è
  `grid grid-cols-2 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap sm:w-fit`, con il commento che spiega
  perché.
- ✅ `DashboardSkeleton.tsx:54-65` — la vista a regime è una lista a colonna singola
  (`flex flex-col gap-4 sm:gap-6 w-full`), non più una griglia a 3 colonne.
- ✅ `DashboardSkeleton.tsx` — nessuna classe malformata. L'unico orfano rimasto in tutto il repo è
  `ui/skeleton.tsx:9` (`bg-marrow-light/5 /5`), che appartiene al ticket 03 di `frontend-verifica`.

### A2. Collaterali
- ✅ `components/pages/LoginPage.tsx:189` — il box errore è dentro `{error && ( … )}`.
- ⏳ «i due container non producono più layout shift»: si misura nella B0, non si legge nel codice.

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

**B0 misurata il 21/10 dopo l'implementazione** (Chrome headless, `MOCK=1`, node 20 + shim `ws`):

| tab | 360 | 390 | 768 | 1024 | 1440 |
|---|---|---|---|---|---|
| Cataloghi Attivi | 0/0 | 0/0 | 0/0 | — | — |
| Esplora | 0/0 | 0/0 | 0/0 | 0/5 | 0/5 |
| Creatore | 0/0 | 0/0 | 0/0 | 0/5 | 0/5 |
| DNA & AI Lab | 0/0 | 0/0 | 0/0 | 0/5 | 0/5 |
| Libreria Utente | 0/0 | 0/0 | 0/0 | 0/5 | 0/5 |
| Impostazioni | 0/0 | 0/0 | 0/0 | — | — |

(valori: `sfondamenti non gestiti / touch target < 44px`; «—» = non misurato. I 5 bersagli da 38px a
≥1024 sono i tab della dashboard, con mouse: il criterio vale a 360)

> **Trappola del 21/10**: il foglio di stile non ha **nessuna** media query per l'hover tranne quella
> aggiunta dal ticket 08.2, e i chip `sm:min-h-0` abbassavano i tab a 38px già a 768 (tablet touch):
> portati a 44px fino a `lg`.

> Trappola già pagata una volta: gli screenshot con `captureBeyondViewport` colgono i font in fase di
> swap e mostrano le icone Material come testo letterale (`auto_awesome`, `grid_view`) che sembra
> sfondare le card. **Non è un difetto del prodotto**: è un artefatto del metodo. L'harness ora allarga
> il viewport e cattura senza `captureBeyondViewport`.

### B1 — Verifiche che richiedono un dispositivo reale

**Riscritte il 21/10** dopo il grilling di `frontend-verifica` (D1-D4 del suo `map.md`): le locandine
non hanno più gesture implicite e il titolo ha una posizione dichiarata, quindi le vecchie B1.2 e B1.4
non hanno più niente da verificare nella forma in cui erano scritte.

Dopo build e deploy (l'export statico `out/` è servito da Express, `index.js:86`):

1. **CreatorPanel dentro `EditCatalogModal`** con la tastiera virtuale aperta: la barra sticky
   "Annulla / Anteprima / Salva" (`CreatorPanel:1063`) resta raggiungibile? È il punto che D1 (il
   telefono cura) rende obbligatorio.
2. **Tocco inerte**: toccando una locandina nel carosello di ricerca **non** deve aggiungere nulla;
   l'aggiunta parte solo dal «+». Se il tocco aggiunge, il ticket 06 è stato applicato male.
3. **`position: sticky` dell'header** su Safari iOS (ticket 01 di `frontend-verifica`).
4. **PosterRow**: la riga scorre col dito senza barra visibile; e **non** mostra un titolo HTML sopra
   un poster che lo porta già stampato (fedeltà a Stremio).
5. **Ordine della libreria**: con la modalità «Ordina» (ticket 11) due frecce spostano la card e
   l'ordine sopravvive al reload; fuori dalla modalità, trascinare il dito scorre la pagina.
6. **Il «⋯» di una locandina** apre l'action sheet, che non viene tagliato dal bordo dello schermo né
   dal contenitore scrollabile; l'azione «Rimuovi» funziona.
7. **Codice di attivazione Trakt** a 360px e **modale Creator** a 360px: nessun testo tagliato.
8. **Una card catalogo vista in Esplora e in Cataloghi attivi**: identiche tranne i pulsanti (criterio
   del ticket 03 di questo fronte).
9. **Manopole del motore**: trascinare uno slider non fa tornare indietro la manopola e produce **un**
   POST al rilascio (ticket 12 di `frontend-verifica`).

## Done quando
La **Parte A è chiusa** (fatto, 21/10), la **B0 è verde su tutti i tab e le larghezze**, e i 6 punti
della B1 sono stati visti su un dispositivo reale (telefono, non solo emulazione).
