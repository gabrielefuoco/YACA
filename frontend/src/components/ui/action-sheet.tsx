'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ActionSheetItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: ActionSheetItem[];
}

/**
 * Menù di azioni per una card, costruito sul Dialog esistente.
 *
 * Perché non un popover: il contenuto va in portal, quindi non lo taglia nessun antenato con
 * `overflow` (la classe di difetti del ticket 08), e non serve una dipendenza nuova. Una voce per
 * riga, 48px di altezza: al dito non si sbaglia voce.
 */
export function ActionSheet({ open, onOpenChange, title, description, items }: ActionSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-sm p-2 gap-0 rounded-2xl">
        <DialogTitle className="px-3 pt-3 pb-1 text-xs font-black uppercase tracking-wider text-marrow-light">
          {title}
        </DialogTitle>
        <DialogDescription className={description ? 'px-3 pb-2 text-xs text-marrow-light/70' : 'sr-only'}>
          {description ?? 'Scegli un’azione'}
        </DialogDescription>
        <div className="flex flex-col">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onOpenChange(false);
                item.onSelect();
              }}
              className={cn(
                'flex items-center gap-3 min-h-[48px] px-3 rounded-xl text-left text-sm font-bold transition-colors touch-manipulation disabled:opacity-40 disabled:pointer-events-none',
                item.destructive
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-marrow-deep hover:bg-marrow-light/10'
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
