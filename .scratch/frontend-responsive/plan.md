# YACA — Piano di fix responsive

Deriva da `report.md`. Ordine per **dipendenza**, non per pagina: ogni fase abilita la successiva.
Regola di fondo: **poche fix globali prima di molte fix locali**, e **prima di tutto si cancella**.

Scope deciso: la console admin frontend **si elimina** (isola morta, zero link entranti).
Il backend `/api/admin/*` **resta**: è usato via curl dalle procedure ops.
Stima: **~7h di agente** (F0-F6) **+ ~1h** per F1b, un solo build/deploy.

---

## F0 — Togliere il mascheramento e l'isola morta (S, ~40 min) ← sempre per primo

**a) Il mascheramento (rendere visibili i difetti veri)**

| azione | file |
|---|---|
| Rimuovere `overflow-x-hidden` dal wrapper di root | `frontend/src/app/layout.tsx:20` |
| `min-h-screen` → `min-h-dvh`; `viewportFit: 'cover'` nel viewport metadata | `frontend/src/app/layout.tsx:19-20` |
| `min-w-0` su `<main>` e sul contenitore di contenuto | `frontend/src/app/page.tsx:539-540` |
| Allineare il contenitore dello skeleton a quello a regime (via `pb-32`, stesso `max-w`/padding) | `frontend/src/app/page.tsx:525` |

**b) Cancellare la console admin (668 righe)**

```
rm frontend/src/app/admin/page.tsx            # 84  — gate Master Password
rm frontend/src/app/admin/cache/page.tsx      # 242 — tabella cache (il P0 verificato a video)
rm frontend/src/components/admin/AdminDashboard.tsx  # 280
rm frontend/src/lib/adminApi.ts               # 62
```

