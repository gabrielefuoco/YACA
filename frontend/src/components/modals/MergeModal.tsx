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
      <DialogContent className="sm:max-w-2xl bg-background border-marrow-light/20 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-marrow-deep tracking-tight">Smart Merge</DialogTitle>
              <DialogDescription className="text-marrow-light text-sm font-medium">
                Crea una lista intelligente unendo due cataloghi
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Catalogs comparison */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/40 border border-marrow-light/10 relative shadow-sm">
            <div className="flex-1 min-w-0 w-full sm:w-auto text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="text-lg">{catalogA.emoji ?? '📋'}</span>
                <span className="text-sm font-bold text-marrow-deep truncate">{catalogA.name}</span>
              </div>
              <TypeBadge type={catalogA.type} />
            </div>

            <div className="flex flex-col items-center justify-center px-2">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-black shadow-lg shadow-primary/30">
                +
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full sm:w-auto text-center sm:text-right">
              <div className="flex items-center justify-center sm:justify-end gap-2 mb-1">
                <span className="text-sm font-bold text-marrow-deep truncate">{catalogB.name}</span>
                <span className="text-lg">{catalogB.emoji ?? '📋'}</span>
              </div>
              <TypeBadge type={catalogB.type} />
            </div>
          </div>

          {/* Strategy configuration */}
          <div className="space-y-3">
            <Label className="text-[10px] uppercase tracking-widest text-marrow-light font-black ml-1">Strategia di Unione</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setStrategy('mixed')}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all relative overflow-hidden group ${strategy === 'mixed'
                  ? 'border-primary bg-primary/5 text-marrow-deep'
                  : 'border-marrow-light/10 bg-white/30 text-marrow-light hover:bg-white/50 hover:text-marrow-deep'
                  }`}
              >
                <div className={`mb-2 p-1.5 rounded-lg transition-colors ${strategy === 'mixed' ? 'bg-primary text-white' : 'bg-marrow-light/10 text-marrow-light group-hover:bg-primary/10 group-hover:text-primary'}`}>
                  <RotateCcw className="h-4 w-4" />
                </div>
                <span className="text-sm font-black uppercase tracking-tight">Misto</span>
                <span className="text-[11px] font-medium opacity-70 leading-tight mt-1 text-left">Alterna i titoli delle due liste (1 a 1)</span>
                {strategy === 'mixed' && <div className="absolute top-3 right-3"><div className="bg-primary rounded-full p-0.5"><Check className="h-3 w-3 text-white" strokeWidth={4} /></div></div>}
              </button>

              <button
                onClick={() => setStrategy('popularity')}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all relative overflow-hidden group ${strategy === 'popularity'
                  ? 'border-primary bg-primary/5 text-marrow-deep'
                  : 'border-marrow-light/10 bg-white/30 text-marrow-light hover:bg-white/50 hover:text-marrow-deep'
                  }`}
              >
                <div className={`mb-2 p-1.5 rounded-lg transition-colors ${strategy === 'popularity' ? 'bg-primary text-white' : 'bg-marrow-light/10 text-marrow-light group-hover:bg-primary/10 group-hover:text-primary'}`}>
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm font-black uppercase tracking-tight">Popolarità</span>
                <span className="text-[11px] font-medium opacity-70 leading-tight mt-1 text-left">Ordina per voto e popolarità globale</span>
                {strategy === 'popularity' && <div className="absolute top-3 right-3"><div className="bg-primary rounded-full p-0.5"><Check className="h-3 w-3 text-white" strokeWidth={4} /></div></div>}
              </button>
            </div>
          </div>

          {/* Name customization */}
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <Label htmlFor="merge-name" className="text-[10px] uppercase tracking-widest text-marrow-light font-black">Nome della Lista</Label>
              <button
                onClick={handleAiNaming}
                disabled={namingLoading}
                className="flex items-center gap-1.5 text-[10px] text-primary font-black tracking-wider hover:brightness-125 transition-all disabled:opacity-50"
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
                className="bg-white/40 border-marrow-light/10 focus:border-primary focus:ring-primary/20 h-11 px-4 text-sm rounded-xl font-bold text-marrow-deep"
              />
            </div>
          </div>

          {/* Preview Section */}
          <div className="space-y-3">
            <Label className="text-[10px] uppercase tracking-widest text-marrow-light font-black ml-1">Anteprima Risultati</Label>
            <div className="relative min-h-[140px] rounded-2xl bg-white/20 border border-marrow-light/10 p-4 overflow-hidden shadow-inner">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm z-10 transition-opacity">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-[10px] text-marrow-light font-black uppercase tracking-widest">Sincronizzazione...</span>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {previewItems.length > 0 ? (
                  previewItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex-shrink-0 group/poster">
                      <div className="relative h-36 w-24 rounded-xl overflow-hidden border border-marrow-light/10 group-hover/poster:border-primary transition-all shadow-sm">
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} className="h-full w-full object-cover group-hover/poster:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="h-full w-full bg-marrow-light/5 flex items-center justify-center text-[10px] text-marrow-light p-2 text-center font-bold">
                            {item.title}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-marrow-deep/60 via-transparent to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="w-full flex flex-col items-center justify-center py-8 text-marrow-light/30">
                    <p className="text-sm font-bold italic">Nessun titolo trovato</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 mt-2 pt-4 border-t border-marrow-light/10">
          <Button variant="ghost" onClick={onClose} className="hover:bg-marrow-light/5 text-marrow-light font-bold uppercase tracking-wider text-xs">
            Annulla
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-primary hover:bg-marrow-deep text-white px-8 h-10 font-black rounded-xl shadow-lg shadow-primary/20 uppercase tracking-wider text-xs transition-all hover:scale-105 active:scale-95"
          >
            Crea Lista Unita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
