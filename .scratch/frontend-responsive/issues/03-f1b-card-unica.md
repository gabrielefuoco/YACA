Status: resolved
Type: task
Blocked by: 01

# 03 — F1b: una sola card "catalogo" (+ raggio e utility morte)

## Perché
"Esplora" (`dashboard/ExplorePanel.tsx:134-227`) e "Cataloghi attivi" (`shared/CatalogItem.tsx`) mostrano
**la stessa card scritta due volte**: 14 dei 32 blocchi `className` significativi di `CatalogItem` sono
byte-identici in `ExplorePanel` (44%), e sono lo scheletro completo in sequenza (guscio → header → box
emoji → titolo → badge → descrizione → blocco poster → footer). `grep "size-9 sm:size-12"` → 2 sole
occorrenze in tutto il repo: la duplicazione è chiusa, unificarle **elimina una copia**, non crea un
componente a varianti. (`report.md` §R8)

## Cosa fare
0. **Tipi, prima di tutto** (~30 min, è il vincolo vero): `Preset.type` include `'both'`
   (`types/index.ts:93`) mentre `Catalog.type` no (`:65`) → passare un preset a `CatalogItem` **non
   compila**. Mappare il tipo e gestire `'both'` riusando la logica già esistente
   (`shared/TypeBadge.tsx:5`, `lib/catalogKind.ts:59`) invece di riscriverla. Nota: oggi
   `ExplorePanel.tsx:215` etichetta i `'both'` come "Serie" — difetto preesistente da correggere qui.
1. `components/shared/CatalogItem.tsx` — aggiungere slot opzionali (~10 righe): `actions?: ReactNode`
   (zona in alto a destra, oggi riordino/duplica/rimuovi), `badges?: ReactNode` (badge extra accanto a
   quello di sorgente), `description?: string` (Esplora ha `preset.description`, la card legge
   `raw_prompt`). Gli handler restano tutti opzionali: la card senza handler è già valida.
2. `components/dashboard/ExplorePanel.tsx` — sostituire la card inline (~134-227) con `<CatalogItem …/>`
   + `actions={<Aggiungi/Modifica>}` + `badges={<categoria>}`: **~95 righe cancellate**.
3. **Utility morte** (decisione D5, presa): `.glass-panel` e `.glass-card` in `app/globals.css:82,92`
   sono scritte **fuori da ogni `@layer`**, quindi battono le utility layered. Su queste card
   `bg-white/60`, `border-2 border-marrow-light/10`, `hover:bg-white/90`, `hover:border-primary/30`,
   `shadow-sm` **non hanno mai avuto effetto**: vanno **cancellate** (nessun cambio visivo, meno rumore).
   **Non** mettere i token in `@layer components` in questo giro: cambierebbe l'aspetto di tutte e 9 le
   superfici `glass-*`.
4. **Raggio**: nè `.glass-panel` nè `.glass-card` dichiarano `border-radius`, quindi le card hanno
   spigoli vivi dentro contenitori `rounded-2xl`/`rounded-3xl`. Aggiungere `border-radius: 1rem` a
   entrambi i token (2 righe).
5. **Non** toccare `shared/PosterRow.tsx`: è già condiviso da Esplora, lista cataloghi e Creator. Le
   divergenze lì sono di dimensione e si risolvono nel ticket 06.

## Done quando
- `grep -rn glass-card frontend/src` → un solo file; `grep "size-9 sm:size-12"` → una sola occorrenza;
- un catalogo mostrato in Esplora e negli attivi ha stesso guscio, titolo, badge, blocco poster e footer;
  differenze ammesse: **solo** i pulsanti e il drag & drop;
- angoli delle card coerenti col resto della dashboard;
- `npm run build` passa.

## Nota di sequenza
Va fatto **prima** dei ticket 04 (touch) e 07 (tipografia): entrambi toccano proprio le righe di
`CatalogItem`, e senza questo passaggio le stesse correzioni andrebbero applicate due volte.
