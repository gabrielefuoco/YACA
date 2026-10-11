'use client';

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
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

const SIZE_VARIANTS: Record<PosterCardSize, string> = {
  // sm: compatto per pickers e autocompletamento (AutocompleteSearch, Creator manual)
  sm: 'w-[100px] h-[150px] shrink-0',
  // md: standard responsive per caroselli (PosterRow, CatalogLivePreview, Creator query preview)
  md: 'w-[120px] h-[180px] sm:w-[150px] sm:h-[225px] shrink-0',
  // fluid: per griglie responsive (UserLibraryPanel, Creator manual list)
  fluid: 'w-full aspect-[2/3]',
};

/**
 * Primitiva condivisa per locandine 2:3.
 * Incapsula le tre taglie standard, fallback robusto tramite PosterImage
 * con gestione onError, raggio uniforme rounded-xl e overlay leggibile su touch.
 */
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
  onDragOver,
  onDrop,
}: PosterCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      className={cn(
        'group/poster relative rounded-xl overflow-hidden transition-all duration-300 shadow-md shadow-marrow-light/10 select-none',
        // Cursore a manina solo se la card fa davvero qualcosa: una locandina di sola
        // anteprima non deve promettere un click che non esiste.
        onClick && 'cursor-pointer',
        SIZE_VARIANTS[size],
        className
      )}
    >
      <PosterImage
        src={poster}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-300 group-hover/poster:scale-105"
      />

      {/* Badge opzionale in alto a sinistra (es. % Match DNA) */}
      {badge && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none">
          {badge}
        </div>
      )}

      {/* Overlay con titolo/anno standard per preview e caroselli (visibile su hover e touch screen) */}
      {showTitleOverlay && (
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 group-hover/poster:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-300 pointer-events-none">
          <p className="text-xs font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">
            {title}
          </p>
          {year && (
            <p className="text-xs text-accent font-bold mt-0.5">{year}</p>
          )}
        </div>
      )}

      {/* Overlay interattivo personalizzato (es. pulsanti azioni o selezione) */}
      {overlay}
    </div>
  );
}

export default PosterCard;
