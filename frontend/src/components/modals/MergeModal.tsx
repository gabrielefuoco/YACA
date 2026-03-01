'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Catalog } from '@/types';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface MergeModalProps {
  open: boolean;
  onClose: () => void;
  catalogA: Catalog | null;
  catalogB: Catalog | null;
  onConfirm: (mergedCatalog: Catalog) => void;
}

export function MergeModal({ open, onClose, catalogA, catalogB, onConfirm }: MergeModalProps) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'OR' | 'AND'>('OR');
  const [loading, setLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<Array<{ id: string; title: string; poster?: string }>>([]);

  if (!catalogA || !catalogB) return null;

  const handlePreview = async () => {
    setLoading(true);
    try {
      const data = await api.previewCatalog({
        filters: {
          merge: { catalogs: [catalogA.id, catalogB.id], mode },
        },
        type: catalogA.type,
      });
      setPreviewItems(data.items ?? []);
    } catch {}
    setLoading(false);
  };

  const handleConfirm = () => {
    const merged: Catalog = {
      id: `merged_${catalogA.id}_${catalogB.id}_${Date.now()}`,
      name: name || `${catalogA.name} + ${catalogB.name}`,
      type: catalogA.type,
      source: 'merged',
      filters: {
        merge: { catalogs: [catalogA.id, catalogB.id], mode },
      },
    };
    onConfirm(merged);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🔀 Smart Merge</DialogTitle>
          <DialogDescription>Unisci due cataloghi in uno solo</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Catalogs summary */}
          <div className="grid grid-cols-2 gap-2">
            {[catalogA, catalogB].map((cat) => (
              <div key={cat.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-white/40 mb-1">Catalogo</p>
                <div className="flex items-center gap-2">
                  <span>{cat.emoji ?? '📋'}</span>
                  <span className="text-sm font-medium text-white truncate">{cat.name}</span>
                </div>
                <div className="mt-1">
                  <TypeBadge type={cat.type} />
                </div>
              </div>
            ))}
          </div>

          {/* Mode selector */}
          <div>
            <Label className="mb-2 block">Modalità di unione</Label>
            <div className="flex gap-2">
              {(['OR', 'AND'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    mode === m
                      ? 'border-[#8a5aeb] bg-[#8a5aeb]/20 text-[#8a5aeb]'
                      : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                  }`}
                >
                  {m === 'OR' ? '🔗 OR (Unione)' : '⚡ AND (Intersezione)'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-white/40">
              {mode === 'OR'
                ? 'Mostra contenuti presenti in almeno uno dei cataloghi'
                : 'Mostra solo contenuti presenti in entrambi i cataloghi'}
            </p>
          </div>

          {/* Name input */}
          <div>
            <Label htmlFor="merge-name">Nome del nuovo catalogo</Label>
            <Input
              id="merge-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${catalogA.name} + ${catalogB.name}`}
              className="mt-1"
            />
          </div>

          {/* Preview */}
          {previewItems.length > 0 && (
            <div>
              <p className="text-xs text-white/50 mb-2">{previewItems.length} risultati</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previewItems.slice(0, 8).map((item) => (
                  item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={item.id} src={item.poster} alt={item.title} className="h-20 w-14 shrink-0 rounded object-cover" />
                  ) : (
                    <div key={item.id} className="h-20 w-14 shrink-0 rounded bg-white/10 flex items-center justify-center text-xs text-white/40">
                      {item.title.slice(0, 2)}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" onClick={handlePreview} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Anteprima
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={handleConfirm}>✅ Conferma Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
