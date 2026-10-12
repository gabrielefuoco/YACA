# YACA — Analisi responsive frontend (report)

Ambito: `frontend/` — Next.js 16 + React 19 + Tailwind v4, 24 componenti + 3 pagine, ~8.4k righe.

➡️ Piano di intervento: [plan.md](plan.md) · Perizie integrali: [slaves/](slaves/ui-shell.md)
Esito: **7 cause radice**, non 60 bug indipendenti. Tre sono di impostazione globale e spiegano la
maggior parte dei difetti percepiti.

---

## 1. Metodo e affidabilità dei dati

Due fonti indipendenti e incrociate:

1. **4 perizie statiche in parallelo** (slave agy, sola lettura, nessuna modifica al repo), una per
   superficie: shell/login/settings, dashboard/profili, CreatorPanel/modali, libreria/DNA/admin.
   Perizie integrali: `.scratch/frontend-responsive/slaves/*.md`.
2. **Misurazione sperimentale** (mia, indipendente): harness Chrome DevTools Protocol su `next dev`,
   viewport 360 / 390 / 768 / 1024 / 1440, che rileva *quale* elemento sfonda il viewport e cattura
   screenshot con emulazione device corretta. Screenshot: `.scratch/frontend-responsive/screens/`.

**Legenda stato di ogni difetto:**

| simbolo | significato |
|---|---|
| ✅ | verificato a video (misurato/screenshot) |
| 🔍 | verificato nel codice (riga citata, aritmetica CSS rifatta) |
| ⚠️ | plausibile ma non confermabile senza backend |

**Limiti dichiarati.** In `next dev` non c'è backend (le API sono relative: `/api/...`), quindi
dashboard, Esplora, Libreria, DNA e le pagine dietro Master Password **non sono renderizzabili**:
per quelle superfici l'evidenza resta statica. L'harness è riutilizzabile identico per la verifica
post-fix.

> Nota metodologica utile: un primo giro di screenshot con `chrome --window-size` mostrava il login
> "tagliato" a 360px. Era un artefatto del metodo (crop di un layout renderizzato più largo), **non
> un bug**. Rifatta la misura con emulazione device: il login a 360px è corretto. Vale come
> promemoria: i difetti qui sotto sono quelli che hanno retto alla controprova.

---

## 2. Verdetto

Il problema non è "la pagina X non è responsive". È che **mancano tre contratti di base**, e i
sintomi si spargono su tutte le pagine:

1. **Non esiste un contratto di larghezza** → su desktop i contenuti si dilatano a 1100-1200px
   (login, impostazioni: input larghi 1120px), su mobile i casi che non stanno nelle 360px non
   vengono corretti ma **nascosti** da un `overflow-x-hidden` al root (`layout.tsx:20`): il contenuto
   viene tagliato, senza scroll, senza avviso.
2. **Non esiste un contratto touch** → 22 affordance esistono solo in `:hover` (invisibili e non
   individuabili al dito, ma spesso ancora cliccabili: quindi *azioni distruttive o di aggiunta
   accidentale*) e ~30 controlli sono alti 24-36px contro i 44px minimi.
3. **Non esiste un contratto tipografico** → 91 occorrenze di `text-[9px]`/`text-[10px]`/`text-[11px]`
   in 18 file, usate per far stare in griglie che non si adattano. È il sintomo, non la cura.

---

## 3. Le cause radice

### R1 — Nessun contratto di larghezza: desktop "esploso", mobile tagliato ✅🔍

| evidenza | file | stato |
|---|---|---|
| `overflow-x-hidden` sul wrapper di root: il contenuto che non ci sta viene tagliato senza scroll | `app/layout.tsx:20` | ✅ verificato su `/admin/cache` |
| Login: nessun `max-w-*`, il form occupa i 1200px del contenitore → input e box nota larghi ~1120px | `components/pages/LoginPage.tsx:122` | ✅ screenshot 1440 |
| Settings: idem, card "Account" e "Salva & Installa" a tutta larghezza con bottoni da 1120px | `components/pages/SettingsPage.tsx:133` | 🔍 |
| Tabella cache: 4 colonne con `px-6` per cella → larghezza minima 481px, tagliata a 360/390px **senza** possibilità di scroll | `app/admin/cache/page.tsx:161-192` | ✅ misura: `td` a 481px, `docScrollWidth` resta 360 |
| `<main>` e il contenitore di contenuto senza `min-w-0`: i figli flex non possono restringersi sotto la loro larghezza minima (è la causa tecnica per cui R1 si propaga a tutte le pagine) | `app/page.tsx:539-540` | 🔍 |

