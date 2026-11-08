'use client';
import { useState } from 'react';
import { CatalogoEsploraVoce } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { catalogoVoceToCard } from '@/lib/catalogPresentation';
import { Layers, Info, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActiveCatalogsPanelProps {
  catalogs: CatalogoEsploraVoce[];
  onReorder: (ids: string[]) => void;
  onEditCatalog?: (catalog: any) => void;
  onGoToExplore?: () => void;
}

export function ActiveCatalogsPanel({
  catalogs,
  onReorder,
  onEditCatalog,
  onGoToExplore,
}: ActiveCatalogsPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...catalogs];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    onReorder(reordered.map(c => c.id));
  };

  const handleMoveCatalog = (fromIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (targetIndex < 0 || targetIndex >= catalogs.length) return;
    const reordered = [...catalogs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered.map(c => c.id));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-xl font-black text-marrow-deep tracking-tight">
              Cataloghi Attivi
            </h3>
            <span className="text-xs font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10">
              {catalogs.length}
            </span>
          </div>
          <p className="text-xs text-marrow-light font-medium mt-0.5">
            L&apos;elenco effettivo dichiarato a Stremio per la modalità corrente. Trascina o usa le frecce per riordinare.
          </p>
        </div>

        {catalogs.length > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/40 rounded-xl border border-marrow-light/10 shrink-0">
            <Info className="h-3.5 w-3.5 text-primary shrink-0" />
            <p className="text-xs text-marrow-light font-bold">
              <span className="sm:hidden">Frecce per riordinare</span>
              <span className="hidden sm:inline">Trascina per riordinare</span>
            </p>
          </div>
        )}
      </div>

      {catalogs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-marrow-light/20 p-8 sm:p-12 text-center bg-white/30">
          <div className="size-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <Layers className="h-8 w-8 text-primary/40" />
          </div>
          <p className="text-base font-black text-marrow-deep">Nessun catalogo attivo nella modalità corrente</p>
          <p className="text-xs text-marrow-light font-medium mt-1 max-w-sm mx-auto">
            I cataloghi attivi determinano cosa vedrai su Stremio. Attiva i cataloghi che desideri da Esplora.
          </p>
          {onGoToExplore && (
            <Button
              onClick={onGoToExplore}
              className="mt-4 text-xs font-bold bg-primary text-white hover:bg-primary-dark rounded-xl h-10 px-4 gap-1.5"
            >
              <Compass className="h-4 w-4" />
              Vai a Esplora
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4 w-full">
          {catalogs.map((catalog, index) => {
            const cardData = catalogoVoceToCard(catalog);

            return (
              <CatalogItem
                key={catalog.id}
                catalog={cardData}
                isDragging={dragIndex === index}
                onEdit={catalog.fonte === 'creazione' && onEditCatalog ? () => onEditCatalog(catalog) : undefined}
                onMoveUp={() => handleMoveCatalog(index, 'up')}
                onMoveDown={() => handleMoveCatalog(index, 'down')}
                canMoveUp={index > 0}
                canMoveDown={index < catalogs.length - 1}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => setDragIndex(null)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
