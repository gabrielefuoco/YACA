'use client';
import { useState } from 'react';
import { Profile, Catalog, Preset } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { MergeModal } from '@/components/modals/MergeModal';
import { Layers } from 'lucide-react';

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
  const [hoverMergeIndex, setHoverMergeIndex] = useState<number | null>(null);
  const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);

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
    setDragIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...catalogs];
    const [moved] = reordered.splice(dragIndex, 1);

    // If dropped on same position or adjacent, reorder; if Shift held could merge
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered);
    setDragIndex(null);
  };

  const handleMergeDrop = (targetCatalog: Catalog, sourceCatalog: Catalog) => {
    setMergeSource(sourceCatalog);
    setMergeTarget(targetCatalog);
    setShowMergeModal(true);
  };

  const handleDragOverWithMerge = (
    e: React.DragEvent,
    targetIndex: number,
    targetCatalog: Catalog
  ) => {
    e.preventDefault();

    // Normal reorder if not holding over
    if (dragIndex === null || dragIndex === targetIndex) {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        setHoverTimer(null);
      }
      setHoverMergeIndex(null);
      return;
    }

    // Hover-to-merge logic
    if (hoverMergeIndex !== targetIndex) {
      if (hoverTimer) clearTimeout(hoverTimer);

      setHoverMergeIndex(targetIndex);
      const timer = setTimeout(() => {
        handleMergeDrop(targetCatalog, catalogs[dragIndex]);
        setHoverMergeIndex(null);
        setHoverTimer(null);
      }, 1000); // 1 second hold to merge

      setHoverTimer(timer);
    }

    if (e.shiftKey) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    setHoverMergeIndex(null);
  };

  const handleDropWithMerge = (e: React.DragEvent, targetIndex: number, targetCatalog: Catalog) => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    setHoverMergeIndex(null);

    if (e.shiftKey && dragIndex !== null && dragIndex !== targetIndex) {
      handleMergeDrop(targetCatalog, catalogs[dragIndex]);
    } else {
      handleDrop(targetIndex);
    }
    setDragIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          I tuoi Cataloghi ({catalogs.length})
        </h3>
        {catalogs.length > 1 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Trascina per riordinare &bull; Shift + trascina per unire</p>
        )}
      </div>

      {catalogs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700/50 p-12 text-center bg-slate-50 dark:bg-slate-800/20">
          <Layers className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500 mb-4" />
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">Nessun catalogo attivo</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Aggiungi cataloghi dalla sezione Esplora o creane uno nuovo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {catalogs.map((catalog, index) => (
            <CatalogItem
              key={catalog.id}
              catalog={catalog}
              isDragging={dragIndex === index}
              isMergeTarget={hoverMergeIndex === index}
              onRemove={() => onRemove(catalog.id)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOverWithMerge(e, index, catalog)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropWithMerge(e, index, catalog)}
              onDragEnd={() => {
                setDragIndex(null);
                handleDragLeave();
              }}
            />
          ))}
        </div>
      )}

      {/* My Lists */}
      {myLists.length > 0 && (
        <div className="pt-8 border-t border-slate-200 dark:border-slate-700/50">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
            Le Mie Liste ({myLists.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {myLists.map((catalog, index) => (
              <CatalogItem
                key={catalog.id}
                catalog={catalog}
                onRemove={() => onRemoveMyList(catalog.id)}
                isMergeTarget={hoverMergeIndex === index + 1000} // Offset for myLists
                onDragStart={() => setDragIndex(index + 1000)}
                onDragOver={(e) => handleDragOverWithMerge(e, index + 1000, catalog)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDropWithMerge(e, index + 1000, catalog)}
                onDragEnd={() => {
                  setDragIndex(null);
                  handleDragLeave();
                }}
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