Questa è la causa con l'impatto più alto e la fix più piccola: `overflow-x-hidden` va **rimosso**,
non aggirato. Finché resta, ogni altro difetto di larghezza è invisibile in sviluppo e silenzioso in
produzione.

### R2 — Affordance esclusivamente `:hover` (22 occorrenze, 10 file) 🔍

Elementi con `opacity-0 group-hover:opacity-100` — su touch non esiste hover. Peggio: `opacity:0`
**non disattiva i click**, quindi ciò che è invisibile resta toccabile: non è solo un difetto di
leggibilità, è un rischio di azione involontaria.

| dove | azione nascosta | file:line |
|---|---|---|
| Carosello di ricerca TMDB | "+ Aggiungi" alla libreria — invisibile ma cliccabile: il tap "esplorativo" aggiunge il titolo | `shared/AutocompleteSearch.tsx:111` |
| Libreria utente | titolo del titolo (nascosto su mobile con `hidden sm:flex`) + rimozione | `dashboard/UserLibraryPanel.tsx:407,411` |
| PosterRow | titolo e anno | `shared/PosterRow.tsx:77` |
| CatalogLivePreview | metadati poster (con `pointer-events-none`: qui il tap non funziona **né** si vede) | `dashboard/CatalogLivePreview.tsx:98-101` |
| Cache admin | "Svuota" la cache del namespace, su riga `group` | `app/admin/cache/page.tsx:189,208` |
| CreatorPanel | riordino/eliminazione della lista manuale | `dashboard/CreatorPanel.tsx:655-701` |
| CreatorPanel | tooltip "Solo anime" / "Badge episodi" | `dashboard/CreatorPanel.tsx:995,1025` |

### R3 — Micro-tipografia sistematica: 91 occorrenze sotto i 12px, in 18 file 🔍

`text-[9px]`, `text-[10px]`, `text-[11px]`, quasi sempre coniugate con `uppercase` e
`tracking-widest`. Distribuzione: CreatorPanel 34, CatalogItem 11, DnaAndAiPanel 9, ExplorePanel 7,
ProfileManager 4, DnaBarChart 4, ActiveCatalogsPanel 4, Settings 3, admin/cache 3, altri 12.

Non è una questione di gusto: `tracking-widest` su 9px in maiuscolo è illeggibile a densità mobile e
rende illeggibile proprio l'informazione di stato (contatori, badge, motivazioni). La sostituzione è
meccanica, ma va fatta **dopo** R5 (griglie), altrimenti il testo più grande sfonda i contenitori
che oggi sono tenuti in piedi proprio dal testo minuscolo.

### R4 — Touch target sotto i 44px (~30 punti, 10 file) 🔍

Esempi con misura: "Attiva" profilo 24-28px (`ProfileManager.tsx:182`) dentro una card a sua volta
cliccabile; icone profilo 32-36px (`ProfileManager.tsx:94-121`); frecce su/giù catalogo 32×28px
(`CatalogItem.tsx:123,135`); rimozione card libreria 28px (`UserLibraryPanel.tsx:407`); thumb slider
16px (`ui/slider.tsx:18`); switch 20px (`ui/switch.tsx:12`); rimozione pillola 12px
(`CreatorPanel.tsx:443`); chip generi ~28px (`CreatorPanel.tsx:822,839`); trigger select 36px
(`ui/select.tsx:18`); pulsanti "Salta"/"Continua" Trakt 24-28px (`LoginPage.tsx:223,234`).

Nota di pattern: in login la scala è **invertita** — input `h-10` (40px) su mobile e `h-12` (48px) su
desktop (`LoginPage.tsx:172,184`). L'ergonomia dell'area grande serve dove c'è il dito, non su
desktop.

### R5 — Griglie a colonne fisse, senza scaglioni intermedi 🔍

