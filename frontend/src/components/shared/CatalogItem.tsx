'use client';
import { Catalog } from '@/types';
import { TypeBadge } from './TypeBadge';
import { Button } from '@/components/ui/button';
import { GripVertical, X } from 'lucide-react';
import { PosterRow } from './PosterRow';

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
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex flex-col w-full min-w-0 transition-all duration-300 group/item ${isDragging ? 'opacity-50 scale-95' : ''
        } ${isMergeTarget
          ? 'scale-105 ring-4 ring-[#8a5aeb] ring-offset-4 ring-offset-black bg-[#8a5aeb]/20 z-10 animate-pulse shadow-[0_0_20px_rgba(138,90,235,0.4)]'
          : ''
        }`}
    >
      <div className="flex items-center gap-3 px-2 pb-2 w-full">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical className="h-4 w-4 text-white/20 cursor-grab shrink-0 hover:text-white/40 transition-colors" />
          <span className="text-xl shrink-0 leading-none">{catalog.emoji ?? '📋'}</span>
          <span className="text-sm font-medium text-white truncate">{catalog.name}</span>
          <div className="shrink-0">
            <TypeBadge type={catalog.type as any} />
          </div>
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-white/30 hover:text-red-400 hover:bg-red-400/10"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="max-w-full overflow-hidden">
        <PosterRow
          presetId={catalog.source === 'preset' ? catalog.id : undefined}
          filters={catalog.filters}
          type={catalog.type}
          prompt={catalog.raw_prompt}
        />
      </div>
    </div>
  );
}
