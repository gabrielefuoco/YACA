'use client';
import { Catalog } from '@/types';
import { PosterRow } from '@/components/shared/PosterRow';

interface CatalogItemProps {
  catalog: Catalog;
  onRemove?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  isDragging?: boolean;
  isMergeTarget?: boolean;
  onDragStart?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
}

export function CatalogItem({
  catalog,
  onRemove,
  isDragging,
  isMergeTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: CatalogItemProps) {
  const isPreset = catalog.source === 'preset';
  const filterCount = catalog.filters ? Object.keys(catalog.filters).length : 0;

  const sourceLabel = isPreset ? 'Preset' : (catalog.source === 'mylist' ? 'My List' : 'Creato');
  const sourceIcon = isPreset ? 'auto_awesome' : (catalog.source === 'mylist' ? 'list' : 'auto_fix');

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative flex flex-col glass-card transition-all p-5 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50 scale-95' : ''
        } ${isMergeTarget
          ? 'scale-105 ring-4 ring-primary ring-offset-4 ring-offset-background-light dark:ring-offset-background-dark bg-primary/10 z-10 animate-pulse'
          : ''
        }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"></div>

      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex gap-4 items-center">
          <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
            <span className="text-2xl">{catalog.emoji ?? '📋'}</span>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg leading-tight line-clamp-1">{catalog.name}</h3>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <span className="material-symbols-outlined text-[10px]">{sourceIcon}</span> {sourceLabel}
            </span>
          </div>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-slate-400 hover:text-rose-500 transition-colors p-2 -mr-2 -mt-2"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 relative z-10">
        {catalog.raw_prompt || 'Catalogo basato su filtri e preferenze per risultati personalizzati.'}
      </p>

      <div className="-mx-2 mb-4 relative z-10">
        <PosterRow presetId={catalog.source === 'preset' ? catalog.id : undefined} type={catalog.type} filters={catalog.filters} prompt={catalog.raw_prompt} />
      </div>

      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span className="material-symbols-outlined text-sm">{catalog.type === 'movie' ? 'movie' : 'tv'}</span>
          {filterCount} Filtr{filterCount !== 1 ? 'i' : 'o'}
        </div>
        <button className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/70 transition-colors">
          Personalizza <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