| dove | classi | effetto a 360 / 768 |
|---|---|---|
| Profili | `grid-cols-2 sm:grid-cols-3 md:grid-cols-6` (`ProfileManager.tsx:135`) | salto 3→6 colonne: a 768px ogni card ha ~101px, utile interno ~69px |
| Libreria utente | `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8` (`UserLibraryPanel.tsx:369`) | a 360px card ~100px con poster + due pulsanti |
| CreatorPanel filtri | `grid grid-cols-2 gap-3` su Select "Ordina per" / "Lingua" (`CreatorPanel.tsx:726`) | colonne ~141px: le voci lunghe si troncano a pochi caratteri |
| CreatorPanel voto | `grid grid-cols-2 gap-3` con due Slider 0-9 step 0.5 (`CreatorPanel.tsx:755-768`) | ~125px per slider con 20 step: ~6px per step, mira impossibile |
| Tab dashboard | `grid grid-cols-2 min-[420px]:grid-cols-3 sm:flex` (`DashboardPage.tsx:188`) | 5 tab: 5ª casella isolata, seconda riga con cella vuota |
| Lista manuale | card `w-[100px] sm:w-[120px]` (`CreatorPanel.tsx:645`) | 2 colonne e ~80px di buco sul margine destro |

### R6 — Dimensioni fisse "fuori scala" (il difetto segnalato come "elementi fuori scala") ✅🔍

| elemento | valore | file:line | perché è fuori scala |
|---|---|---|---|
| System Log admin | `h-[600px]` | `admin/AdminDashboard.tsx:244` | 600px su un viewport da 640px: occupa tutto lo schermo con zero log, e crea una scroll-trap interna |
| Pannello contenuti tab | `min-h-[500px]` | `pages/DashboardPage.tsx:215` | vuoto verticale enorme su mobile, 78% dello schermo |
| Cataloghi hero DNA | `min-h-[140px]` × 4 | `dashboard/DnaAndAiPanel.tsx:349` | ~880px di spazio per poche righe |
| Codice attivazione Trakt | `text-4xl` + `tracking-[0.3em]` | `modals/TraktAuthModal.tsx:149` | 8 caratteri ≈ 259px in 235px utili (92vw − 2×24 doppio `p-6`): va a capo in mezzo al codice |
| Poster negli "Lista Statica AI" | `w-16 h-24` (64×96) | `dashboard/CreatorPanel.tsx:919-937` | francobolli dentro colonne larghe 140-180px |
| Poster tra superfici | 100px / 120px / 140px / 150px + `rounded-md`/`lg`/`xl` | AutocompleteSearch / PosterRow / CatalogLivePreview / UserLibrary | quattro contratti geometrici diversi per lo stesso oggetto |
| Skeleton vs reale poster | 150×225 vs 140×210 | `CatalogLivePreview.tsx:63,84,90` | scatto di layout (CLS) al caricamento |

### R7 — Skeleton ≠ pagina reale, e difetti collaterali ✅🔍

- **Skeleton dei tab: 552px garantiti** — 4 blocchi `w-32` (128px) + `mx-1` dentro un `inline-flex
  w-fit p-1` (`DashboardSkeleton.tsx:46-49`): nei 360px non ci sta e, per R1, viene **tagliato**.
  🔍 (aritmetica: 4×128 + 4×8 + 8 = 552)
- Skeleton con griglia a 3 colonne mentre la vista reale è una lista a colonna singola
  (`DashboardSkeleton.tsx:53`) → salto visivo. 🔍
- Container dello skeleton diverso da quello a regime (`max-w-6xl px-3 sm:px-4 pb-32` vs
  `max-w-[1200px] px-3 sm:px-6 md:px-10`) → layout shift a ogni caricamento. 🔍
- **Box errore renderizzato incondizionatamente** in login: con `error` vuoto resta un rettangolo
  rosso bordato vuoto sopra "Continua" (`LoginPage.tsx:189-191`). ✅ visibile nello screenshot 360.
- **Classi Tailwind malformate** nello skeleton: `border-zinc-200 /50`, `bg-primary/5 /40`,
  `bg-primary/5 /60` — token di opacità orfani, effetto nullo (`DashboardSkeleton.tsx:19,28,46,55`). 🔍
