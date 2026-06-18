'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { Catalog } from '@/types';
import { generateId } from '@/lib/utils';

interface EditCatalogModalProps {
  open: boolean;
  onClose: () => void;
  catalog: Catalog | null;
  onAddCatalog: (catalog: Catalog) => void;
  onRemoveCatalog: (id: string) => void;
  onUpdateCatalog: (catalog: Catalog) => void;
}

export function EditCatalogModal({
  open,
  onClose,
  catalog,
  onAddCatalog,
  onRemoveCatalog,
  onUpdateCatalog,
}: EditCatalogModalProps) {
  if (!catalog) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-4xl bg-background-light border-marrow-light/30 shadow-2xl p-0 overflow-hidden h-[90vh] md:h-[85vh] flex flex-col rounded-2xl sm:rounded-3xl">
        <DialogHeader className="p-4 sm:p-6 bg-white/40 border-b border-marrow-light/10 shrink-0">
          <DialogTitle className="text-lg sm:text-2xl font-black text-marrow-deep tracking-tight">
            Modifica Catalogo
          </DialogTitle>
          <DialogDescription className="text-marrow-light/70 text-xs sm:text-sm font-medium">
            Modifica i filtri e le impostazioni di &ldquo;{catalog.name}&rdquo;
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 scrollbar-hide bg-white/10">
          <CreatorPanel
            editCatalog={catalog}
            onAddCatalog={(updatedCatalog) => {
              if (catalog.source === 'preset') {
                // Preset modification: save as custom, remove original preset
                onAddCatalog({
                  ...updatedCatalog,
                  id: 'custom_' + generateId(),
                });
                onRemoveCatalog(catalog.id);
              } else {
                onUpdateCatalog(updatedCatalog);
              }
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
