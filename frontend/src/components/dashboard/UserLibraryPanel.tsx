'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { PosterImage } from '@/components/shared/PosterImage';
import { Button } from '@/components/ui/button';
import { generateId } from '@/lib/utils';
import { Loader2, Library, CheckSquare, Square, Trash2, ArrowUpDown, RefreshCw, EyeOff } from 'lucide-react';
import { MyList, Profile } from '@/types';

import { SyncLibraryModal } from '@/components/modals/SyncLibraryModal';
import { getCanonicalLibraryKey } from '@/lib/libraryCanonical';

interface UserLibraryPanelProps {
  profileId: string;
  userId: string;
  profile?: Profile;
  onUpdateProfile?: (id: string, updates: Partial<Profile>) => void;
  onCreateCatalog: (list: MyList) => void;
}

export function UserLibraryPanel({ profileId, userId, profile, onUpdateProfile, onCreateCatalog }: UserLibraryPanelProps) {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'custom' | 'date_desc' | 'date_asc' | 'name_asc'>('custom');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isRemovingWatched, setIsRemovingWatched] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [libraryOrder, setLibraryOrder] = useState<string[]>(profile?.raw_ui_state?.libraryOrder ?? []);

  useEffect(() => {
    if (profile?.raw_ui_state?.libraryOrder) {
      setLibraryOrder(profile.raw_ui_state.libraryOrder);
    }
  }, [profile?.raw_ui_state?.libraryOrder, profileId]);
  
  // Sync Modal State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncProcessing, setIsSyncProcessing] = useState(false);
  const [syncProcessingCount, setSyncProcessingCount] = useState<number | null>(null);

  const fetchLibrary = async () => {
    setIsLoading(true);
    try {
      const data = await api.getLibrary(profileId, userId);
      setItems(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [profileId, userId]);

  const handleSyncConfirm = async () => {
    if (!userId) return;
    setIsSyncProcessing(true);
    try {
      const res = await api.convertLibrary(profileId, userId);
      if (res && typeof res.processingCount === 'number') {
        setSyncProcessingCount(res.processingCount);
        // We wait a few seconds before closing to let the user read the count
        setTimeout(() => {
          setIsSyncModalOpen(false);
          setIsSyncProcessing(false);
          setSyncProcessingCount(null);
        }, 3000);
      } else {
        setIsSyncModalOpen(false);
        setIsSyncProcessing(false);
      }
    } catch (e) {
      console.error(e);
      alert("Errore nell'avvio della conversione");
      setIsSyncProcessing(false);
    }
  };

  const handleAdd = async (tmdbItem: any) => {
    const libraryItem = {
      id: `tmdb:${tmdbItem.id}`,
      type: tmdbItem.media_type || 'movie',
      name: tmdbItem.name || tmdbItem.title,
      poster: tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : tmdbItem.poster,
    };
    try {
      await api.addToLibrary(profileId, userId, libraryItem);
      fetchLibrary();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemove = async (itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.removeFromLibrary(profileId, userId, itemId);
      setItems(items.filter(i => i._id !== itemId));
      const newSel = new Set(selectedIds);
      newSel.delete(itemId);
      setSelectedIds(newSel);
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * "Rimuovi visti": prima l'anteprima dichiara quanti titoli visibili toccherà,
   * poi l'esecuzione rimuove esattamente quelle card (soft-delete + push Stremio).
   * Il conteggio è obbligatorio: nessuna azione parte senza conferma esplicita.
   */
  const handleRemoveWatched = async () => {
    if (!userId || isRemovingWatched) return;
    setIsRemovingWatched(true);
    try {
      const preview = await api.getWatchedLibraryPreview(profileId, userId);
      const previewCount = Number(preview?.count) || 0;
      if (previewCount === 0) {
        alert('Nessun titolo visto da rimuovere.');
        return;
      }
      const confirmed = confirm(
        `Rimuovere ${previewCount} titoli visti dalla libreria?\n\n` +
        'Spariranno anche i duplicati collegati. I titoli visti restano nella cronologia del profilo.'
      );
      if (!confirmed) return;

      const result = await api.removeWatchedLibrary(profileId, userId);
      await fetchLibrary();
      alert(`Rimossi ${result?.count ?? previewCount} titoli visti.`);
    } catch (e) {
      console.error('[UserLibraryPanel] Error removing watched items:', e);
      alert('Errore nella rimozione dei titoli visti');
    } finally {
      setIsRemovingWatched(false);
    }
  };

  const handleReorder = async (reorderedItems: any[]) => {
    const previousItems = items;
    const previousOrder = libraryOrder;
    const newOrder = reorderedItems.map(i => i._id || i.itemId);

    setItems(reorderedItems);
    setLibraryOrder(newOrder);
    if (onUpdateProfile && profile) {
      onUpdateProfile(profileId, {
        raw_ui_state: {
          ...profile.raw_ui_state,
          libraryOrder: newOrder,
        },
      });
    }

    try {
      await api.reorderLibrary(profileId, userId, newOrder);
    } catch (e) {
      console.error('[UserLibraryPanel] Error reordering library, rolling back:', e);
      setItems(previousItems);
      setLibraryOrder(previousOrder);
      if (onUpdateProfile && profile) {
        onUpdateProfile(profileId, {
          raw_ui_state: {
            ...profile.raw_ui_state,
            libraryOrder: previousOrder,
          },
        });
      }
    }
  };

  const handleDragStart = (index: number) => {
    if (isSelectionMode) return;
    setDragIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...sortedItems];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    if (sortMode !== 'custom') {
      setSortMode('custom');
    }
    handleReorder(reordered);
  };

  // Deduplica difensiva su chiave canonica: evita chiavi duplicate e render multipli
  // senza confondere film e serie con lo stesso ID numerico TMDB o variazioni di namespace.
  const uniqueItems = Array.from(
    items.reduce<Map<string, any>>((map, item) => {
      const key = getCanonicalLibraryKey(item);
      if (key && !map.has(key)) map.set(key, item);
      return map;
    }, new Map<string, any>()).values()
  );

  // I poster possono essere: URL assoluti (nostri o TMDB), path relativi alle nostre
  // route (/images/..., /api/...) oppure path TMDB (`/abc.jpg`): solo quest'ultimo va
  // completato con la base di TMDB, altrimenti l'immagine non carica (placeholder).
  const resolvePosterSrc = (poster?: string | null): string | null => {
    if (!poster) return null;
    if (poster.startsWith('http')) return poster;
    if (poster.startsWith('/images/') || poster.startsWith('/api/')) return poster;
    return poster.startsWith('/') ? `https://image.tmdb.org/t/p/w500${poster}` : poster;
  };

  const effectiveLibraryOrder = libraryOrder.length > 0
    ? libraryOrder
    : (profile?.raw_ui_state?.libraryOrder ?? []);
  const orderMap = new Map(effectiveLibraryOrder.map((id, i) => [id, i]));

  const sortedItems = [...uniqueItems].sort((a, b) => {
    if (sortMode === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortMode === 'date_asc') return new Date(a._ctime).getTime() - new Date(b._ctime).getTime();
    if (sortMode === 'date_desc') return new Date(b._ctime).getTime() - new Date(a._ctime).getTime();

    const aId = a._id || a.itemId;
    const bId = b._id || b.itemId;
    const aOrder = orderMap.get(aId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(bId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b._ctime).getTime() - new Date(a._ctime).getTime();
  });

  const toggleSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newSel = new Set(selectedIds);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    setSelectedIds(newSel);
  };

  const handleCreateCatalog = () => {
    const selectedItems = items.filter(i => selectedIds.has(i._id));
    if (selectedItems.length === 0) return;

    // determine type if all same, else mixed
    let type = selectedItems[0].type;
    if (selectedItems.some(i => i.type !== type)) type = 'movie'; // fallback

    const list: MyList = {
      id: `manual_${generateId()}`,
      name: "Catalogo Personalizzato",
      type,
      prompt: "",
      createdAt: Date.now(),
      filters: {
        queryBlocks: [
          {
            id: generateId(),
            strategy: 'manual_list',
            manualItems: selectedItems.map(i => ({
              tmdbId: String(i._id).split(':').pop(),
              type: i.type,
              title: i.name,
              poster: i.poster
            }))
          }
        ]
      }
    };
    onCreateCatalog(list);
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-marrow-deep flex items-center gap-2">
            <Library className="h-6 w-6 text-primary" />
            Libreria Utente
          </h2>
          <p className="text-xs text-marrow-light mt-1">Gestisci i contenuti aggiunti manualmente</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSyncModalOpen(true)}
            className="text-xs font-bold text-white border-primary/20 bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 min-h-[38px] touch-manipulation"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> 
            Converti in YACA
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isRemovingWatched}
            onClick={handleRemoveWatched}
            className="text-xs font-bold text-marrow-deep border-marrow-light/30 bg-white/80 hover:bg-white min-h-[38px] touch-manipulation"
          >
            {isRemovingWatched
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <EyeOff className="h-3.5 w-3.5 mr-1" />}
            Rimuovi visti
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode(s => {
              if (s === 'custom') return 'date_desc';
              if (s === 'date_desc') return 'name_asc';
              if (s === 'name_asc') return 'date_asc';
              return 'custom';
            })}
            className="text-xs font-bold text-marrow-deep border-marrow-light/30 bg-white/80 hover:bg-white min-h-[38px] touch-manipulation"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            Ordina: {sortMode === 'custom' ? 'Personalizzato' : sortMode === 'date_desc' ? 'Più Recenti' : sortMode === 'name_asc' ? 'A-Z' : 'Meno Recenti'}
          </Button>
          <Button
            variant={isSelectionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              if (isSelectionMode) setSelectedIds(new Set());
            }}
            className={`text-xs font-bold min-h-[38px] touch-manipulation ${isSelectionMode ? '' : 'text-marrow-deep border-marrow-light/30 bg-white/80 hover:bg-white'}`}
          >
            {isSelectionMode ? 'Annulla Selezione' : 'Seleziona Elementi'}
          </Button>
        </div>
      </div>

      <div className="glass-panel p-4 bg-white/60 border border-marrow-light/10 rounded-2xl">
        <h3 className="text-sm font-bold text-marrow-deep mb-3 uppercase tracking-wider">Aggiungi Elemento</h3>
        <AutocompleteSearch 
          placeholder="Cerca film o serie TV su TMDB..."
          searchFn={async (query) => {
            const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`).then(r => r.json());
            return {
              results: (res.results || []).map((r: any) => ({
                id: String(r.id),
                name: r.title || r.name,
                poster: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : null,
                media_type: r.media_type || 'movie'
              }))
            };
          }}
          layout="horizontal"
          onSelect={handleAdd} 
          existingItems={items} 
        />
      </div>

      {isSelectionMode && selectedIds.size > 0 && (
        <div className="sticky top-4 z-20 flex items-center justify-between glass-panel bg-primary/10 border-primary/20 p-4 rounded-xl shadow-lg">
          <span className="font-bold text-primary">{selectedIds.size} elementi selezionati</span>
          <Button size="sm" onClick={handleCreateCatalog} className="font-bold text-xs">
            Crea Catalogo da Selezione
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {sortedItems.map((item, index) => {
            const isSelected = selectedIds.has(item._id);
            return (
              <div
                key={item._id}
                draggable={!isSelectionMode}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => {
                  if (!isSelectionMode) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(index);
                }}
                onClick={() => isSelectionMode && toggleSelection(item._id)}
                className={`
                  relative group aspect-[2/3] rounded-xl overflow-hidden cursor-pointer transition-all duration-300
                  ${!isSelectionMode ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-xl' : ''}
                  ${isSelected ? 'ring-4 ring-primary shadow-lg shadow-primary/20 scale-[0.98]' : 'shadow-md'}
                `}
              >
                <PosterImage src={resolvePosterSrc(item.poster)} alt={item.name} />
                
                {isSelectionMode ? (
                  <div className="absolute inset-0 bg-black/20 flex p-2 items-start justify-end">
                    {isSelected ? (
                      <CheckSquare className="h-6 w-6 text-primary drop-shadow-md bg-white rounded-md" />
                    ) : (
                      <Square className="h-6 w-6 text-white drop-shadow-md" />
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => handleRemove(item._id, e)}
                      aria-label={`Rimuovi ${item.name}`}
                      className="sm:hidden absolute top-1.5 right-1.5 z-10 size-7 rounded-full bg-black/70 text-white/90 active:bg-destructive active:text-white flex items-center justify-center shadow-md touch-manipulation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="hidden sm:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center p-2">
                      <div className="text-center w-full">
                        <p className="text-white font-bold text-[10px] leading-tight mb-3 line-clamp-3 px-1">{item.name}</p>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-3 text-[10px] font-bold touch-manipulation"
                          onClick={(e) => handleRemove(item._id, e)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Rimuovi
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          
          {items.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center text-marrow-light/50">
              <Library className="h-12 w-12 mb-2" />
              <p className="font-bold">Libreria vuota</p>
            </div>
          )}
        </div>
      )}

      <SyncLibraryModal
        open={isSyncModalOpen}
        onOpenChange={(open) => {
          if (!isSyncProcessing) setIsSyncModalOpen(open);
        }}
        onConfirm={handleSyncConfirm}
        isProcessing={isSyncProcessing}
        processingCount={syncProcessingCount}
        onConversionFinished={fetchLibrary}
      />
    </div>
  );
}
