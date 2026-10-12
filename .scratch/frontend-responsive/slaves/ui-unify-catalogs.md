# Studio di Fattibilità: Unificazione UI Cataloghi e Locandine (Esplora vs Cataloghi Attivi)

## Inventario

| Sito | Componente (file:line) | Cosa rappresenta | Card shell markup | Poster element + classi esatte di dimensione | Radius | Azioni presenti |
|---|---|---|---|---|---|---|
| **1. ExplorePanel** | `ExplorePanel.tsx:134-224` | Preset/catalogo da esplorare e aggiungere al profilo | `<div key={preset.id} className="group relative flex flex-col glass-card transition-all p-3 sm:p-5 shadow-sm border-2 border-marrow-light/10 bg-white/60 hover:bg-white/90 hover:border-primary/30">` | Sub-componente `PosterRow`: skeleton `h-[180px] w-[120px] sm:h-[225px] sm:w-[150px]`; img/fallback `h-[180px] w-[120px] sm:h-[225px] sm:w-[150px]` | Shell: 0px (`glass-card` privo di `rounded-*`); emoji: `rounded-xl sm:rounded-2xl`; button: `rounded-xl`; row glow: `rounded-2xl`; poster: `rounded-lg` | **Add** (`Aggiungi`/`Aggiunto`), **Edit** (solo custom: `Modifica`). No reorder, no remove, no duplicate |
| **2. ActiveCatalogsPanel** | `CatalogItem.tsx:95-224` in `ActiveCatalogsPanel.tsx:139-157` | Catalogo attivo ordinabile/modificabile o elemento di "Le Mie Liste" | `<div draggable ... className="group relative flex flex-col glass-card transition-all p-3 sm:p-5 shadow-sm border-2 ${isDragging ? ... : isHiddenBySelectors ? 'border-dashed border-amber-500/40 bg-slate-100/70 opacity-60 ...' : 'border-marrow-light/10 bg-white/60 hover:bg-white/90 hover:border-primary/30 ...'}`>` | Sub-componente `PosterRow`: skeleton `h-[180px] w-[120px] sm:h-[225px] sm:w-[150px]`; img/fallback `h-[180px] w-[120px] sm:h-[225px] sm:w-[150px]` | Shell: 0px (invariata da `glass-card`); emoji: `rounded-xl sm:rounded-2xl`; reorder mobile: `rounded-lg` (`rounded-t-lg`/`rounded-b-lg`); badge: `rounded-lg`; actions: `rounded-xl`; pencil: `rounded-md` | **Reorder** (drag desktop + frecce mobile), **Duplicate** (`Copy`), **Remove** (`Trash2`), **Edit** (click matita sui filtri nel footer se custom). No add |
| **3. UserLibraryPanel** | `UserLibraryPanel.tsx:369-428` | Singolo titolo in libreria utente (film o serie) | `<div draggable={!isSelectionMode} ... className="relative group aspect-[2/3] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${isSelected ? 'ring-4 ring-primary ...' : 'shadow-md'}`>` | `<PosterImage src={resolvePosterSrc(item.poster)} alt={item.name} />`: fluido governed da `aspect-[2/3]` dentro `grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3` | Shell/poster: `rounded-xl`; mobile trash: `rounded-full`; check icon: `rounded-md` | **Reorder** (drag and drop), **Remove** (tap mobile / hover desktop), **Select** (checkbox selezione massiva). No add, no duplicate, no edit |
| **4. CreatorPanel (manuale)** | `CreatorPanel.tsx:644-703` | Elemento film/serie in una lista manuale del builder | `<div key={item.tmdbId} className="relative group w-[100px] sm:w-[120px] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">` | `item.poster ? <img ... className="w-full aspect-[2/3] object-cover" /> : <div className="w-full aspect-[2/3] bg-marrow-light/20 ...">`: larghezza fissa `w-[100px] sm:w-[120px]` con `aspect-[2/3]` (100x150px mobile, 120x180px desktop) | Shell/poster: `rounded-xl`; hover buttons: `rounded-full` | **Reorder** (`ChevronLeft`/`ChevronRight` in overlay hover), **Remove** (`Trash2` in overlay). No add, no duplicate, no edit |
| **5. CreatorPanel (anteprima statica)** | `CreatorPanel.tsx:919-937` | Miniatura anteprima risultati statici generati dall'AI | `<div key={item.id || idx} className="flex flex-col gap-1 items-center text-center">` dentro `grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3` | `item.poster ? <img ... className="w-16 h-24 object-cover rounded shadow-sm" /> : <div className="w-16 h-24 bg-marrow-light/10 border border-marrow-light/10 rounded ...">` (64x96px) | Poster e fallback box: `rounded` (4px) | Nessuna (anteprima read-only) |
| **6. DnaAndAiPanel (hero boxes)** | `DnaAndAiPanel.tsx:314-390` | Box di controllo per algoritmo DNA (True Blend, Seed Network, Hidden Gems, Trakt) | `<div key={catalog.idBase} className="glass-panel rounded-xl overflow-hidden flex flex-col shadow-lg shadow-marrow-light/5">` | Delega a `<CatalogLivePreview>` (vedi sito 8). Non renderizza locandine dirette | Shell: `rounded-xl`; tolerance box: `rounded-lg`; tolerance bar: `rounded-full`; tolerance badge: `rounded` | **Toggle Film** (`Switch`), **Toggle Serie** (`Switch`). No reorder, no remove, no duplicate, no edit |
| **7. AutocompleteSearch (carosello)** | `AutocompleteSearch.tsx:97-126` | Risultato ricerca TMDB per aggiunta a libreria o lista | `<div key={item.id} className="min-w-[100px] w-[100px] flex-shrink-0 flex flex-col gap-1 relative group">` dentro flex orizzontale | `item.poster ? <img ... className="w-full aspect-[2/3] object-cover rounded-md shadow-sm" /> : <div className="w-full aspect-[2/3] bg-marrow-light/10 ... rounded-md">` (100x150px) | Poster, fallback e overlay: `rounded-md` (6px) | **Add** (`Button`: `+ Aggiungi` / `Aggiunto` disabled). No reorder, no remove, no edit |
| **8. CatalogLivePreview** | `CatalogLivePreview.tsx:78-114` | Carosello orizzontale snap con locandine e match score DNA | `<div key={meta.id} className="min-w-[140px] w-[140px] snap-start relative group/poster cursor-pointer">` | Skeleton: `min-w-[150px] w-[150px] aspect-[2/3]`; img/fallback: `h-[210px] w-[140px]` con `object-cover` | Skeleton: `rounded-md`; img, fallback, overlay: `rounded-lg`; match badge: `rounded` | Nessuna mutazione (hover overlay con titolo/anno e badge `% Match`). No add, no remove |
| **[Sub-primitiva] PosterRow** | `PosterRow.tsx:53-88` | Riga locandine generica usata da ExplorePanel, CatalogItem, CreatorPanel query preview | `<div key={item.id} className="group/poster relative shrink-0 cursor-pointer">` dentro flex orizzontale | Skeleton: `h-[180px] w-[120px] sm:h-[225px] sm:w-[150px]`; img/fallback: `h-[180px] w-[120px] sm:h-[225px] sm:w-[150px]` | Skeleton, img, fallback, overlay: `rounded-lg` | Nessuna (anteprima visiva con hover overlay) |

