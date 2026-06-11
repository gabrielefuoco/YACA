'use client';
import { Catalog } from '@/types';
import { PosterRow } from '@/components/shared/PosterRow';
import { Wand2, GripVertical, Trash2, ArrowRight } from 'lucide-react';

interface CatalogItemProps {
  catalog: Catalog;
  onRemove?: () => void;
  onMergeStart?: () => void;
  onMergeSelect?: () => void;
  isDragging?: boolean;
  isMergeTarget?: boolean;
  isMerging?: boolean; 
  mergeSelectionInProgress?: boolean;
  canBeMergeTarget?: boolean;
  onDragStart?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
}

export function CatalogItem({
  catalog,
  onRemove,
  onMergeStart,
  onMergeSelect,
  isDragging,
  isMergeTarget,
  isMerging,
  mergeSelectionInProgress,
  canBeMergeTarget = true,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: CatalogItemProps) {
  const isPreset = catalog.source === 'preset';
  const filterCount = catalog.filters ? Object.keys(catalog.filters).length : 0;

  const sourceLabel = isPreset ? 'Preset' : (catalog.source === 'mylist' ? 'Mia Lista' : 'Creato');
  const sourceIcon = isPreset ? 'auto_awesome' : (catalog.source === 'mylist' ? 'list' : 'auto_fix');

  return (
    <div
      draggable={!mergeSelectionInProgress}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={mergeSelectionInProgress && !isMerging && canBeMergeTarget ? onMergeSelect : undefined}
      className={`group relative flex flex-col glass-card transition-all p-5 shadow-sm border-2 ${
        isDragging ? 'opacity-30 scale-95 border-marrow-light/10' : 
        isMerging ? 'border-primary ring-4 ring-primary/10 bg-primary/5 z-20 scale-[1.02] shadow-xl' :
        isMergeTarget ? 'border-primary bg-primary/5 z-20 scale-[1.02] shadow-xl animate-pulse cursor-pointer' :
        mergeSelectionInProgress ? (
          isMerging ? 'opacity-100' : 
          !canBeMergeTarget ? 'opacity-20 grayscale scale-[0.98] pointer-events-none border-marrow-light/5' :
          'opacity-100 hover:border-primary/50 cursor-pointer shadow-md'
        ) :
        'border-marrow-light/10 bg-white/60 hover:bg-white/90 hover:border-primary/30 cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex gap-4 items-center min-w-0">
          <div className="flex items-center gap-3">
            {!mergeSelectionInProgress && (
              <GripVertical className="h-4 w-4 text-marrow-light/20 cursor-grab group-hover:text-primary/40 transition-colors shrink-0" />
            )}
            <div className={`size-12 rounded-2xl flex items-center justify-center transition-all ${
              isMerging ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white shadow-inner text-marrow-deep'
            }`}>
              <span className="text-2xl">{catalog.emoji ?? '📋'}</span>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-marrow-deep text-lg leading-tight truncate group-hover:text-primary transition-colors">{catalog.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-[10px] font-black uppercase tracking-wider border border-primary/10">
                <span className="material-symbols-outlined text-[10px] shrink-0">{sourceIcon}</span> 
                <span className="truncate">{sourceLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!mergeSelectionInProgress ? (
            <>
              {onMergeStart && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMergeStart(); }}
                  className="p-2 rounded-xl text-marrow-light/40 hover:text-primary hover:bg-primary/5 transition-all group/btn"
                  title="Fondi con un altro catalogo"
                >
                  <Wand2 className="h-5 w-5 group-hover/btn:scale-110 transition-transform" />
                </button>
              )}
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  className="p-2 rounded-xl text-marrow-light/40 hover:text-destructive hover:bg-destructive/5 transition-all group/btn"
                  title="Rimuovi"
                >
                  <Trash2 className="h-5 w-5 group-hover/btn:scale-110 transition-transform" />
                </button>
              )}
            </>
          ) : (
            isMerging && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary rounded-full text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 animate-bounce">
                Sorgente <ArrowRight className="h-3 w-3" />
              </div>
            )
          )}
        </div>
      </div>

      <p className="text-sm text-marrow-light/80 font-medium line-clamp-1 mb-4 relative z-10 px-1">
        {catalog.raw_prompt || 'Catalogo basato su filtri e preferenze personalizzate.'}
      </p>

      <div className="-mx-2 mb-4 relative z-10 group/row">
         <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/poster:opacity-100 transition-opacity rounded-2xl -z-10" />
        <PosterRow presetId={catalog.source === 'preset' ? `yaca_preset_${catalog.id}` : undefined} type={catalog.type} filters={catalog.filters} prompt={catalog.raw_prompt} />
      </div>

      <div className="mt-auto pt-4 border-t border-marrow-light/10 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-1.5 text-xs font-black text-marrow-deep/70">
            <span className="material-symbols-outlined text-sm">{catalog.type === 'movie' ? 'movie' : 'tv'}</span>
            <span className="uppercase tracking-tight">{catalog.type === 'movie' ? 'Film' : 'Serie'}</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-marrow-light/20" />
          <div className="text-xs font-bold text-marrow-light/60">
            {filterCount} Filtr{filterCount !== 1 ? 'i' : 'o'}
          </div>
        </div>
        
        {!mergeSelectionInProgress && (
          <button className="flex items-center gap-1 text-[10px] font-black text-marrow-light hover:text-primary transition-colors uppercase tracking-widest border border-marrow-light/10 hover:border-primary/20 rounded-lg px-2 py-1 bg-white/40">
            Modifica <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {isMergeTarget && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/5 -[2px] rounded-2xl border-4 border-primary pointer-events-none z-30">
          <div className="bg-primary text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-2xl">
            Clicca per Fondere
          </div>
        </div>
      )}
    </div>
  );
}
