'use client';
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Catalog } from '@/types';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { Loader2, Sparkles, Wand2, RotateCcw, Check } from 'lucide-react';
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
  const [strategy, setStrategy] = useState<'popularity' | 'mixed'>('mixed');
  const [loading, setLoading] = useState(false);
  const [namingLoading, setNamingLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<Array<{ id: string; title: string; poster?: string }>>([]);

  const handlePreview = useCallback(async () => {
    if (!catalogA || !catalogB) return;
    setLoading(true);
    try {
      const data = await api.previewCatalog({
        filters: {
          merge: {
            catalogs: [catalogA.id, catalogB.id],
            sourceFilters: [catalogA.filters, catalogB.filters],
            sourceTypes: [catalogA.type, catalogB.type],
            strategy,
          },
        },
        type: catalogA.type,
      });
      setPreviewItems(data.items ?? []);
    } catch { }
    setLoading(false);
  }, [catalogA, catalogB, strategy]);

  // Auto-preview when strategy changes
  useEffect(() => {
    if (open && catalogA && catalogB) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handlePreview();
    }
  }, [strategy, open, catalogA, catalogB, handlePreview]);

  if (!catalogA || !catalogB) return null;

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
        merge: {
          catalogs: [catalogA.id, catalogB.id],
          sourceFilters: [catalogA.filters, catalogB.filters],
          sourceTypes: [catalogA.type, catalogB.type],
          strategy,
        },
      },
    };
    onConfirm(merged);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl bg-[#0a0a0b] border-white/10 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-[#8a5aeb]/20 rounded-lg text-[#8a5aeb]">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white">Smart Merge</DialogTitle>
              <DialogDescription className="text-white/50 text-sm">
                Crea una lista intelligente unendo due cataloghi
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Catalogs comparison */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 relative">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{catalogA.emoji ?? '📋'}</span>
                <span className="text-sm font-semibold text-white truncate">{catalogA.name}</span>
              </div>
              <TypeBadge type={catalogA.type} />
            </div>

            <div className="flex flex-col items-center justify-center px-2">
              <div className="w-8 h-8 rounded-full bg-[#8a5aeb] flex items-center justify-center text-white font-bold shadow-lg shadow-[#8a5aeb]/20">
                +
              </div>
            </div>

            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center gap-2 justify-end mb-1">
                <span className="text-sm font-semibold text-white truncate">{catalogB.name}</span>
                <span className="text-lg">{catalogB.emoji ?? '📋'}</span>
              </div>
              <TypeBadge type={catalogB.type} />
            </div>
          </div>

          {/* Strategy configuration */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-white/40 font-bold ml-1">Strategia di Unione</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setStrategy('mixed')}
                className={`flex flex-col items-start p-4 rounded-xl border transition-all relative overflow-hidden group ${strategy === 'mixed'
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-white/5 bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white'
                  }`}
              >
                <div className={`mb-2 p-1.5 rounded-lg ${strategy === 'mixed' ? 'bg-primary text-white' : 'bg-white/10 text-white/40 group-hover:bg-white/20'}`}>
                  <RotateCcw className="h-4 w-4" />
                </div>
                <span className="text-sm font-bold">Misto</span>
                <span className="text-[11px] opacity-60 leading-tight mt-1">Alterna i titoli delle due liste (1 a 1)</span>
                {strategy === 'mixed' && <div className="absolute top-3 right-3"><Check className="h-4 w-4 text-primary" /></div>}
              </button>

              <button
                onClick={() => setStrategy('popularity')}
                className={`flex flex-col items-start p-4 rounded-xl border transition-all relative overflow-hidden group ${strategy === 'popularity'
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-white/5 bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white'
                  }`}
              >
                <div className={`mb-2 p-1.5 rounded-lg ${strategy === 'popularity' ? 'bg-primary text-white' : 'bg-white/10 text-white/40 group-hover:bg-white/20'}`}>
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm font-bold">Popolarità</span>
                <span className="text-[11px] opacity-60 leading-tight mt-1">Ordina per voto e popolarità globale</span>
                {strategy === 'popularity' && <div className="absolute top-3 right-3"><Check className="h-4 w-4 text-primary" /></div>}
              </button>
            </div>
          </div>

          {/* Name customization */}
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <Label htmlFor="merge-name" className="text-xs uppercase tracking-wider text-white/40 font-bold">Nome della Lista</Label>
              <button
                onClick={handleAiNaming}
                disabled={namingLoading}
                className="flex items-center gap-1.5 text-[11px] text-primary font-bold hover:brightness-125 transition-all disabled:opacity-50"
              >
                {namingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                GENERA CON AI
              </button>
            </div>
            <div className="relative group">
              <Input
                id="merge-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${catalogA.name} + ${catalogB.name}`}
                className="bg-white/[0.03] border-white/10 focus:border-primary h-11 px-4 text-sm rounded-xl"
              />
            </div>
          </div>

          {/* Preview Section */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-white/40 font-bold ml-1">Anteprima Risultati</Label>
            <div className="relative min-h-[140px] rounded-xl bg-black/40 border border-white/5 p-4 overflow-hidden">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10 transition-opacity">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-[10px] text-white/50 uppercase tracking-widest">Sincronizzazione...</span>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {previewItems.length > 0 ? (
                  previewItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex-shrink-0 group/poster">
                      <div className="relative h-36 w-24 rounded-lg overflow-hidden border border-white/10 group-hover/poster:border-primary/50 transition-all">
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} className="h-full w-full object-cover group-hover/poster:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="h-full w-full bg-white/5 flex items-center justify-center text-[10px] text-white/20 p-2 text-center font-medium">
                            {item.title}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="w-full flex flex-col items-center justify-center py-8 text-white/20">
                    <p className="text-sm italic">Nessun titolo trovato</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-0 mt-2 pt-4 border-t border-white/5">
          <Button variant="ghost" onClick={onClose} className="hover:bg-white/5 text-white/70">
            Annulla
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary-dark text-white px-8 font-bold rounded-xl shadow-lg shadow-primary/20"
          >
            Crea Lista Unita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