---

## Duplicazione (numeri)

### Confronto Coppia 1: `ExplorePanel.tsx` (card preset) vs `CatalogItem.tsx` (card attiva)

La card di catalogo in `ExplorePanel.tsx` (righe 134-224, 91 righe) e la card in `CatalogItem.tsx` (righe 102-224, 123 righe) sono nate da un identico copia-incolla con divergenze marginali negli slot d'azione.

#### Blocco 1: Shell esterna e intestazione (15 righe identiche)
* `ExplorePanel.tsx:134-145`:
```tsx
<div key={preset.id} className="group relative flex flex-col glass-card transition-all p-3 sm:p-5 shadow-sm border-2 border-marrow-light/10 bg-white/60 hover:bg-white/90 hover:border-primary/30">
  <div className="flex items-start justify-between mb-2 sm:mb-4 relative z-10">
    <div className="flex gap-2 sm:gap-4 items-center min-w-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="size-9 sm:size-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all bg-white shadow-inner text-marrow-deep">
          <span className="text-lg sm:text-2xl">{preset.emoji ?? '📋'}</span>
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="font-black text-marrow-deep text-sm sm:text-lg leading-tight truncate group-hover:text-primary transition-colors">{preset.name}</h3>
```
* `CatalogItem.tsx:102-112, 143-148`:
```tsx
<div draggable ... className={`group relative flex flex-col glass-card transition-all p-3 sm:p-5 shadow-sm border-2 ${... 'border-marrow-light/10 bg-white/60 hover:bg-white/90 hover:border-primary/30 sm:cursor-grab sm:active:cursor-grabbing'}`}>
  <div className="flex items-start justify-between mb-2 sm:mb-4 relative z-10">
    <div className="flex gap-2 sm:gap-4 items-center min-w-0">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* drag grip e controlli mobile */}
        <div className="size-9 sm:size-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all bg-white shadow-inner text-marrow-deep">
          <span className="text-lg sm:text-2xl">{catalog.emoji ?? '📋'}</span>
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="font-black text-marrow-deep text-sm sm:text-lg leading-tight truncate group-hover:text-primary transition-colors">{catalog.name}</h3>
```
*Differenza reale:* `CatalogItem` intercala i pulsanti di riordino mobile/desktop (28 righe) prima della scatola emoji.

