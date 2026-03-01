'use client';
import { Catalog } from '@/types';
import { TypeBadge } from './TypeBadge';
import { Button } from '@/components/ui/button';
import { GripVertical, X } from 'lucide-react';

interface CatalogItemProps {
  catalog: Catalog;
  onRemove?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  isDragging?: boolean;
  onDragStart?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
}

export function CatalogItem({
  catalog,
  onRemove,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: CatalogItemProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-all ${
        isDragging ? 'opacity-50 border-[#8a5aeb]' : ''
      }`}
    >
      <GripVertical className="h-4 w-4 text-white/30 cursor-grab shrink-0" />
      <span className="text-lg shrink-0">{catalog.emoji ?? '📋'}</span>
      <span className="flex-1 text-sm font-medium text-white truncate">{catalog.name}</span>
      <TypeBadge type={catalog.type} />
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/40 hover:text-red-400"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
