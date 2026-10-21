'use client';

import React from 'react';
import { PosterImage } from '@/components/shared/PosterImage';
import { cn } from '@/lib/utils';

export type PosterCardSize = 'sm' | 'md' | 'fluid';
export type PosterTitlePlacement = 'none' | 'below';

export interface PosterCardProps {
  poster?: string | null;
  title: string;
  year?: string | number | null;
  size?: PosterCardSize;
  className?: string;
  badge?: React.ReactNode;
  /** Controlli espliciti della card: un'icona da 44px in alto a destra, mai un velo sull'immagine. */
  actions?: React.ReactNode;
  /**
   * Dove vive il titolo. `none` quando il poster lo porta già stampato dentro (o quando la card è
   * un'anteprima di ciò che mostrerà Stremio); `below` quando l'utente deve riconoscere le sue cose.
   */
  titlePlacement?: PosterTitlePlacement;
  selected?: boolean;
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
 *
 * Contratto (D2-D4 di `.scratch/frontend-verifica/map.md`):
 * - il tocco non fa nulla: nessun velo, nessuna azione nascosta. `onClick` esiste solo per la
 *   selezione esplicita (libreria in modalità selezione);
 * - le azioni sono un controllo visibile (`actions`, in alto a destra) — mai sopra l'immagine
 *   sotto forma di velo;
 * - il titolo ha una posizione dichiarata (`titlePlacement`) e non viene mai duplicato sopra un
 *   poster che lo porta già stampato.
 */
export function PosterCard({
  poster,
  title,
  year,
  size = 'md',
  className,
  badge,
  actions,
  titlePlacement = 'none',
  selected = false,
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
        'group/poster relative select-none',
        // Cursore a manina solo se la card fa davvero qualcosa: una locandina di sola
        // anteprima non deve promettere un click che non esiste.
        onClick && 'cursor-pointer',
        className
      )}
    >
      <div
        className={cn(
          'relative rounded-xl overflow-hidden transition-all duration-300 shadow-md shadow-marrow-light/10',
          SIZE_VARIANTS[size],
          selected && 'ring-4 ring-primary ring-offset-1'
        )}
      >
        <PosterImage
          src={poster}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover/poster:scale-105"
          showFallbackTitle={titlePlacement === 'none'}
        />

        {/* Badge opzionale in alto a sinistra (es. % Match DNA) */}
        {badge && <div className="absolute top-2 left-2 z-20 pointer-events-none">{badge}</div>}

        {/* Azioni esplicite: un solo controllo, sempre visibile, fuori dalla zona del titolo */}
        {actions && <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1">{actions}</div>}
      </div>

      {titlePlacement === 'below' && (
        <div className="pt-1.5 px-0.5">
          <p className="text-xs font-bold text-marrow-deep leading-tight line-clamp-2">{title}</p>
          {year && <p className="text-xs text-marrow-light font-medium mt-0.5">{year}</p>}
        </div>
      )}
    </div>
  );
}

export default PosterCard;