#### Blocco 2: Descrizione e Wrapper PosterRow (8 righe byte-identical)
* `ExplorePanel.tsx:202-209`:
```tsx
<p className="text-xs sm:text-sm text-marrow-light/80 font-medium line-clamp-1 mb-2 sm:mb-4 relative z-10 px-1">
  {preset.description || 'Catalogo tematico preconfigurato e costantemente aggiornato.'}
</p>

<div className="-mx-1 sm:-mx-2 mb-2 sm:mb-4 relative z-10 group/row">
   <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/poster:opacity-100 transition-opacity rounded-2xl -z-10" />
   <PosterRow presetId={`yaca_preset_${preset.id}`} type={preset.type} />
</div>
```
* `CatalogItem.tsx:180-187`:
```tsx
<p className="text-xs sm:text-sm text-marrow-light/80 font-medium line-clamp-1 mb-2 sm:mb-4 relative z-10 px-1">
  {catalog.raw_prompt || 'Catalogo basato su filtri e preferenze personalizzate.'}
</p>

<div className="-mx-1 sm:-mx-2 mb-2 sm:mb-4 relative z-10 group/row">
   <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/poster:opacity-100 transition-opacity rounded-2xl -z-10" />
  <PosterRow presetId={catalog.source === 'preset' ? `yaca_preset_${catalog.id}` : undefined} type={catalog.type} filters={catalog.filters} prompt={catalog.raw_prompt} />
</div>
```
*Differenza reale:* solo il fallback della stringa di testo e i parametri passati a `PosterRow`. La struttura DOM e le classi Tailwind sono identiche al carattere.

#### Blocco 3: Footer con indicatore Tipo e Conteggio Filtri (14 righe semantiche identiche)
* `ExplorePanel.tsx:211-222`:
```tsx
<div className="mt-auto pt-2 sm:pt-4 border-t border-marrow-light/10 flex items-center justify-between relative z-10">
  <div className="flex items-center gap-2 sm:gap-3">
     <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-black text-marrow-deep/70">
      <span className="material-symbols-outlined text-xs sm:text-sm">{preset.type === 'movie' ? 'movie' : 'tv'}</span>
      <span className="uppercase tracking-tight">{preset.type === 'movie' ? 'Film' : 'Serie'}</span>
    </div>
    <div className="w-1 h-1 rounded-full bg-marrow-light/20" />
    <div className="text-[10px] sm:text-xs font-bold text-marrow-light/60">
      {Math.max(1, filterCount)} Filtr{Math.max(1, filterCount) !== 1 ? 'i' : 'o'}
    </div>
  </div>
</div>
```
* `CatalogItem.tsx:189-204`:
```tsx
<div className="mt-auto pt-2 sm:pt-4 border-t border-marrow-light/10 flex items-center justify-between relative z-10">
  <div className="flex items-center gap-2 sm:gap-3">
     <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-black text-marrow-deep/70">
      <span className="material-symbols-outlined text-xs sm:text-sm">{catalog.type === 'movie' ? 'movie' : 'tv'}</span>
      <span className="uppercase tracking-tight">{catalog.type === 'movie' ? 'Film' : 'Serie'}</span>
    </div>
    <div className="w-1 h-1 rounded-full bg-marrow-light/20" />
    {!isPreset && onEdit ? (
      <button onClick={...} className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-marrow-light/60 ...">
        <span>{filterCount} Filtr{filterCount !== 1 ? 'i' : 'o'}</span>
        <Pencil className="h-3 w-3 ..." />
      </button>
    ) : (
      <div className="text-[10px] sm:text-xs font-bold text-marrow-light/60 py-1">
        {filterCount} Filtr{filterCount !== 1 ? 'i' : 'o'}
      </div>
    )}
  </div>
</div>
```
*Differenza reale:* in `CatalogItem` il conteggio dei filtri si trasforma in un pulsante con icona `Pencil` se non è un preset ed è presente `onEdit`.

---

### Confronto Coppia 2: `PosterRow.tsx` vs `CatalogLivePreview.tsx` (locandina orizzontale)

Le card singole renderizzate dentro `PosterRow.tsx` (righe 64-82, 19 righe) e `CatalogLivePreview.tsx` (righe 84-102, 19 righe) sono un clone diretto:

* `PosterRow.tsx:64-81`:
```tsx
<div key={item.id} className="group/poster relative shrink-0 cursor-pointer">
  {item.poster ? (
    <img
      src={item.poster}
      alt={item.title}
      className="h-[180px] w-[120px] sm:h-[225px] sm:w-[150px] rounded-lg object-cover transition-all duration-300 group-hover/poster:scale-105 group-hover/poster:shadow-2xl group-hover/poster:shadow-primary/30 shadow-md shadow-marrow-light/20"
    />
  ) : (
    <div className="flex h-[180px] w-[120px] sm:h-[225px] sm:w-[150px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20">
      {item.title.slice(0, 2)}
    </div>
  )}
  <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100">
    <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">{item.title}</p>
    {item.year && <p className="text-[10px] text-accent font-bold mt-0.5">{item.year}</p>}
  </div>
</div>
```
* `CatalogLivePreview.tsx:84-101`:
```tsx
<div key={meta.id} className="min-w-[140px] w-[140px] snap-start relative group/poster cursor-pointer">
  {meta.poster ? (
    <img
      src={meta.poster}
      alt={meta.name || meta.title}
      className="h-[210px] w-[140px] rounded-lg object-cover transition-all duration-300 group-hover/poster:scale-105 group-hover/poster:shadow-2xl group-hover/poster:shadow-primary/30 shadow-md shadow-marrow-light/20"
    />
  ) : (
    <div className="flex h-[210px] w-[140px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20">
      {(meta.name || meta.title || 'Senza titolo').slice(0, 2)}
    </div>
  )}
  <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100 pointer-events-none">
    <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">{meta.name || meta.title}</p>
    {(meta.releaseInfo || meta.year) && <p className="text-[10px] text-accent font-bold mt-0.5">{meta.releaseInfo || meta.year}</p>}
  </div>
```
*Differenza reale:*
1. Dimensioni arbitrarie: `PosterRow` usa `120x180 sm:150x225` (proporzione 2:3 esatta); `CatalogLivePreview` usa `140x210` (proporzione 2:3 esatta).
2. `CatalogLivePreview` aggiunge `pointer-events-none` all'overlay e mostra in cima il badge `{matchPercent}% Match`.

---

### Confronto Coppia 3: Pattern Overlay Azioni su Titolo (`UserLibraryPanel` vs `CreatorPanel` vs `AutocompleteSearch`)

Tutti e tre i componenti montano una card con aspect ratio 2:3 e copiano lo stesso pattern di hover overlay scuro con bottoni d'azione:
* `UserLibraryPanel.tsx:411-424` (14 righe):
  `<div className="hidden sm:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center p-2"><div className="text-center w-full"><p ...>{item.name}</p><Button size="sm" variant="destructive" ...><Trash2 ... /> Rimuovi</Button></div></div>`
* `CreatorPanel.tsx:655-701` (47 righe):
  `<div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">... reorder (Left/Right) ... delete ...</div>`
* `AutocompleteSearch.tsx:111-122` (12 righe):
  `<div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center"><Button size="sm" ...>{isAdded ? 'Aggiunto' : '+ Aggiungi'}</Button></div>`

---

### Totali quantitativi della duplicazione

| Ambito di duplicazione | File coinvolti | Righe duplicate stimate |
|---|---|---|
| Card Catalog Shell (header, emoji, typography, poster slot, footer) | `ExplorePanel.tsx`, `CatalogItem.tsx` | **67 righe** |
| Poster Carousel Tile (img, fallback box iniziale, gradient overlay con titolo/anno) | `PosterRow.tsx`, `CatalogLivePreview.tsx` | **38 righe** |
| Poster Action Hover Overlay (sfondo `bg-black/60`, transizione opacità, bottoni) | `UserLibraryPanel.tsx`, `CreatorPanel.tsx`, `AutocompleteSearch.tsx` | **35 righe** |
| Fallback image broken logic (5 file usano `<img>` nudo senza `onError` vs `PosterImage.tsx`) | `PosterRow.tsx`, `CatalogLivePreview.tsx`, `CreatorPanel.tsx` (2x), `AutocompleteSearch.tsx` | **25 righe** |
| **TOTALE COMPLESSIVO** | **7 file coinvolti** | **~165 righe duplicate** |

---

## Divergenze legittime (Analisi avversaria: contro il God-Component)

Se un ingegnere tentasse di unificare tutti gli 8 siti in un unico super-widget `UniversalCard`, creerebbe un componente mostruoso con oltre 20 prop booleane e di callback (`isCatalog`, `isSingleMedia`, `isDraggable`, `isSelectable`, `isHeroBox`, `canMoveUp`, `canMoveDown`, `onToggle`, `onAdd`, `onDuplicate`, `onRemove`, `onEdit`, `matchScore`, `toleranceMeter`, `isConformant`, ecc.).

