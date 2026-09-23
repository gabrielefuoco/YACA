'use client';
import { useState } from 'react';
import { Profile, Catalog, Preset } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { MergeModal } from '@/components/modals/MergeModal';
import { Layers, Wand2 } from 'lucide-react';
import { isCatalogConformant, getIncompatibilityReason } from '@/lib/catalogKind';

interface ActiveCatalogsPanelProps {
  profile: Profile;
  onReorder: (catalogs: Catalog[]) => void;
  onRemove: (catalogId: string) => void;
  onMerge: (catalog: Catalog) => void;
  presets: Preset[];
  myLists: Catalog[];
  onRemoveMyList: (id: string) => void;
  onEdit: (catalog: Catalog) => void;
  onDuplicate: (catalog: Catalog) => void;
  onOpenMatchmaker?: () => void;
}

export function ActiveCatalogsPanel({
  profile,
  onReorder,
  onRemove,
  onMerge,
  presets,
  myLists,
  onRemoveMyList,
  onEdit,
  onDuplicate,
  onOpenMatchmaker,
}: ActiveCatalogsPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [mergeSource, setMergeSource] = useState<Catalog | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Catalog | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const presetMap = new Map(presets.map((preset) => [preset.id, preset]));
  const presetCatalogs: Catalog[] = profile.raw_ui_state.selectedPresets
    .map((presetId) => presetMap.get(presetId))
    .filter((preset): preset is Preset => Boolean(preset))
    .map((preset) => {
      let filters = preset.filters;
      const queries = preset.queries;
      if (!filters && queries) {
        if (queries.length > 1) {
          filters = { queries, presentation_strategy: preset.presentation_strategy || 'popularity' };
        } else if (queries.length === 1) {
          filters = queries[0];
        }
      }
      return {
        id: preset.id,
        name: preset.name,
        type: preset.type === 'series' ? 'series' : 'movie',
        source: 'preset',
        filters,
        queries,
        emoji: preset.emoji,
        presentation_strategy: preset.presentation_strategy,
      };
    });
  const allCatalogs = [...profile.existingCatalogs, ...presetCatalogs];
  const orderMap = new Map((profile.raw_ui_state.catalogOrder ?? []).map((id, i) => [id, i]));
  const catalogs = [...allCatalogs].sort((a, b) => {
    const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });

  const hiddenCatalogsCount = catalogs.filter(
    (c) => !isCatalogConformant(c, profile.settings?.typeSelectors)
  ).length;

  const handleDragStart = (index: number) => {
    if (isSelectionMode) return;
    setDragIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...catalogs];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered);
    setDragIndex(null);
  };

  const handleMoveCatalog = (fromIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (targetIndex < 0 || targetIndex >= catalogs.length) return;
    const reordered = [...catalogs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered);
  };

  const startMerging = (catalog: Catalog) => {
    setMergeSource(catalog);
    setIsSelectionMode(true);
  };

  const selectMergeTarget = (catalog: Catalog) => {
    if (!mergeSource || mergeSource.id === catalog.id) return;
    setMergeTarget(catalog);
    setShowMergeModal(true);
    setIsSelectionMode(false);
  };

  const cancelMerge = () => {
    setIsSelectionMode(false);
    setMergeSource(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-base sm:text-xl font-black text-marrow-deep tracking-tight">
            I tuoi Cataloghi <span className="text-primary/40 ml-1">({catalogs.length})</span>
          </h3>
          <p className="text-[9px] sm:text-xs text-marrow-light/60 font-bold uppercase tracking-widest mt-0.5 sm:mt-1">Gestisci e ordina la tua esperienza</p>
        </div>
        
        {!isSelectionMode && catalogs.length > 1 && (
           <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/40 rounded-xl sm:rounded-2xl border border-marrow-light/10 shadow-sm">
             <span className="material-symbols-outlined text-primary text-xs sm:text-sm">info</span>
             <p className="text-[9px] sm:text-[10px] text-marrow-light font-black uppercase tracking-wider">
               <span className="sm:hidden">Frecce per riordinare</span>
               <span className="hidden sm:inline">Trascina per riordinare</span>
             </p>
           </div>
        )}
      </div>


      {/* Merge Selection Bar */}
      {isSelectionMode && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-primary border-2 border-primary shadow-xl shadow-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="size-9 sm:size-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Wand2 className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-[10px] sm:text-xs font-black text-white uppercase tracking-[0.2em] leading-none mb-1">Fase 2: Unione Intelligente</p>
              <p className="text-xs sm:text-sm font-bold text-white/90 truncate">Scegli il secondo catalogo da fondere con <span className="text-white underline decoration-white/30">{mergeSource?.name}</span></p>
            </div>
          </div>
          <button 
            onClick={cancelMerge}
            className="w-full sm:w-auto px-4 py-2 sm:py-2 bg-white text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-marrow-deep hover:text-white transition-all shadow-lg shrink-0 min-h-[38px] touch-manipulation flex items-center justify-center"
          >
            Annulla
          </button>
        </div>
      )}

      {hiddenCatalogsCount > 0 && (
        <div className="p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3 text-amber-900 shadow-sm animate-in fade-in duration-200">
          <span className="material-symbols-outlined text-amber-600 text-lg sm:text-xl shrink-0">visibility_off</span>
          <div className="flex flex-col">
            <p className="text-xs sm:text-sm font-bold">
              {hiddenCatalogsCount} {hiddenCatalogsCount === 1 ? 'catalogo attivo è nascosto' : 'cataloghi attivi sono nascosti'} nel manifest di Stremio
            </p>
            <p className="text-[10px] sm:text-xs text-amber-800/80 font-medium">
              A causa dei selettori di tipo impostati sul profilo. I cataloghi restano salvati nel profilo e rimangono riordinabili e rimovibili.
            </p>
          </div>
        </div>
      )}

      {catalogs.length === 0 ? (
        <div className="rounded-[2.5rem] border-2 border-dashed border-marrow-light/20 p-8 sm:p-16 text-center bg-white/40 shadow-inner">
          <div className="size-20 bg-marrow-light/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Layers className="h-10 w-10 text-marrow-light/20" />
          </div>
          <p className="text-xl font-black text-marrow-deep">Nessun catalogo attivo</p>
          <p className="text-sm text-marrow-light/70 font-medium mt-3 max-w-xs mx-auto">Aggiungi cataloghi dalla sezione Esplora o creane uno nuovo per iniziare.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4 w-full">
          {catalogs.map((catalog, index) => {
            const isHidden = !isCatalogConformant(catalog, profile.settings?.typeSelectors);
            const hiddenReason = isHidden ? (getIncompatibilityReason(catalog, profile.settings?.typeSelectors) ?? undefined) : undefined;
            return (
              <CatalogItem
                key={catalog.id}
                catalog={catalog}
                isHiddenBySelectors={isHidden}
                hiddenReason={hiddenReason}
                isDragging={dragIndex === index}
                isMerging={mergeSource?.id === catalog.id}
                mergeSelectionInProgress={isSelectionMode}
                canBeMergeTarget={!mergeSource || mergeSource.type === catalog.type}
                onRemove={() => !isSelectionMode && onRemove(catalog.id)}
                onEdit={() => !isSelectionMode && onEdit(catalog)}
                onDuplicate={() => !isSelectionMode && onDuplicate(catalog)}
                onMoveUp={() => !isSelectionMode && handleMoveCatalog(index, 'up')}
                onMoveDown={() => !isSelectionMode && handleMoveCatalog(index, 'down')}
                canMoveUp={!isSelectionMode && index > 0}
                canMoveDown={!isSelectionMode && index < catalogs.length - 1}
                onMergeStart={() => startMerging(catalog)}
                onMergeSelect={() => selectMergeTarget(catalog)}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => setDragIndex(null)}
              />
            );
          })}
        </div>
      )}

      {/* My Lists Section (Refined) */}
      {myLists.length > 0 && (
        <div className="pt-10 border-t-2 border-marrow-light/10 mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 bg-primary rounded-full" />
            <h3 className="text-xl font-black text-marrow-deep tracking-tight">
              Le Mie Liste <span className="text-primary/40 ml-1">({myLists.length})</span>
            </h3>
          </div>
          
          <div className="flex flex-col gap-4 w-full">
            {myLists.map((catalog) => (
              <CatalogItem
                key={catalog.id}
                catalog={catalog}
                onRemove={() => !isSelectionMode && onRemoveMyList(catalog.id)}
                isMerging={mergeSource?.id === catalog.id}
                mergeSelectionInProgress={isSelectionMode}
                canBeMergeTarget={!mergeSource || mergeSource.type === catalog.type}
                onMergeStart={() => startMerging(catalog)}
                onMergeSelect={() => selectMergeTarget(catalog)}
              />
            ))}
          </div>
        </div>
      )}

      <MergeModal
        open={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        catalogA={mergeSource}
        catalogB={mergeTarget}
        onConfirm={onMerge}
      />
    </div>
  );
}