Verificato prima di pianificare la cancellazione: nessun file del frontend importa questi moduli
(l'unico ingresso era `/admin` digitato a mano), e le 5 rotte `/api/admin/*` non sono chiamate dai
pulsanti dell'app.

**NON cancellare** `src/api/admin.js` (163 righe), `src/middleware/adminAuth.js` e
`index.js:25,130`: `docs/DEPLOYMENT_HOME_SERVER.md` e le procedure di ricostruzione cache usano
`curl -H "x-admin-pass: ..."` su `/api/admin/tmdb-dump/status`, `/api/admin/system/flush` e
`/api/admin/scripts/trigger`. La UI era un doppione del curl, non l'unico accesso.

**Done quando:** `grep -rn "admin" frontend/src` non restituisce nulla, non esiste nessun elemento
con `right > innerWidth` a 360px, e nessuna pagina ha scrollbar orizzontale.
**Perché per primo:** finché `overflow-x-hidden` c'è, ogni altro difetto di larghezza è invisibile in
sviluppo — è la ragione per cui il taglio della tabella cache è arrivato in produzione.

---

## F1 — Contratto di larghezza (S/M, ~1h)

1. **Pagine a colonna singola**: vincolare il contenuto invece di allargarlo.
   - `LoginPage` → wrapper `max-w-md mx-auto w-full` (`components/pages/LoginPage.tsx:122`)
   - `SettingsPage` → `max-w-2xl mx-auto` oppure `lg:grid lg:grid-cols-2`
     (`components/pages/SettingsPage.tsx:133`)
2. **Righe che collidono a 360px** — `flex-wrap`/impilamento, non testo più piccolo:
   `ActiveCatalogsPanel.tsx:92-108`, `DnaAndAiPanel.tsx:319,363`, `ExplorePanel.tsx:165`
   (motivo di incompatibilità sotto il titolo), `SettingsPage.tsx:254-256` (`min-w-0` + `truncate`
   sull'email, `shrink-0` sul pallino di stato).
3. Scroll orizzontale esplicito dove deve esistere: `layout/TabNav.tsx:16`.

**Done quando:** a 1440px nessun blocco di testo supera ~800px di misura; a 360px nessuna riga manda
il contenuto fuori schermo.

---

## F1b — Una sola card "catalogo" (M, ~1h) ← **prima di F2 e F5**

"Esplora" e "Cataloghi attivi" mostrano la stessa card scritta due volte: 44% dei blocchi visivi di
`shared/CatalogItem.tsx` byte-identico in `dashboard/ExplorePanel.tsx:134-227`, e solo due copie in
tutto il repo (vedi `report.md` §R8).

0. **Tipi, prima di tutto** (30 min, è il vincolo vero): `Preset.type` include `'both'`
   (`types/index.ts:93`) mentre `Catalog.type` no (`:65`) → passare un preset a `CatalogItem` **non
   compila**. Mappare il tipo e decidere il caso `'both'` (oggi in `ExplorePanel.tsx:215` etichettato
   "Serie": difetto preesistente da correggere qui — riusare la logica già presente in
   `TypeBadge.tsx:5` e `lib/catalogKind.ts:59`).
1. In `shared/CatalogItem.tsx` aggiungere slot opzionali (~10 righe): `actions?: ReactNode` (zona in
   alto a destra, oggi riordino/duplica/rimuovi), `badges?: ReactNode` (badge extra accanto a quello
   di sorgente), `description?: string` (Esplora ha `preset.description`, oggi la card legge
   `raw_prompt`). Tutti gli handler restano opzionali: la card senza handler è già valida.
2. In `ExplorePanel.tsx` sostituire la card inline (~134-227) con `<CatalogItem …/>` +
   `actions={<Aggiungi/Modifica>}` + `badges={<categoria>}`: ~95 righe cancellate.
3. **Le classi "vetro" in `@layer components`** (`app/globals.css:82,92`): oggi sono fuori layer e
   battono le utility layered, quindi `bg-white/60`, `border-2 border-marrow-light/10`,
   `hover:bg-white/90 hover:border-primary/30`, `shadow-sm` **non hanno mai avuto effetto** su nessuna
   delle due card (vedi `report.md` §R9). **Decisione D5, presa**: si cancellano le utility morte
   (l'aspetto attuale resta identico: erano già ignorate) e **non** si tocca il layer, che cambierebbe
   l'aspetto di tutte e 9 le superfici `glass-*`. In ogni caso: `border-radius: 1rem` ai due token,
   perché le card oggi hanno **spigoli vivi** dentro contenitori arrotondati.
4. **Non** toccare `PosterRow` qui: è già condiviso da Esplora, lista cataloghi e Creator.

**Done quando:** `grep -rn glass-card frontend/src` → 1 solo file; `grep "size-9 sm:size-12"` → 1 sola
occorrenza; un catalogo mostrato in Esplora e negli attivi ha stesso guscio, titolo, badge, blocco
poster e footer, e **raggio degli angoli coerente col resto della dashboard**. Differenze ammesse:
solo i pulsanti e il drag.

---

## F2 — Contratto touch (M, ~1,5h) ← il difetto più sentito

1. **Affordance hover-only residue** (erano 22 in 10 file; 2 spariscono con F0b).
   *Default proposto: visibili stabilmente solo dove l'hover non esiste* (`@media (hover: none)`),
   desktop invariato. In ordine di rischio:
   | dove | azione | file:line |
   |---|---|---|
   | carosello TMDB | "+ Aggiungi" invisibile **ma cliccabile** → aggiunte involontarie | `shared/AutocompleteSearch.tsx:111` |
   | libreria utente | rimozione + titolo (nascosto con `hidden sm:flex`) | `dashboard/UserLibraryPanel.tsx:407,411` |
   | PosterRow | titolo e anno | `shared/PosterRow.tsx:77` |
   | CatalogLivePreview | metadati (qui `pointer-events-none`: non si vedono **né** si toccano) | `dashboard/CatalogLivePreview.tsx:98-101` |
   | CatalogItem | 6 occorrenze | `shared/CatalogItem.tsx` |
   | CreatorPanel | riordino/eliminazione lista manuale, tooltip opzioni avanzate | `dashboard/CreatorPanel.tsx:655-701,995,1025` |
2. **Portare a 44px** i target primari: `ProfileManager.tsx:94-121,182`, `CatalogItem.tsx:123,135,174`,
   `UserLibraryPanel.tsx:407`, `ui/slider.tsx:18`, `ui/switch.tsx:12`, `ui/select.tsx:18,91`,
   `CreatorPanel.tsx:443,822,839,1049`, `LoginPage.tsx:223,234`, `SettingsPage.tsx:180,193,216,229`,
   `TabNav.tsx:22`.
3. **Invertire l'ergonomia sbagliata**: `h-10 sm:h-12` → almeno `h-11` a ogni breakpoint
   (`LoginPage.tsx:172,184`).
4. **Fix strutturale**: `CreatorPanel.tsx:475-485` — il `<span role="button">` dentro il `<button>`
   accordion va estratto come fratello (HTML non valido + tocco che finisce sull'accordion).

**Done quando:** nessun controllo interattivo sotto 44×44px, e nessuna azione invisibile su un
dispositivo senza hover.

---

## F3 — Griglie e breakpoint mancanti (S/M, ~1h)

| file | da | a |
|---|---|---|
| `ProfileManager.tsx:135` | `grid-cols-2 sm:3 md:6` | `grid-cols-2 sm:3 md:4 lg:6` |
| `UserLibraryPanel.tsx:369` | `grid-cols-3 …` | `grid-cols-2 min-[400px]:grid-cols-3 …` |
| `CreatorPanel.tsx:726,755,768` | `grid-cols-2` fisso | `grid-cols-1 sm:grid-cols-2` |
| `DashboardPage.tsx:188` | 5 tab in `grid-cols-2/3` | ultimo tab `col-span-2` sotto 420px |
| `CreatorPanel.tsx:645` | card `w-[100px]` | griglia fluida `grid-cols-2 sm:grid-cols-3` |

**Done quando:** a 360/390/768/1024 nessuna colonna scende sotto la larghezza minima del contenuto
(titoli troncati a metà parola = sintomo non risolto).

---

## F4 — Elementi fuori scala (S, ~45 min)

- `DashboardPage.tsx:215` `min-h-[500px]` → `min-h-[280px] sm:min-h-[500px]`;
- `DnaAndAiPanel.tsx:349` `min-h-[140px]` → `min-h-[80px] sm:min-h-[140px]` + `p-3 sm:p-6`;
- `TraktAuthModal.tsx:149` codice attivazione `text-4xl tracking-[0.3em]` (8 caratteri ≈ 259px in
  235px utili) → `text-2xl sm:text-4xl` + `break-all`; togliere il doppio `p-6` (`:117` + card
  interna → `p-4 sm:p-6`);
- `CreatorPanel.tsx:919-937` poster `w-16 h-24` → `w-full aspect-[2/3] max-w-[120px]`;
- poster: **un solo contratto di forma** (oggi 100/120/140/150px e `rounded-md/lg/xl` in 6 file).
  Decisione D6, presa: si estrae la primitiva.
  - **minima:** allineare le classi esistenti a `aspect-[2/3]` + un solo raggio, senza nuovo componente;
  - **`PosterCard` condivisa** (`slaves/ui-unify-catalogs.md` la specifica con interface TS e 3 siti
    before/after): 3 taglie `sm` (100×150), `md` (120→150 responsive, assorbe il 140×210 orfano),
    `fluid` (griglie). Bilancio onesto: **−6 righe nette** (+159 di migrazioni). La ragione per farla
    non è il codice ma la correttezza: **5 siti su 6 renderizzano `<img>` senza `onError`**, quindi un
    poster rotto resta rotto per sempre — il bug già risolto in `PosterImage.tsx` e mai propagato.
    Il costo è dichiarato e accettato: si paga in correttezza, non in righe.
- modali a schermo pieno su mobile: `EditCatalogModal.tsx:23` → `h-[100dvh] rounded-none` sotto `sm:`.

**Done quando:** nessun blocco di altezza fissa supera il 60% del viewport del suo breakpoint e i
poster hanno la stessa forma nelle quattro superfici.

---

## F5 — Tipografia (S, ~30 min, meccanico) — **dopo F3**

91 occorrenze di `text-[9px]`/`text-[10px]`/`text-[11px]` in 18 file (`CreatorPanel` 34,
`CatalogItem` 11, `DnaAndAiPanel` 9, `ExplorePanel` 7, resto sparso) → sostituzione diretta a
`text-xs`, verificando i ~5 punti dove il testo più grande può sfondare il contenitore (chip, badge,
etichette accanto agli switch).

**Done quando:** `grep -rE 'text-\[(9|10|11)px\]' frontend/src` restituisce 0 righe.

---

## F6 — Skeleton, collaterali, verifica (M, ~1,5h)

- `DashboardSkeleton.tsx:46-49`: `inline-flex w-fit` = 552px garantiti → `grid grid-cols-2 sm:flex sm:w-fit`;
- skeleton a 3 colonne mentre la vista reale è a colonna singola (`:53`) → allineare alla vista reale;
- classi Tailwind malformate `border-zinc-200 /50`, `bg-primary/5 /40`, `bg-primary/5 /60`
  (`:19,28,46,55`) → ripulire;
- `LoginPage.tsx:189-191`: box errore dentro `{error && ...}` (oggi rettangolo rosso vuoto);
- verifiche a video di `report.md` §5 (tastiera virtuale nel CreatorPanel, carosello TMDB, sticky su
  Safari iOS, PosterRow in swipe).

**Done quando:** il layout shift al caricamento sparisce e i 4 punti di verifica sono stati visti a
schermo reale.

---

## Verifica (identica per ogni fase)

Il frontend è un **export statico** (`next.config.ts` → `output: 'export'`) servito da Express
(`index.js:86`): nessuna fix è visibile finché non si esegue `npm run build` in `frontend/` e non si
rideploya il container.

Harness di misura già pronto, fuori dal repo, senza dipendenze:

```
node /c/tmp/measure.mjs http://localhost:3000 <pagina> 360 390 768 1024 1440
SHOTS=1 SHOT_DIR=<dir>   # + screenshot con emulazione device corretta
```

Restituisce per ogni viewport: `scrollWidth` del documento, quanti elementi sfondano il bordo e
**quali** (classe CSS, larghezza, `min-width` calcolato). Criterio di accettazione: **zero elementi
oltre il bordo a 360/390/768/1024/1440**. Se lo si vuole ripetibile in CI, è candidato a diventare
`scripts/responsive-audit.mjs` — non richiesto ora.

---

## Cosa NON fare

- **Non** sostituire `overflow-x-hidden` con `overflow:hidden` più in profondità né con
  `max-w-[100vw]`: si sposta il taglio, non si corregge la larghezza.
- **Non** cancellare il backend `/api/admin/*`: è l'accesso operativo usato dai curl di deploy e
  manutenzione. Si cancella la **UI**, non l'API.
- **Non** riscrivere le classi Tailwind in blocco né introdurre una libreria UI: mancano i contratti,
  non i componenti.
- **Non** ridurre i padding per far stare le cose: è la tecnica che ha prodotto i 91 `text-[9px]`.
- **Non** fare F5 prima di F3.

## Ticket operativi

`.scratch/frontend-responsive/issues/` — 8 ticket, uno per fase, `Status: ready-for-agent`, con le
dipendenze dichiarate (`Blocked by`): `01` F0 → `02` F1 → `03` F1b → `04` F2 → `05` F3 → `06` F4 →
`07` F5 → `08` F6 (l'ultimo include la verifica a video, che richiede un dispositivo reale).

## Decisioni

| # | tema | stato |
|---|---|---|
| D1 | tabelle admin su mobile | **chiusa** — la console admin si elimina (F0b) |
| D2 | affordance hover residue | **chiusa** — `pointer-coarse:opacity-100` (una classe per sito, desktop invariato) |
| D3 | micro-tipografia | **chiusa** — sostituzione diretta a `text-xs` |
| D4 | scope primo giro | **chiusa** — tutto in un giro (F0-F6), un solo build/deploy |
| D5 | aspetto delle card `glass-*` | **chiusa** — si cancellano le utility morte, si mette `border-radius: 1rem` ai due token, **non** si tocca il layer (zero rischio visivo) |
| D6 | primitiva `PosterCard` | **chiusa** — si fa dentro F4 (taglie `sm`/`md`/`fluid`, il 140×210 orfano muore); si paga in correttezza, non in righe |