Le seguenti divergenze strutturali ed ergonomiche rendono categoricamente errata l'unificazione orizzontale a livello di widget intero:

### 1. Ruolo concettuale e ciclo di vita antitetici
* **Catalogo (Explore / ActiveCatalogs):** È una **collezione/query dinamica** di metadati. Contiene un avatar emoji, un nome catalogo, badge di categoria o provenienza, un conteggio di filtri algoritmici e al suo interno racchiude un'intera striscia orizzontale di 20 film (`PosterRow`).
* **Titolo Singolo (UserLibrary / Creator / Autocomplete):** È un **singolo asset multimediale** (TMDB Movie o Series con ID e poster specifico). Non ha filtri, non ha emoji, non ha query.
* **Dna Hero Box (DnaAndAiPanel):** È un **pannello di controllo algoritmico** di sistema. Non è una lista creabile o riordinabile: possiede doppi interruttori hardware-like (`Switch` Film e `Switch` Serie), un indicatore di severità alien ratio e non può essere cancellato né duplicato.

### 2. Pressione di layout a 360px (Mobile)
* In `ActiveCatalogsPanel`, ogni riga ospita a sinistra i tasti fisici di riordino verticale (`ChevronUp` e `ChevronDown`, larghi 32px), l'emoji (36px), il titolo e a destra due icone di azione (`min-w-[40px]`). Su una larghezza viewport di 360px (con padding laterali di 12px), lo spazio per il titolo e i badge è di appena 130px.
* In `ExplorePanel`, non esiste riordino, ma l'azione a destra è un pulsante a pillola largo fino a 95px ("Non compatibile" o "Aggiunto"). Il bilanciamento ottico e i punti di rottura dei testi sono completamente differenti.
* In `UserLibraryPanel`, gli elementi vivono in una griglia fluida a 3 colonne (`aspect-[2/3]`, circa 105px di larghezza per card). Tentare di inserire la semantica di una card catalogo qui dentro distruggerebbe la griglia.