- `<span role="button">` (con `onClick`, `p-0.5`, icona `h-4`) **dentro** un `<button>` accordion:
  nesting interattivo non valido (`CreatorPanel.tsx:475-485`). 🔍
- Contrasto: `text-gray-900` su `bg-red-500` (2.8:1, sotto WCAG AA) nel pulsante "Sblocca"
  (`app/admin/page.tsx:60`). 🔍

### R8 — Widget duplicati: "Esplora" e "lista cataloghi" sono la stessa card scritta due volte ✅🔍

**Nota dell'utente, verificata e confermata.** Le due superfici sembrano widget diversi perché
*sono* due widget diversi nel codice — ma solo perché uno è la copia dell'altro:

| | dove | cos'è |
|---|---|---|
| "Esplora" | `dashboard/ExplorePanel.tsx:134-227` | card inline, preset da aggiungere |
| "Cataloghi attivi" | `shared/CatalogItem.tsx` (usata da `ActiveCatalogsPanel.tsx:139,174`) | la stessa card, con azioni di gestione |

**Misure (non impressioni):**

- dei 32 blocchi `className` significativi di `CatalogItem`, **14 sono byte-identici** in `ExplorePanel`
  (44%) — e sono **lo scheletro completo in sequenza**: guscio → riga header → box emoji → titolo →
  riga badge → descrizione → blocco poster → footer → meta;
- `hover:bg-white/90 hover:border-primary/30`, il box `size-9 sm:size-12 rounded-xl sm:rounded-2xl ...
  shadow-inner`, il titolo `font-black text-marrow-deep text-sm sm:text-lg leading-tight truncate
  group-hover:text-primary`, il blocco poster `-mx-1 sm:-mx-2 ... group/row` con l'alone
  `group-hover/poster:opacity-100`: **le stesse stringhe, in entrambi i file**;
- `grep "size-9 sm:size-12"` → **2 sole occorrenze in tutto il repo**: la duplicazione è chiusa, non è
  il caso di un pattern ripetuto 8 volte. Unificarle non crea un componente a varianti; elimina una
  copia.

**Differenze legittime (le uniche):** le azioni (Aggiungi/Aggiunto/Modifica vs riordino/duplica/rimuovi),
il drag&drop (solo `CatalogItem`), il badge (sorgente vs categoria), il conteggio filtri (statico vs
pulsante "Modifica filtri"). Sono differenze di **slot**, non di aspetto.

**Conseguenza per il piano:** la cucitura costa ~8 righe in `CatalogItem` (slot `actions`/`badges`) e
ne cancella ~95 in `ExplorePanel`. Va fatta **prima** di F2 (touch) e F5 (tipografia), che toccano
esattamente quelle righe: altrimenti si corregge due volte lo stesso markup.

**Asse separato (già mezzo unificato):** i poster sono renderizzati in 6 file — `shared/PosterRow.tsx`
(usato da Esplora, lista cataloghi e Creator), `shared/PosterImage.tsx` (libreria),
`AutocompleteSearch.tsx` (inline), `CatalogLivePreview.tsx` (140×210 fisso), `CreatorPanel.tsx`
(`w-16 h-24`), `UserLibraryPanel.tsx`. Studio completo di fattibilità (inventario di 8 siti-cards,
interface TS, bilancio righe, rischi): `slaves/ui-unify-catalogs.md`.

**Lo studio quantifica tre grappoli di duplicazione (~165 righe, 7 file):**

| grappolo | file | righe dup. |
|---|---|---|
| shell card catalogo (header, emoji, tipografia, slot poster, footer) | `ExplorePanel` ↔ `CatalogItem` | 67 |
| tile poster da carosello (img, fallback, overlay gradiente) | `PosterRow` ↔ `CatalogLivePreview` | 38 |
| overlay azioni su titolo (`bg-black/60` + pulsanti) | `UserLibrary` ↔ `CreatorPanel` ↔ `AutocompleteSearch` | 35 |
| fallback immagine rotta (5 siti con `<img>` nudo, senza `onError`) | `PosterRow`, `CatalogLivePreview`, `CreatorPanel`×2, `AutocompleteSearch` | 25 |

