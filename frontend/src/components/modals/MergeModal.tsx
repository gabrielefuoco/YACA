'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Catalog } from '@/types';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

interface MergeModalProps {
  open: boolean;
  onClose: () => void;
  catalogA: Catalog | null;
  catalogB: Catalog | null;
  onConfirm: (mergedCatalog: Catalog) => void;
}

export function MergeModal({ open, onClose, catalogA, catalogB, onConfirm }: MergeModalProps) {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<'popularity' | 'mixed'>('mixed');
  const [loading, setLoading] = useState(false);
  const [namingLoading, setNamingLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<Array<{ id: string; title: string; poster?: string }>>([]);

  if (!catalogA || !catalogB) return null;

  const handlePreview = async () => {
    setLoading(true);
    try {
      const data = await api.previewCatalog({
        filters: {
          merge: { catalogs: [catalogA.id, catalogB.id], strategy },
        },
        type: catalogA.type,
      });
      setPreviewItems(data.items ?? []);
    } catch { }
    setLoading(false);
  };

  const handleAiNaming = async () => {
    if (!catalogA || !catalogB) return;
    setNamingLoading(true);
    try {
      const res = await api.generateMergedName(catalogA.name, catalogB.name);
      if (res.name) setName(res.name);
    } catch (err) {
      console.error("AI Naming error:", err);
    }
    setNamingLoading(false);
  };

  const handleConfirm = () => {
    const merged: Catalog = {
      id: `merged_${catalogA.id}_${catalogB.id}_${Date.now()}`,
      name: name || `${catalogA.name} + ${catalogB.name}`,
      type: catalogA.type,
      source: 'merged',
      filters: {
        merge: { catalogs: [catalogA.id, catalogB.id], strategy },
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

          {/* Strategy selector */}
          <div>
            <Label className="mb-2 block text-xs text-white/50">Ordinamento della lista</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setStrategy('mixed')}
                className={`flex flex-col items-center justify-center rounded-xl border p-4 transition-all ${strategy === 'mixed'
                    ? 'border-[#8a5aeb] bg-[#8a5aeb]/20 text-[#8a5aeb] ring-1 ring-[#8a5aeb]'
                    : 'border-white/5 bg-white/[0.03] text-white/40 hover:bg-white/[0.05] hover:text-white'
                  }`}
              >
                <div className="text-xl mb-1">🔀</div>
                <span className="text-sm font-semibold">Misto</span>
                <span className="text-[10px] opacity-60">Alternato 1 a 1</span>
              </button>

              <button
                onClick={() => setStrategy('popularity')}
                className={`flex flex-col items-center justify-center rounded-xl border p-4 transition-all ${strategy === 'popularity'
                    ? 'border-[#8a5aeb] bg-[#8a5aeb]/20 text-[#8a5aeb] ring-1 ring-[#8a5aeb]'
                    : 'border-white/5 bg-white/[0.03] text-white/40 hover:bg-white/[0.05] hover:text-white'
                  }`}
              >
                <div className="text-xl mb-1">🔥</div>
                <span className="text-sm font-semibold">Popolare</span>
                <span className="text-[10px] opacity-60">I più votati</span>
              </button>
            </div>
          </div>

          {/* Name input */}
          <div>
            <Label htmlFor="merge-name">Nome del nuovo catalogo</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  id="merge-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${catalogA.name} + ${catalogB.name}`}
                  className="pr-10"
                />
                <button
                  onClick={handleAiNaming}
                  disabled={namingLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-[#8a5aeb] transition-colors disabled:opacity-50"
                  title="Genera nome con AI"
                >
                  {namingLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-white/40 hover:text-white"
                onClick={() => setName(`${catalogA.name} + ${catalogB.name}`)}
                title="Ripristina nome predefinito"
              >
                ↺
              </Button>
            </div>
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