### 3. Divergenza di interazione Touch vs Hover
* `PosterRow` e `CatalogLivePreview` nascondono i titoli dentro un overlay `opacity-0 group-hover:opacity-100`. Su smartphone touch questo pattern fallisce (l'utente non vede il titolo a meno di toccare la card).
* Al contrario, `UserLibraryPanel` gestisce la modalità touch mostrando un pulsante cestino fisso in alto a destra su mobile (`sm:hidden absolute top-1.5 right-1.5 size-7 rounded-full bg-black/70`), mentre su desktop passa all'hover centrato.

### Quale sub-part ha DAVVERO senso condividere?
L'unificazione deve avvenire su **due livelli separati e verticali**:
1. **Livello Primitiva Media (`PosterCard` / `MediaPoster`):** La singola locandina con aspect ratio 2:3, fallback robusto contro URL TMDB 404/broken (ereditando la logica eccellente di `PosterImage.tsx`), classi di dimensione standardizzate e slot per overlay/badge.
2. **Livello Shell Catalogo (`CatalogCardShell`):** Una struttura di layout ad alto livello condivisa **esclusivamente** tra `ExplorePanel` e `CatalogItem`, che incapsula la cornice `.glass-card`, l'allineamento dell'emoji, il blocco tipografico di titolo/descrizione, lo slot per `PosterRow` e il footer con conteggio filtri.

---

## Proposta

Proponiamo l'introduzione di una primitiva condivisa per le locandine: `PosterCard`. Risolve la frammentazione dei formati grafici, elimina le duplicazioni dei fallback e standardizza gli overlay su tutti i caroselli e griglie.

### 1. Interfaccia TypeScript di `PosterCard`

```tsx
// frontend/src/components/shared/PosterCard.tsx
import React from 'react';
import { PosterImage } from '@/components/shared/PosterImage';
import { cn } from '@/lib/utils';

export type PosterCardSize = 'sm' | 'md' | 'fluid';

export interface PosterCardProps {
  poster?: string | null;
  title: string;
  year?: string | number | null;
  size?: PosterCardSize;
  className?: string;
  badge?: React.ReactNode;
  overlay?: React.ReactNode;
  showTitleOverlay?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
}

const SIZE_VARIANTS: Record<PosterCardSize, string> = {
  // sm: compatto per pickers e autocompletamento (AutocompleteSearch, Creator manual)
  sm: 'w-[100px] h-[150px] shrink-0',
  // md: standard responsive per caroselli (PosterRow, CatalogLivePreview, Creator query preview)
  md: 'w-[120px] h-[180px] sm:w-[150px] sm:h-[225px] shrink-0',
  // fluid: per griglie responsive (UserLibraryPanel)
  fluid: 'w-full aspect-[2/3]',
};

export function PosterCard({
  poster,
  title,
  year,
  size = 'md',
  className,
  badge,
  overlay,
  showTitleOverlay = true,
  onClick,
  draggable = false,
  onDragStart,
}: PosterCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'group/poster relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-md shadow-marrow-light/10 select-none',
        SIZE_VARIANTS[size],
        className
      )}
    >
      <PosterImage
        src={poster}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-300 group-hover/poster:scale-105"
      />

      {/* Badge opzionale in alto a sinistra (es. % Match DNA o indicatori di stato) */}
      {badge && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none">
          {badge}
        </div>
      )}

      {/* Overlay con titolo/anno standard per preview e caroselli */}
      {showTitleOverlay && (
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100 pointer-events-none">
          <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">
            {title}
          </p>
          {year && (
            <p className="text-[10px] text-accent font-bold mt-0.5">{year}</p>
          )}
        </div>
      )}

      {/* Overlay interattivo personalizzato (es. pulsanti cestino, reorder o checkbox) */}
      {overlay}
    </div>
  );
}
```

---

### 2. Standardizzazione delle dimensioni locandina (Cosa sopravvive, cosa muore)

| Dimensione attuale | Dove si trova | Verdetto | Motivazione |
|---|---|---|---|
| `w-[140px] h-[210px]` | `CatalogLivePreview.tsx:84,90` | **MUORE** | Numero magico arbitrario. Lo skeleton è già dimensionato a 150px provocando CLS visibile. Viene unificato nella taglia standard `md` (`120px` su mobile, `150px` da `sm:` in su). |
| `w-16 h-24` (64x96px) | `CreatorPanel.tsx:927` (static items) | **MUORE** | Troppo piccolo per mostrare dettagli leggibili su schermi moderni; adotta la taglia `sm` (`100x150px`) in griglia orizzontale scrollabile coerente con TMDB. |
| `w-[100px] h-[150px]` | `AutocompleteSearch.tsx`, `CreatorPanel.tsx` (manual) | **SOPRAVVIVE** | Diventa la variante standard `size="sm"`. Ideale per picker orizzontali ad alta densità e form builder su schermi da 360px. |
| `120x180` / `150x225` | `PosterRow.tsx:57,70` | **SOPRAVVIVE** | Diventa la variante standard `size="md"`. È la scala Netflix/Stremio ottimale: 120px mostra 2.5 elementi su viewport 360px, 150px garantisce leggibilità su desktop 1440px. |
| Fluido `aspect-[2/3]` | `UserLibraryPanel.tsx:386` | **SOPRAVVIVE** | Diventa la variante `size="fluid"`. Indispensabile per griglie CSS multi-colonna (3..8 colonne). |

---

### 3. Before / After Call su 3 siti reali

#### Sito A: `PosterRow.tsx` (righe 63-82)
* **Prima:**
```tsx
{items.map((item) => (
  <div key={item.id} className="group/poster relative shrink-0 cursor-pointer">
    {item.poster ? (
      <img
        src={item.poster}
        alt={item.title}
        className="h-[180px] w-[120px] sm:h-[225px] sm:w-[150px] rounded-lg object-cover transition-all duration-300 group-hover/poster:scale-105 group-hover/poster:shadow-2xl group-hover/poster:shadow-primary/30 shadow-md shadow-marrow-light/20"
      />
    ) : (
      <div className="flex h-[180px] w-[120px] sm:h-[225px] sm:w-[150px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20">
        {item.title.slice(0, 2)}
      </div>
    )}
    <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100">
      <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">{item.title}</p>
      {item.year && <p className="text-[10px] text-accent font-bold mt-0.5">{item.year}</p>}
    </div>
  </div>
))}
```
* **Dopo:**
```tsx
{items.map((item) => (
  <PosterCard
    key={item.id}
    poster={item.poster}
    title={item.title}
    year={item.year}
    size="md"
  />
))}
```

#### Sito B: `CatalogLivePreview.tsx` (righe 79-113)
* **Prima:**
```tsx
{items.map((meta) => {
  const matchPercent = meta._yacaMatch; 
  return (
    <div key={meta.id} className="min-w-[140px] w-[140px] snap-start relative group/poster cursor-pointer">
      {meta.poster ? (
        <img
          src={meta.poster}
          alt={meta.name || meta.title}
          className="h-[210px] w-[140px] rounded-lg object-cover transition-all duration-300 group-hover/poster:scale-105 group-hover/poster:shadow-2xl group-hover/poster:shadow-primary/30 shadow-md shadow-marrow-light/20"
        />
      ) : (
        <div className="flex h-[210px] w-[140px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20">
          {(meta.name || meta.title || 'Senza titolo').slice(0, 2)}
        </div>
      )}
      <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100 pointer-events-none">
        <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">{meta.name || meta.title}</p>
        {(meta.releaseInfo || meta.year) && <p className="text-[10px] text-accent font-bold mt-0.5">{meta.releaseInfo || meta.year}</p>}
      </div>
      {matchPercent !== undefined && matchPercent !== null && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none">
          <div className="bg-primary/90 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
            {matchPercent}% Match
          </div>
        </div>
      )}
    </div>
  );
})}
```
* **Dopo:**
```tsx
{items.map((meta) => (
  <PosterCard
    key={meta.id}
    poster={meta.poster}
    title={meta.name || meta.title || 'Senza titolo'}
    year={meta.releaseInfo || meta.year}
    size="md"
    className="snap-start"
    badge={
      meta._yacaMatch !== undefined && meta._yacaMatch !== null ? (
        <div className="bg-primary/90 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
          {meta._yacaMatch}% Match
        </div>
      ) : null
    }
  />
))}
```

#### Sito C: `AutocompleteSearch.tsx` (righe 100-124)
* **Prima:**
```tsx
<div key={item.id} className="min-w-[100px] w-[100px] flex-shrink-0 flex flex-col gap-1 relative group">
  {item.poster ? (
    <img src={item.poster} alt={item.name} className="w-full aspect-[2/3] object-cover rounded-md shadow-sm" />
  ) : (
    <div className="w-full aspect-[2/3] bg-marrow-light/10 flex items-center justify-center text-center p-2 rounded-md">
      <span className="text-[10px] font-bold text-marrow-deep/50">{item.name}</span>
    </div>
  )}
  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
    <Button
      size="sm"
      variant={isAdded ? "secondary" : "default"}
      className="h-9 px-2 text-xs font-bold touch-manipulation"
      onClick={() => !isAdded && handleSelect(item)}
      disabled={isAdded}
    >
      {isAdded ? 'Aggiunto' : '+ Aggiungi'}
    </Button>
  </div>
</div>
```
* **Dopo:**
```tsx
<PosterCard
  key={item.id}
  poster={item.poster}
  title={item.name}
  size="sm"
  showTitleOverlay={false}
  overlay={
    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/poster:opacity-100 transition-opacity flex items-center justify-center p-2">
      <Button
        size="sm"
        variant={isAdded ? "secondary" : "default"}
        className="h-9 px-2 text-xs font-bold touch-manipulation"
        onClick={() => !isAdded && handleSelect(item)}
        disabled={isAdded}
      >
        {isAdded ? 'Aggiunto' : '+ Aggiungi'}
      </Button>
    </div>
  }
/>
```

---

### 4. Bilancio delle righe di codice (Delta netto)

| File | Righe eliminate | Righe aggiunte | Delta netto |
|---|---|---|---|
| `PosterCard.tsx` (nuovo file) | 0 | +65 | +65 |
| `PosterRow.tsx` | -22 | +8 | -14 |
| `CatalogLivePreview.tsx` | -35 | +16 | -19 |
| `AutocompleteSearch.tsx` | -25 | +18 | -7 |
| `CreatorPanel.tsx` (manuale + statico) | -45 | +24 | -21 |
| `UserLibraryPanel.tsx` | -38 | +28 | -10 |
| **Totale su tutta l'applicazione** | **-165 righe** | **+159 righe** | **-6 righe nette di pura deduplicazione (e 5 implementazioni di fallback TMDB difettose rimosse)** |

Se oltre a `PosterCard` si adotta una shell di layout per le card di catalogo (`CatalogCardShell`) per unificare la visuale di `ExplorePanel` e `CatalogItem`:
* `ExplorePanel.tsx`: elimina 65 righe di boilerplate JSX.
* `CatalogItem.tsx`: elimina 65 righe di boilerplate JSX.
* `CatalogCardShell.tsx`: +80 righe.
* **Risparmio netto aggiuntivo:** **-50 righe di codice**, con coerenza visiva 100% garantita.

---

## Rischi e verifica a video

L'adozione della primitiva e l'eventuale allineamento visivo comportano i seguenti rischi responsivi specifici:

### Cosa si rischia a 360px (Smartphone piccolo)
1. **Passaggio di `CatalogLivePreview` da 140px a 120px/150px:**
   * A 360px, una card da 140px occupava il 39% dello schermo (permetteva di vedere 2 card piene e il bordo della terza).
   * Con `size="md"` (`120px` su mobile), a 360px si vedono 2 card e mezzo esatte: il peek visivo migliora. Tuttavia, se lo snap scroll non è configurato con `scroll-pl-3`, la prima card rischia di toccare il margine del pannello senza respiro.
2. **Allineamento padding e margini tra Esplora e Cataloghi Attivi:**
   * In `ExplorePanel` le card hanno un gap verticale di `gap-4 sm:gap-8`. In `ActiveCatalogsPanel` hanno `gap-3 sm:gap-4`. Se si unifica il gap a `gap-4`, la vista Esplora diventa più compatta e coerente, ma se si portasse a `gap-8`, la lista dei cataloghi attivi su mobile richiederebbe troppo scorrimento verticale.
3. **Pulsanti di riordino mobile in `CatalogItem`:**
   * I tasti `ChevronUp`/`ChevronDown` misurano `w-8 h-7` (28px di altezza). È un touch target sub-standard. Se si allinea l'intestazione della card senza riservare almeno 40px, il titolo del catalogo a 360px viene troncato dopo appena 8-10 caratteri.

### Cosa si rischia a 768px (Tablet portrait)
1. **Griglia UserLibraryPanel:**
   * La griglia passa da 3 colonne (mobile) a 4 colonne (`sm:grid-cols-4`) e poi 5 (`md:grid-cols-5`). Con `PosterCard size="fluid"`, a 768px ogni colonna è larga circa 140px, perfettamente allineata al formato poster standard. Nessun rischio di rottura.
2. **Badges nell'header del catalogo:**
   * Se un catalogo ha 3 badge ("Preset", "Solo Anime", "Incompatibile"), su tablet 768px con split view i badge forzano il wrap su 2 righe, spingendo la descrizione verso il basso.

### Cosa si rischia a 1440px (Desktop wide)
1. **Salto di scala da 120px a 150px in `PosterCard size="md"`:**
   * Il breakpoint `sm:` (640px) porta la larghezza a 150px e l'altezza a 225px. In schermi desktop ampi, 150px è il formato raccomandato da TMDB per locandine nitide senza sgranatura su schermi Retina.
2. **Allineamento dello skeleton:**
   * Attualmente lo skeleton in `CatalogLivePreview.tsx:63` ha `min-w-[150px] w-[150px]` mentre le locandine reali caricavano a 140px: questo causava un vistoso scatto di layout (CLS) orizzontale. L'unificazione a 150px su desktop elimina definitivamente il bug CLS DASH-12.

### Cosa richiede verifica a video (non risolvibile con lettura statica)
1. **Touch tap vs Hover per i titoli nei caroselli orizzontali:** Su iOS Safari e Chrome Android, verificare se il tocco su una locandina apre l'eventuale modale/azione o se il primo tocco attiva solo l'hover `:hover` del titolo (lasciando l'utente confuso).
2. **Comportamento dell'overflow testo nei fallback:** Nei titoli TMDB molto lunghi (oltre 40 caratteri) quando la locandina fallisce (404), verificare a video che il testo centrato nel placeholder `PosterImage` non debordi verticalmente oltre il rapporto 2:3.
3. **Resa estetica di `rounded-xl` sulla card contenitore:** Verificare a video se assegnare `rounded-2xl` alla classe `.glass-card` (che attualmente non ha alcun border-radius esplicito, risultando a spigoli vivi di 0px) armonizza l'aspetto delle card di Esplora e dei Cataloghi Attivi con il resto della Dashboard (`rounded-2xl` e `rounded-3xl`).

---

## Verdetto

**Unificare sì, ma a due livelli architetturali distinti, senza alcun "god-component" unico.**
È categoricamente da respingere la fusione in un singolo widget monolitico tra la vista catalogo e le griglie di titoli multimediali (la libreria utente o i risultati di ricerca), poiché rappresentano entità dati ed ergonomie d'uso incompatibili. La risposta corretta alla richiesta dell'utente consiste in:
1. **Unificare l'aspetto esteriore di Esplora e Cataloghi Attivi:** condividere una `CatalogCardShell` (o allineare token grafici: `rounded-2xl`, gap verticale `gap-4 sm:gap-6`, e la stessa badge bar basata su `@/components/ui/badge`), lasciando invariate le rispettive azioni differenziate (Pill button "Aggiungi" per Esplora; drag-handle, duplicazione e cestino per i Cataloghi Attivi).
2. **Estrarre la primitiva atomica `PosterCard`:** standardizzare le locandine su 3 taglie (`sm` 100x150, `md` 120/150 responsive, `fluid` per griglie), cancellando il formato orfano da 140px e portando in tutta l'applicazione la robustezza di gestione fallback con `onError` già testata in `PosterImage`.
