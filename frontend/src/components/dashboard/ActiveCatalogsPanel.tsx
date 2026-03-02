'use client';
import { useState } from 'react';
import { Profile, Catalog } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { MergeModal } from '@/components/modals/MergeModal';
import { Button } from '@/components/ui/button';
import { Layers } from 'lucide-react';

interface ActiveCatalogsPanelProps {
  profile: Profile;
  onReorder: (catalogs: Catalog[]) => void;
  onRemove: (catalogId: string) => void;
  onMerge: (catalog: Catalog) => void;
  myLists: Catalog[];
  onRemoveMyList: (id: string) => void;
}

export function ActiveCatalogsPanel({
  profile,
  onReorder,
  onRemove,
  onMerge,
  myLists,
  onRemoveMyList,
}: ActiveCatalogsPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [mergeSource, setMergeSource] = useState<Catalog | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Catalog | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  const catalogs = profile.existingCatalogs;

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
    if (dragIndex !== null && dragIndex !== targetIndex && e.shiftKey) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDropWithMerge = (e: React.DragEvent, targetIndex: number, targetCatalog: Catalog) => {
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
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          Cataloghi Attivi ({catalogs.length})
        </h3>
        {catalogs.length > 1 && (
          <p className="text-xs text-white/30">Shift + trascina per unire</p>
        )}
      </div>

      {catalogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-white/15 mb-3" />
          <p className="text-sm text-white/40 font-medium">Nessun catalogo attivo</p>
          <p className="text-xs text-white/20 mt-1.5">Aggiungi cataloghi dalla sezione Esplora</p>
        </div>
      ) : (
        <div className="space-y-2">
          {catalogs.map((catalog, index) => (
            <CatalogItem
              key={catalog.id}
              catalog={catalog}
              isDragging={dragIndex === index}
              onRemove={() => onRemove(catalog.id)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOverWithMerge(e, index, catalog)}
              onDrop={(e) => handleDropWithMerge(e, index, catalog)}
              onDragEnd={() => setDragIndex(null)}
            />
          ))}
        </div>
      )}

      {/* My Lists */}
      {myLists.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
            Le Mie Liste ({myLists.length})
          </h3>
          <div className="space-y-2">
            {myLists.map((catalog) => (
              <CatalogItem
                key={catalog.id}
                catalog={catalog}
                onRemove={() => onRemoveMyList(catalog.id)}
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
