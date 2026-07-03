'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { InlineTmdbSearch } from '@/components/shared/InlineTmdbSearch';
import { Button } from '@/components/ui/button';
import { generateId } from '@/lib/utils';
import { Loader2, Library, CheckSquare, Square, Trash2, ArrowUpDown } from 'lucide-react';
import { MyList } from '@/types';

interface UserLibraryPanelProps {
  profileId: string;
  userId: string;
  onCreateCatalog: (list: MyList) => void;
}

export function UserLibraryPanel({ profileId, userId, onCreateCatalog }: UserLibraryPanelProps) {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'date_desc' | 'date_asc' | 'name_asc'>('date_desc');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  
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

  const handleAdd = async (tmdbItem: any) => {
    const libraryItem = {
      id: `tmdb:${tmdbItem.media_type || 'movie'}:${tmdbItem.id}`,
      type: tmdbItem.media_type || 'movie',
      name: tmdbItem.name,
      poster: tmdbItem.poster,
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

  const handleReorder = async (reorderedItems: any[]) => {
    setItems(reorderedItems);
    try {
      await api.reorderLibrary(profileId, userId, reorderedItems.map(i => i._id));
    } catch (e) {
      console.error(e);
      fetchLibrary(); // revert on fail
    }
  };

  const handleDragStart = (index: number) => {
    if (isSelectionMode) return;
    setDragIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    handleReorder(reordered);
    setDragIndex(null);
  };

  const sortedItems = [...items].sort((a, b) => {
    if (sortMode === 'name_asc') return a.name.localeCompare(b.name);
    if (sortMode === 'date_asc') return new Date(a._ctime).getTime() - new Date(b._ctime).getTime();
    return 0; // date_desc is default from API and DB
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
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode(s => s === 'date_desc' ? 'name_asc' : s === 'name_asc' ? 'date_asc' : 'date_desc')}
            className="text-xs font-bold"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            Ordina: {sortMode === 'date_desc' ? 'Più Recenti' : sortMode === 'name_asc' ? 'A-Z' : 'Meno Recenti'}
          </Button>
          <Button
            variant={isSelectionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              if (isSelectionMode) setSelectedIds(new Set());
            }}
            className="text-xs font-bold"
          >
            {isSelectionMode ? 'Annulla Selezione' : 'Seleziona Elementi'}
          </Button>
        </div>
      </div>

      <div className="glass-panel p-4 bg-white/60 border border-marrow-light/10 rounded-2xl">
        <h3 className="text-sm font-bold text-marrow-deep mb-3 uppercase tracking-wider">Aggiungi Elemento</h3>
        <InlineTmdbSearch onSelect={handleAdd} existingItems={items} type="movie" />
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
                draggable={!isSelectionMode && sortMode === 'date_desc'}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => {
                  if (!isSelectionMode && sortMode === 'date_desc') e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(index);
                }}
                onClick={() => isSelectionMode && toggleSelection(item._id)}
                className={`
                  relative group aspect-[2/3] rounded-xl overflow-hidden cursor-pointer transition-all duration-300
                  ${!isSelectionMode && sortMode === 'date_desc' ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-xl' : ''}
                  ${isSelected ? 'ring-4 ring-primary shadow-lg shadow-primary/20 scale-[0.98]' : 'shadow-md'}
                `}
              >
                {item.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.poster} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-marrow-light/20 flex items-center justify-center p-2 text-center">
                    <span className="text-xs font-bold text-marrow-deep/50">{item.name}</span>
                  </div>
                )}
                
                {isSelectionMode ? (
                  <div className="absolute inset-0 bg-black/20 flex p-2 items-start justify-end">
                    {isSelected ? (
                      <CheckSquare className="h-6 w-6 text-primary drop-shadow-md bg-white rounded-md" />
                    ) : (
                      <Square className="h-6 w-6 text-white drop-shadow-md" />
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                    <div className="text-center w-full">
                      <p className="text-white font-bold text-[10px] leading-tight mb-3 line-clamp-3 px-1">{item.name}</p>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-3 text-[10px] font-bold"
                        onClick={(e) => handleRemove(item._id, e)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Rimuovi
                      </Button>
                    </div>
                  </div>
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
    </div>
  );
}