**Le due riserve che il piano deve recepire (verificate da me, non dallo studio):**

1. **`Preset` non è un `Catalog`.** `types/index.ts:93` dichiara
   `Preset.type: 'movie' | 'series' | 'both'`, mentre `Catalog.type` è `'movie' | 'series'`
   (`types/index.ts:65`). Passare un preset a `CatalogItem` **non compila**: serve una mappatura, e il
   caso `'both'` va deciso (oggi `ExplorePanel.tsx:215` lo etichetta "Serie" — difetto preesistente
   che l'unificazione farebbe sparire; `TypeBadge.tsx:5` e `lib/catalogKind.ts:59` gestiscono già
   `'both'` correttamente: la logica esiste, va riusata). F1b è quindi ~1h, non 40 minuti.
2. **L'unificazione dei poster non ripaga in righe:** bilancio dello studio, `PosterCard` nuovo
   (+65) più 5 migrazioni (+159) contro −165 → **−6 righe nette**. Il motivo per farla non è il
   codice: è che **5 siti su 6 non hanno `onError`**, quindi un poster rotto (host morto, 404)
   resta rotto per sempre — esattamente il bug già risolto una volta in `PosterImage.tsx` e mai
   propagato. Si paga in correttezza, non in righe: da valutare come opzionale (F4).

**Cosa NON unificare (verdetto dello studio, condiviso):** catalogo e titolo singolo sono entità
diverse (una query con 20 locandine vs un asset TMDB) e i pannelli DNA sono controlli di sistema.
Un widget unico sarebbe un componente a 20 prop booleane. L'unificazione giusta è a **due livelli
verticali**: la shell della card (solo Esplora ↔ Attivi) e la primitiva poster (solo dove parla di
locandine).

### R9 — Le classi "vetro" non stanno in un layer: decine di utility accanto a esse sono morte 🔍

Questa è la spiegazione **meccanica** del "non hanno un aspetto unico".

In `app/globals.css` `.glass-panel` e `.glass-card` sono scritte **fuori da ogni `@layer`**. Verificato
sul CSS buildato con parsing delle parentesi: lo stack di layer a `.glass-panel{` è `[]`, mentre
`.rounded-2xl` sta dentro `["utilities"]`. In CSS le regole **non** layered battono quelle layered,
a prescindere dalla specificità.

Le classi token dichiarano `background`, `border`, `box-shadow`, `transition`, `backdrop-filter`.
Quindi su ogni elemento che le porta, queste utility sono **silenziosamente ignorate**:

| dove | utility dichiarate | effetto reale |
|---|---|---|
| `ExplorePanel.tsx:134`, `CatalogItem.tsx:110` | `bg-white/60 hover:bg-white/90 border-2 border-marrow-light/10 hover:border-primary/30 shadow-sm` | nulle: dipinge `.glass-card` (+ il suo `:hover`) |
| `DashboardPage.tsx:215` | `glass-panel ... border border-marrow-light/10` | bordo del token |
| `RenameProfileDialog.tsx:35`, `SyncLibraryModal.tsx:40` | `glass-panel border-marrow-light/10` | idem |

Due conseguenze operative:

- **Perché le due card sembrano la stessa cosa:** sono dipinte dalla stessa classe token, mentre le
  differenze scritte a mano nel JSX non arrivano mai al browser. Non è un caso di "design condiviso":
  è styling morto che coincide.
- **Il raggio:** nessuna delle due classi token dichiara `border-radius` (`globals.css:82,92`), quindi
  le card catalogo hanno **spigoli vivi** dentro contenitori `rounded-2xl`/`rounded-3xl`. Il resto
  dell'app usa `rounded-2xl`/`rounded-3xl`/`rounded-[2.5rem]`.

Fix minima, **2-3 righe**: avvolgere le classi token in `@layer components { … }` (così le utility
scritte nei componenti tornano a valere) e dare `border-radius: 1rem` ai due token. Da decidere però
**cosa** deve rendere la card: tenere l'aspetto token e cancellare le utility morte (−10 nomi di
classe in 5 file, zero rischio visivo), oppure riattivare le utility, che cambia l'aspetto di tutte e 9
le superfici `glass-*` in un colpo solo e richiede un giro a video. Decisione aperta in `plan.md`.

