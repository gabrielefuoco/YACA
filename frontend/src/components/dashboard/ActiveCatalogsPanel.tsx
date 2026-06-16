'use client';
import { useState } from 'react';
import { Profile, Catalog, Preset } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { MergeModal } from '@/components/modals/MergeModal';
import { Layers, Wand2 } from 'lucide-react';

interface ActiveCatalogsPanelProps {
  profile: Profile;
  onReorder: (catalogs: Catalog[]) => void;
  onRemove: (catalogId: string) => void;
  onMerge: (catalog: Catalog) => void;
  presets: Preset[];
  myLists: Catalog[];
  onRemoveMyList: (id: string) => void;
}

export function ActiveCatalogsPanel({
  profile,
  onReorder,
  onRemove,
  onMerge,
  presets,
  myLists,
  onRemoveMyList,
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
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      type: preset.type === 'series' ? 'series' : 'movie',
      source: 'preset',
      filters: preset.filters,
      emoji: preset.emoji,
    }));
  const allCatalogs = [...profile.existingCatalogs, ...presetCatalogs];
  const orderMap = new Map((profile.raw_ui_state.catalogOrder ?? []).map((id, i) => [id, i]));
  const catalogs = [...allCatalogs].sort((a, b) => {
    const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xl font-black text-marrow-deep tracking-tight">
            I tuoi Cataloghi <span className="text-primary/40 ml-1">({catalogs.length})</span>
          </h3>
          <p className="text-xs text-marrow-light/60 font-bold uppercase tracking-widest mt-1">Gestisci e ordina la tua esperienza</p>
        </div>
        
        {!isSelectionMode && catalogs.length > 1 && (
           <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/40 rounded-2xl border border-marrow-light/10 shadow-sm">
             <span className="material-symbols-outlined text-primary text-sm">info</span>
             <p className="text-[10px] text-marrow-light font-black uppercase tracking-wider">Trascina per riordinare</p>
           </div>
        )}
      </div>

      {/* Merge Selection Bar */}
      {isSelectionMode && (
        <div className="p-4 rounded-2xl bg-primary border-2 border-primary shadow-xl shadow-primary/20 flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-4">
            <div className="size-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Wand2 className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-black text-white uppercase tracking-[0.2em] leading-none mb-1">Fase 2: Unione Intelligente</p>
              <p className="text-sm font-bold text-white/80">Scegli il secondo catalogo da fondere con <span className="text-white underline decoration-white/30">{mergeSource?.name}</span></p>
            </div>
          </div>
          <button 
            onClick={cancelMerge}
            className="px-4 py-2 bg-white text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-marrow-deep hover:text-white transition-all shadow-lg"
          >
            Annulla
          </button>
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
        <div className="flex flex-col gap-4 w-full">
          {catalogs.map((catalog, index) => (
            <CatalogItem
              key={catalog.id}
              catalog={catalog}
              isDragging={dragIndex === index}
              isMerging={mergeSource?.id === catalog.id}
              mergeSelectionInProgress={isSelectionMode}
              canBeMergeTarget={!mergeSource || mergeSource.type === catalog.type}
              onRemove={() => !isSelectionMode && onRemove(catalog.id)}
              onMergeStart={() => startMerging(catalog)}
              onMergeSelect={() => selectMergeTarget(catalog)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => setDragIndex(null)}
            />
          ))}
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
            {myLists.map((catalog, index) => (
              <CatalogItem
                key={catalog.id}
                catalog={catalog}
                onRemove={() => !isSelectionMode && onRemoveMyList(catalog.id)}
                isMerging={mergeSource?.id === catalog.id}
                mergeSelectionInProgress={isSelectionMode}
                canBeMergeTarget={!mergeSource || mergeSource.type === catalog.type}
                onMergeStart={() => startMerging(catalog)}
                onMergeSelect={() => selectMergeTarget(catalog)}
                onDragStart={() => handleDragStart(index + 1000)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(index + 1000)}
                onDragEnd={() => setDragIndex(null)}
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
