'use client';
import { ReactNode, DragEventHandler } from 'react';
import { CatalogCardData } from '@/types';
import { countCatalogFilters } from '@/lib/utils';
import { getFrontendCatalogKind } from '@/lib/catalogKind';
import { PosterRow } from '@/components/shared/PosterRow';
import { GripVertical, Trash2, Copy, Pencil, ChevronUp, ChevronDown } from 'lucide-react';

interface CatalogItemProps {
  catalog: CatalogCardData;
  actions?: ReactNode;
  badges?: ReactNode;
  description?: string;
  onRemove?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isDragging?: boolean;
  isHiddenBySelectors?: boolean;
  hiddenReason?: string;
  onDragStart?: DragEventHandler;
  onDragOver?: DragEventHandler;
  onDragLeave?: DragEventHandler;
  onDrop?: DragEventHandler;
  onDragEnd?: DragEventHandler;
}

export function CatalogItem({
  catalog,
  actions,
  badges,
  description,
  onRemove,
  onEdit,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  isDragging,
  isHiddenBySelectors = false,
  hiddenReason,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: CatalogItemProps) {

  const filterCount = countCatalogFilters(catalog);
  const mediaSet = getFrontendCatalogKind(catalog).mediaSet;

  const isPreset = catalog.source === 'preset' || !catalog.source;
  const sourceLabel = catalog.source === 'preset' ? 'Preset' : (catalog.source === 'mylist' ? 'Mia Lista' : 'Creato');
  const sourceIcon = catalog.source === 'preset' ? 'auto_awesome' : (catalog.source === 'mylist' ? 'list' : 'auto_fix');

  return (
    <div
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative flex flex-col glass-card transition-all p-3 sm:p-5 ${
        isDragging
          ? 'opacity-30 scale-95'
          : isHiddenBySelectors
          ? 'border-2 border-dashed border-amber-500/40 bg-slate-100/70 opacity-60 hover:opacity-90 transition-opacity'
          : ''
      } ${onDragStart ? 'sm:cursor-grab sm:active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between mb-2 sm:mb-4 relative z-10">
        <div className="flex gap-2 sm:gap-4 items-center min-w-0">
          <div className="flex items-center gap-2 sm:gap-3">
            {(onMoveUp || onMoveDown || onDragStart) && (
              <div className="flex items-center gap-1 shrink-0">
                {(onMoveUp || onMoveDown) && (
                  <div className="flex flex-col sm:hidden items-center justify-center bg-marrow-light/5 rounded-lg border border-marrow-light/10 divide-y divide-marrow-light/10 shrink-0">
                    <button
                      type="button"
                      disabled={!canMoveUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp?.();
                      }}
                      aria-label="Sposta su"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] text-marrow-light/60 hover:text-primary hover:bg-primary/5 active:bg-primary/15 disabled:opacity-20 disabled:pointer-events-none transition-all touch-manipulation flex items-center justify-center rounded-t-lg"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveDown}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown?.();
                      }}
                      aria-label="Sposta giù"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] text-marrow-light/60 hover:text-primary hover:bg-primary/5 active:bg-primary/15 disabled:opacity-20 disabled:pointer-events-none transition-all touch-manipulation flex items-center justify-center rounded-b-lg"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {onDragStart && (
                  <GripVertical className="hidden sm:block h-3.5 w-3.5 sm:h-4 sm:w-4 text-marrow-light/20 cursor-grab group-hover:text-primary/40 transition-colors shrink-0" />
                )}
              </div>
            )}
            <div className="size-9 sm:size-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all bg-white shadow-inner text-marrow-deep">
              <span className="text-lg sm:text-2xl">{catalog.emoji ?? '📋'}</span>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-marrow-deep text-sm sm:text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">{catalog.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              {catalog.source && (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-black uppercase tracking-wider border border-primary/10">
                  <span className="material-symbols-outlined text-xs shrink-0">{sourceIcon}</span> 
                  <span className="truncate">{sourceLabel}</span>
                </span>
              )}
              {badges}
              {(catalog.isAnime || (catalog.filters as any)?.isAnime) && (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider border border-amber-500/20">
                  <span>🏮</span>
                  <span>Solo anime</span>
                </span>
              )}
              {isHiddenBySelectors && (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-800 text-xs font-black uppercase tracking-wider border border-amber-500/30">
                  <span className="material-symbols-outlined text-xs shrink-0">visibility_off</span>
                  <span>{hiddenReason || 'Nascosto dai selettori'}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2 sm:ml-4">
          {actions}
          {onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="p-2 rounded-xl text-marrow-light/40 hover:text-primary hover:bg-primary/5 transition-all group/btn size-11 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              title="Duplica catalogo"
            >
              <Copy className="h-4.5 w-4.5 group-hover/btn:scale-110 transition-transform" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-2 rounded-xl text-marrow-light/40 hover:text-destructive hover:bg-destructive/5 transition-all group/btn size-11 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              title="Rimuovi"
            >
              <Trash2 className="h-4.5 w-4.5 group-hover/btn:scale-110 transition-transform" />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs sm:text-sm text-marrow-light/80 font-medium line-clamp-1 mb-2 sm:mb-4 relative z-10 px-1">
        {description || catalog.description || catalog.raw_prompt || (isPreset ? 'Catalogo tematico preconfigurato e costantemente aggiornato.' : 'Catalogo basato su filtri e preferenze personalizzate.')}
      </p>

      <div className="-mx-1 sm:-mx-2 mb-2 sm:mb-4 relative z-10 group/row">
         {/* Alone decorativo: si accende passando il mouse sulla riga. Il gruppo di riferimento è
             `group/row` (l'antenato reale): prima puntava a `group/poster`, che qui non esiste, quindi
             su desktop non si è mai acceso e su touch restava acceso per sempre. */}
         <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/row:opacity-100 transition-opacity rounded-2xl -z-10" />
        <PosterRow
          presetId={isPreset ? (catalog.id.startsWith('yaca_preset_') ? catalog.id : `yaca_preset_${catalog.id}`) : undefined}
          type={catalog.type}
          filters={catalog.filters}
          prompt={catalog.raw_prompt}
        />
      </div>

      <div className="mt-auto pt-2 sm:pt-4 border-t border-marrow-light/10 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Il tipo (film / serie / entrambi) viene dalla stessa logica di dominio che indicizza i
              cataloghi: 'both' non è un ramo duplicato qui, è `mediaSet` di due elementi. */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs font-black text-marrow-deep/70">
            {mediaSet.map((media, i) => (
              <span key={media} className="flex items-center gap-1 sm:gap-1.5">
                {i > 0 && <span className="text-marrow-light/30">/</span>}
                <span className="material-symbols-outlined text-xs sm:text-sm">{media === 'film' ? 'movie' : 'tv'}</span>
                <span className="uppercase tracking-tight">{media === 'film' ? 'Film' : 'Serie'}</span>
              </span>
            ))}
          </div>
          <div className="w-1 h-1 rounded-full bg-marrow-light/20" />
          {!isPreset && onEdit ? (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex items-center gap-1 text-xs font-bold text-marrow-light/60 hover:text-primary hover:bg-primary/5 px-2.5 py-1.5 rounded-md transition-all group/edit-btn cursor-pointer touch-manipulation min-h-[44px] h-11"
              title="Modifica filtri"
            >
              <span>{filterCount} Filtr{filterCount !== 1 ? 'i' : 'o'}</span>
              <Pencil className="h-3 w-3 text-marrow-light/40 group-hover/edit-btn:text-primary transition-colors shrink-0" />
            </button>
          ) : (
            <div className="text-xs font-bold text-marrow-light/60 py-1">
              {filterCount} Filtr{filterCount !== 1 ? 'i' : 'o'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