---

## 4. Difetti verificati a video

| # | pagina | cosa si vede | come |
|---|---|---|---|
| 1 | `/admin/cache` @360 e @390 | tabella tagliata al bordo destro ("L2 (PERSI…", "Nessuna statistica dispon…"): l'utente non vede le colonne e **non può scrollare** | misura CDP: `td` 481px vs viewport 360 — **decade: la console admin si elimina** (vedi `plan.md` F0b) |
| 2 | `/` @1440 | form di login dilatato: box nota e input larghi ~1120px, interfaccia sproporzionata | screenshot |
| 3 | `/` @360 | rettangolo di errore vuoto sopra "Continua" (errore non condizionale) | screenshot |
| 4 | `/` @360 | dopo la controprova con emulazione corretta: **nessun overflow** — il login "regge", i difetti sono di scala e di touch | misura CDP |

**Decadono con la cancellazione della console admin** (F0b di `plan.md`): tabella cache (§R1),
`h-[600px]` del System Log e overflow della barra azioni (§R6), contrasto del pulsante "Sblocca"
(§R7), `:hover` su "Svuota" (§R2). Restano validi tutti i difetti delle superfici utente.
Il backend `/api/admin/*` resta in piedi: è l'accesso operativo usato dai curl di deploy.

---

## 5. Da verificare a video (richiede backend + account reale)

Superfici non renderizzabili in locale: dashboard, Esplora, Libreria, DNA, CreatorPanel, modali,
admin dietro password. Per queste, prima di dichiarare chiusa la fix:

1. `CreatorPanel` dentro `EditCatalogModal` (95vw × 90dvh) con la **tastiera virtuale** aperta: la
   barra sticky inferiore "Annulla / Anteprima / Salva" resta raggiungibile?
2. Riga di cache con dati reali: il pulsante "Svuota" esiste davvero per l'utente mobile?
3. Carosello TMDB: toccando una locandina si aggiunge il titolo (azione invisibile)? Va deciso il
   comportamento, non solo lo stile.
4. `position: sticky` dell'header sotto `overflow-x-hidden` su Safari iOS (dopo R1 va riverificato).
5. PosterRow con swipe orizzontale: la riga è scorrevole col dito senza scrollbar visibile?

---

## 6. Perizie complete

`slaves/ui-shell.md`, `slaves/ui-dashboard.md`, `slaves/ui-creator.md`, `slaves/ui-library.md` —
contengono il dettaglio riga per riga (48 findings con fix suggerita), incluse le sezioni "Dubbi"
dove gli auditor dichiarano ciò che non hanno potuto confermare.

## 7. Correzioni applicate alle perizie in fase di verifica

Le perizie sono state verificate a campione sui P0, non prese per buone:

| perizia | verdetto |
|---|---|
| `cache/page.tsx:208` "Svuota" nascosto da `group-hover` | **confermato** (riga `<tr>` con `group`) — su touch invisibile e non individuabile |
| `AutocompleteSearch.tsx:111` "+ Aggiungi" invisibile | **confermato ma corretto**: è invisibile *e cliccabile* → il rischio è l'aggiunta involontaria, non l'impossibilità di aggiungere |
| `CreatorPanel.tsx:475-485` pulsante dentro `<button>` | **confermato** (span con role=button dentro l'accordion): reale invalidità HTML, gravità portata da P0 a P1 perché la funzione opera |
| `TraktAuthModal.tsx:149` codice a 259px in 235px | **confermato** per aritmetica (doppio `p-6` verificato): va a capo, non si perde → P1 |
| `CreatorPanel.tsx:726,755` griglie `grid-cols-2` fisse | **confermato** nel codice |
| "login tagliato a 360px" (mio, primo giro) | **respinto**: artefatto del metodo, non un bug |

---

# Esito implementazione

Otto ticket implementati, verificati e committati. La suite di accettazione è un harness CDP che
misura, per ogni superficie e ogni viewport, gli elementi che sfondano il bordo **senza che nessuno
li scrolli o li ritagli** e i bersagli di tocco **effettivi** (pseudo-elementi inclusi).

## Criterio di accettazione — verde su sorgente e su artefatto di produzione

6 superfici × 5 viewport (360/390/768/1024/1440), eseguito due volte: su `next dev` e sui file
statici di `frontend/out` (quello che va in produzione).

| superficie | sforamenti non gestiti | bersagli < 44px |
|---|---|---|
| Cataloghi Attivi | 0 | 0 |
| Esplora | 0 | 0 |
| Creatore | 0 | 0 |
| DNA & AI Lab | 0 | 0 |
| Libreria Utente | 0 | 0 |
| login (non autenticato) | 0 | 0 |

## Numeri reali (dove differiscono dal piano, vince il numero)

| | previsto nel piano | esito reale |
|---|---|---|
| righe | card unica −85 nette, PosterCard −6 nette | card unica **+16** su due file (ExplorePanel −33, CatalogItem +47); PosterCard +101 nuovo e −24 sui siti migrati |
| micro-tipografia | 91 occorrenze | 81 al momento di eseguire lo sweep (le altre erano nelle pagine admin cancellate) → **0** |
| lint | invariato | **84 → 76** |
| file toccati | — | 31 (30 modificati + `PosterCard.tsx` nuovo), +700/−1230 righe circa |
| cause radice | 7 | confermate tutte, più **R9** (token `glass-*` fuori layer) scoperta in verifica |

## Correzioni applicate dopo la revisione a due assi

**Standards** (4 rilievi, 3 accolti):
1. `countCatalogFilters` estratta da `CatalogItem` a `lib/utils.ts` — è lettura del modello dati, non
   presentazione (`docs/FRONTEND.md`);
2. `CatalogItemData` → `CatalogCardData` in `types/index.ts`, **senza** index signature: il tipo locale
   con `[key: string]: any` che avevo introdotto mascherava gli errori;
3. il ramo `'both'` non è più duplicato: passa da `getFrontendCatalogKind().mediaSet`, un solo
   percorso per film/serie/entrambi;
4. `showFallbackTitle` rimossa da `PosterCard` (nessun chiamante la usava).
   **Respinto**: usare `TypeBadge` nel footer della card — è un badge shadcn, avrebbe cambiato
   l'aspetto appena unificato.

**Spec** (3 rilievi, tutti accolti):
1. **Titolo assente in libreria su mobile**: corretto togliendo `showTitleOverlay={false}` — ora il
   titolo usa la stessa overlay standard di tutte le altre superfici (verificato: `opacity: 1` con
   `pointer: coarse` emulato);
2. **`pointer-coarse` su un velo a tutta card**: avrebbe coperto di nero ogni locandina su tablet —
   rimosso; sui telefoni resta il cestino sempre raggiungibile;
3. **regola hover morta in `CatalogItem`**: l'alone puntava a `group/poster` (inesistente su quella
   riga) e non si è mai acceso su desktop, mentre su touch restava acceso per sempre → ora è
   `group-hover/row`.

## Difetti trovati dai revisori e *non* corretti (deferral dichiarati)

- **Tooltip "Solo anime" / "Badge episodi"** (`CreatorPanel.tsx:998,1028`): l'informazione resta
  irraggiungibile al dito. Fissarli aperti oscurerebbe gli switch: serve una scelta di interazione
  (tap-to-reveal), non una classe.
- **Eliminazione su tablet touch** (≥640px): il velo con "Rimuovi" è da mouse, il cestino d'angolo è
  `sm:hidden`. Su un tablet senza mouse quella funzione si raggiunge solo con l'hover simulato dal
  tocco. Era così anche prima di questo lavoro.

## Ingrandimenti nati in verifica, non nel piano

- **Titoli delle card che si troncavano**: portare le frecce di riordino a 44px ha tolto ~52px al
  titolo, che a 360px diventava "Hidden Ge…" — corretto con `line-clamp-2` (due righe) invece di
  ellissi: un bersaglio grande non giustifica un titolo illeggibile.
- **Metodo di misura corretto due volte**: l'emulazione non dichiarava i media feature `pointer`/`hover`
  (quindi `pointer-coarse:` non si attivava mai nelle prime misure) e `captureBeyondViewport` coglieva
  i font in fase di swap mostrando le icone Material come testo. Entrambi erano artefatti del metodo,
  non difetti: corretti prima di riportarli.
