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
      <DialogContent className="sm:max-w-2xl bg-background-light border-marrow-light/30 shadow-2xl p-0 overflow-hidden max-h-[95vh] flex flex-col">
        {/* Modern Header */}
        <DialogHeader className="p-6 sm:p-8 bg-white/40 border-b border-marrow-light/10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary rounded-2xl text-white shadow-lg shadow-primary/20">
              <Wand2 className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <DialogTitle className="text-2xl font-black text-marrow-deep tracking-tight leading-none mb-1">Smart Merge</DialogTitle>
              <DialogDescription className="text-marrow-light/70 text-sm font-medium">
                Crea una lista intelligente unendo due cataloghi
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 scrollbar-hide">
          {/* Catalogs comparison (High Contrast) */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-3xl bg-white/80 border-2 border-marrow-light/10 shadow-sm relative">
            <div className="flex-1 min-w-0 w-full text-center md:text-left space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <span className="text-2xl">{catalogA.emoji ?? '📋'}</span>
                <span className="text-base font-black text-marrow-deep truncate">{catalogA.name}</span>
              </div>
              <TypeBadge type={catalogA.type} />
            </div>

            <div className="flex shrink-0">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-black text-xl shadow-xl shadow-primary/30 ring-4 ring-white">
                +
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full text-center md:text-right space-y-2">
              <div className="flex items-center justify-center md:justify-end gap-2 mb-1">
                <span className="text-base font-black text-marrow-deep truncate">{catalogB.name}</span>
                <span className="text-2xl">{catalogB.emoji ?? '📋'}</span>
              </div>
              <TypeBadge type={catalogB.type} />
            </div>
          </div>

          {/* Strategy Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 ml-1">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <Label className="text-xs uppercase tracking-[0.2em] text-marrow-light font-black">Strategia di Unione</Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setStrategy('mixed')}
                className={`flex flex-col items-start p-5 rounded-2xl border-2 transition-all relative overflow-hidden group ${strategy === 'mixed'
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-marrow-light/10 bg-white/60 text-marrow-light hover:border-primary/40 hover:bg-white/90'
                  }`}
              >
                <div className={`mb-3 p-2 rounded-xl transition-colors ${strategy === 'mixed' ? 'bg-primary text-white' : 'bg-marrow-light/10 text-marrow-light'}`}>
                  <RotateCcw className="h-5 w-5" />
                </div>
                <span className={`text-sm font-black uppercase tracking-tight ${strategy === 'mixed' ? 'text-primary' : 'text-marrow-deep'}`}>Misto</span>
                <span className="text-[12px] font-medium opacity-80 leading-snug mt-1.5 text-left">Alterna i titoli delle due liste (1 a 1)</span>
                {strategy === 'mixed' && (
                  <div className="absolute top-4 right-4 bg-primary rounded-full p-1 shadow-sm">
                    <Check className="h-3 w-3 text-white" strokeWidth={5} />
                  </div>
                )}
              </button>

              <button
                onClick={() => setStrategy('popularity')}
                className={`flex flex-col items-start p-5 rounded-2xl border-2 transition-all relative overflow-hidden group ${strategy === 'popularity'
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-marrow-light/10 bg-white/60 text-marrow-light hover:border-primary/40 hover:bg-white/90'
                  }`}
              >
                <div className={`mb-3 p-2 rounded-xl transition-colors ${strategy === 'popularity' ? 'bg-primary text-white' : 'bg-marrow-light/10 text-marrow-light'}`}>
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className={`text-sm font-black uppercase tracking-tight ${strategy === 'popularity' ? 'text-primary' : 'text-marrow-deep'}`}>Popolarità</span>
                <span className="text-[12px] font-medium opacity-80 leading-snug mt-1.5 text-left">Ordina per voto e popolarità globale</span>
                {strategy === 'popularity' && (
                  <div className="absolute top-4 right-4 bg-primary rounded-full p-1 shadow-sm">
                    <Check className="h-3 w-3 text-white" strokeWidth={5} />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Name Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between ml-1">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <Label htmlFor="merge-name" className="text-xs uppercase tracking-[0.2em] text-marrow-light font-black">Titolo Lista Unita</Label>
              </div>
              <button
                onClick={handleAiNaming}
                disabled={namingLoading}
                className="flex items-center gap-2 text-[11px] text-primary font-black tracking-wider hover:brightness-110 transition-all disabled:opacity-50 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10"
              >
                {namingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                GENERA CON AI
              </button>
            </div>
            <div className="relative group">
              <Input
                id="merge-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${catalogA.name} + ${catalogB.name}`}
                className="bg-white/80 border-2 border-marrow-light/10 focus:border-primary focus:ring-4 focus:ring-primary/5 h-14 px-5 text-base rounded-2xl font-bold text-marrow-deep placeholder:text-marrow-light/30 shadow-sm"
              />
            </div>
          </div>

          {/* Result Preview (Modern) */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 ml-1">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <Label className="text-xs uppercase tracking-[0.2em] text-marrow-light font-black">Visual Anteprima</Label>
            </div>
            <div className="relative min-h-[160px] rounded-3xl bg-white/60 border-2 border-marrow-light/10 p-5 overflow-hidden shadow-inner">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-md z-10">
                  <div className="flex flex-col items-center gap-3">
                    <div className="size-10 bg-primary/5 rounded-full flex items-center justify-center">
                       <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                    <span className="text-[10px] text-marrow-light font-black uppercase tracking-[0.3em]">Processing...</span>
                  </div>
                </div>
              )}

              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {previewItems.length > 0 ? (
                  previewItems.slice(0, 12).map((item) => (
                    <div key={item.id} className="flex-shrink-0 group/poster">
                      <div className="relative h-44 w-28 rounded-2xl overflow-hidden border-2 border-marrow-light/10 group-hover/poster:border-primary transition-all shadow-md group-hover/poster:shadow-lg group-hover/poster:-translate-y-1">
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} className="h-full w-full object-cover transition-transform duration-700 group-hover/poster:scale-110" />
                        ) : (
                          <div className="h-full w-full bg-marrow-light/5 flex items-center justify-center text-[10px] text-marrow-light p-3 text-center font-bold">
                            {item.title}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-marrow-deep via-transparent to-transparent opacity-0 group-hover/poster:opacity-40 transition-opacity" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="w-full flex flex-col items-center justify-center py-12 text-marrow-light/20">
                    <p className="text-base font-bold italic">Nessun titolo disponibile</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* High-Contrast Footer */}
        <DialogFooter className="p-6 sm:p-8 bg-white/60 border-t border-marrow-light/10 flex flex-col-reverse sm:flex-row gap-4">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            className="h-12 px-6 hover:bg-primary/5 text-marrow-light font-black uppercase tracking-[0.15em] text-xs transition-all"
          >
            Cancella
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-primary hover:bg-marrow-deep text-white px-10 h-12 font-black rounded-2xl shadow-xl shadow-primary/20 uppercase tracking-[0.15em] text-xs transition-all hover:scale-[1.03] active:scale-95 flex items-center gap-2"
          >
            <span>Genera Lista</span>
            <Check className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
