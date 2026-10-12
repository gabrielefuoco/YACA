# Revisione Standard & Code Smells (Frontend)

**Contesto**: L'unica fonte documentata nel repo è `docs/FRONTEND.md` (l'assenza di `CODING_STANDARDS.md` o `CONTRIBUTING.md` limita le violazioni formali alle sole regole architetturali ivi descritte).

---

### 1. Violazioni di Standard Documentati (Hard Violations)

- **`components/shared/CatalogItem.tsx`** vs `docs/FRONTEND.md` (Struttura `frontend/src/` → `lib/utils.ts`):
  La funzione `getFilterCount` (righe 63–106) implementa logica complessa di parsing, fallback e conteggio dei filtri DB (`queries`, alias TMDB, soglie). Secondo `FRONTEND.md`, la manipolazione dei formati dati e il mapping tra modelli DB e stato UI competono a `lib/utils.ts`, non a un componente grafico riutilizzabile in `components/shared/`.

---

### 2. Smell Baseline (Judgement Calls - Fowler)

- **Possibile Primitive Obsession / Loose Typing** — `components/shared/CatalogItem.tsx`:
  > ```ts
  > export type CatalogItemData = {
  >   ...
  >   queries?: any[];
  >   [key: string]: any;
  > };
  > ```
  Per supportare sia `Catalog` che `Preset`, introduce un tipo locale con index signature libera (`[key: string]: any`) e `queries?: any[]`. Bypassa i tipi di dominio in `types/index.ts` compromettendo la type safety, invece di definire un'unione discriminata (`Catalog | Preset`).

- **Possibile Feature Envy** — `components/shared/CatalogItem.tsx`:
  > ```ts
  > const getFilterCount = (cat: CatalogItemData) => {
  >   const queryBlocks = cat.queries || ...
  >   for (const key of filterKeys) { ... }
  > ```
  Il componente esamina decine di chiavi interne e valori di default di TMDB, invidiando i dati del modello catalogo. La logica andrebbe collocata sul modello o in `utils.ts`.

- **Possibile Duplicated Code** — `components/shared/CatalogItem.tsx`:
  > `{/* Supporto per preset di tipo 'both' ... ricalca la logica di TypeBadge.tsx */}`
  > ```tsx
  > {catalog.type === 'both' ? ( ... ) : ( ... )}
  > ```
  Duplica manualmente rendering e logica dei badge Film/Serie ignorando il componente esistente `components/shared/TypeBadge.tsx`.

- **Possibile Speculative Generality** — `components/shared/PosterCard.tsx`:
  > ```ts
  > showFallbackTitle?: boolean;
  > ```
  Proprietà definita e inoltrata a `PosterImage` con default `true`, ma mai utilizzata o sovrascritta da alcun chiamante nella codebase.

---

### 3. Aree Pulite e Meriti

- **`components/shared/PosterCard.tsx`**: Ottima estrazione conforme a `FRONTEND.md` (`components/shared/`). Elimina duplicazione prima dispersa in 5 file (`PosterRow`, `CatalogLivePreview`, `AutocompleteSearch`, `UserLibraryPanel`, `CreatorPanel`).
- **Refactoring Responsive & Touch**: L'adozione di Tailwind v4, touch target (44px) sui componenti UI (`select`, `slider`, `switch`) e layout responsive dei pannelli è pulita e coerente.
