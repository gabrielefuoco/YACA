'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { 
  Plus, 
  Trash2, 
  Copy, 
  GitMerge, 
  Edit, 
  Search, 
  Film, 
  Tv, 
  Sparkles, 
  ListMusic,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';

export interface UserListItem {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'series';
  title?: string;
  poster?: string;
}

export interface UserList {
  listId: string;
  name: string;
  type: 'movie' | 'series';
  sourceType: 'ai_prompt' | 'manual_filter' | 'manual_items' | 'merged';
  items?: UserListItem[];
  queries?: any[];
  presentation_strategy?: 'popularity' | 'interleave';
  updatedAt?: string;
}

interface ListManagerPanelProps {
  lists: UserList[];
  activeCatalogIds: string[];
  onRefresh: () => void;
  onEdit: (list: UserList) => void;
  onCreate: () => void;
  onActivate: (list: UserList) => void;
  onDeactivate: (listId: string) => void;
  currentProfileName: string;
}

export function ListManagerPanel({ 
  lists, 
  activeCatalogIds,
  onRefresh, 
  onEdit, 
  onCreate,
  onActivate,
  onDeactivate,
  currentProfileName
}: ListManagerPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'movie' | 'series'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [error, setError] = useState('');

  const filteredLists = useMemo(() => {
    return lists.filter(list => {
      const matchesSearch = list.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = selectedType === 'all' || list.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [lists, search, selectedType]);

  const handleSelect = (listId: string) => {
    setSelectedIds(prev => 
      prev.includes(listId) ? prev.filter(id => id !== listId) : [...prev, listId]
    );
  };

  const selectedLists = useMemo(() => {
    return lists.filter(l => selectedIds.includes(l.listId));
  }, [lists, selectedIds]);

  const canMerge = useMemo(() => {
    if (selectedLists.length < 2) return false;
    const firstType = selectedLists[0].type;
    return selectedLists.every(l => l.type === firstType);
  }, [selectedLists]);

  const handleDelete = async (listId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa lista?')) return;
    try {
      const res = await api.deleteList(listId);
      if (res.success) {
        onRefresh();
        setSelectedIds(prev => prev.filter(id => id !== listId));
      } else {
        alert(res.error || 'Impossibile eliminare la lista.');
      }
    } catch (err) {
      console.error(err);
      alert('Errore durante l\'eliminazione.');
    }
  };

  const handleClone = async (listId: string) => {
    try {
      const res = await api.cloneList(listId);
      if (res.success) {
        onRefresh();
      } else {
        alert(res.error || 'Impossibile clonare la lista.');
      }
    } catch (err) {
      console.error(err);
      alert('Errore durante la clonazione.');
    }
  };

  const handleMerge = async () => {
    if (!mergeName.trim()) {
      setError('Inserisci un nome per la lista unita.');
      return;
    }
    setError('');
    try {
      const res = await api.mergeLists({
        sourceListIds: selectedIds,
        targetListName: mergeName.trim()
      });
      if (res.success) {
        setIsMerging(false);
        setMergeName('');
        setSelectedIds([]);
        onRefresh();
      } else {
        setError(res.error || 'Impossibile unire le liste.');
      }
    } catch (err) {
      console.error(err);
      setError('Errore durante l\'unione delle liste.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button 
            onClick={onCreate} 
            className="bg-primary text-white font-black hover:bg-primary/95 flex items-center gap-1.5 rounded-xl shadow-lg shadow-primary/30"
          >
            <Plus className="h-4 w-4" />
            NUOVA LISTA
          </Button>
          {selectedIds.length > 0 && (
            <Button
              disabled={!canMerge}
              onClick={() => setIsMerging(true)}
              className="bg-accent text-white font-black hover:bg-accent/90 flex items-center gap-1.5 rounded-xl shadow-lg shadow-accent/30 disabled:opacity-50"
            >
              <GitMerge className="h-4 w-4" />
              FONDI SELEZIONATE ({selectedIds.length})
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1 justify-end">
          {/* Search bar */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-marrow-light/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca liste..."
              className="bg-white/60 pl-9 border-marrow-light/20 text-marrow-deep font-bold rounded-xl placeholder:text-marrow-light/40"
            />
          </div>

          {/* Type filters */}
          <div className="flex bg-white/40 p-1 rounded-xl border border-marrow-light/10">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${
                selectedType === 'all'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-marrow-light hover:text-primary'
              }`}
            >
              TUTTI
            </button>
            <button
              onClick={() => setSelectedType('movie')}
              className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                selectedType === 'movie'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-marrow-light hover:text-primary'
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              FILM
            </button>
            <button
              onClick={() => setSelectedType('series')}
              className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                selectedType === 'series'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-marrow-light hover:text-primary'
              }`}
            >
              <Tv className="h-3.5 w-3.5" />
              SERIE TV
            </button>
          </div>
        </div>
      </div>

      {/* Merge Dialog/UI overlay */}
      {isMerging && (
        <div className="glass-panel p-6 bg-accent/10 border border-accent/20 rounded-2xl space-y-4 animate-in fade-in-50 duration-300">
          <div className="flex items-center gap-2 text-accent font-black text-sm uppercase tracking-wider">
            <GitMerge className="h-5 w-5" />
            Fondi Liste Custom
          </div>
          <p className="text-xs text-marrow-deep font-medium">
            Unirai le seguenti liste: {selectedLists.map(l => `"${l.name}"`).join(', ')}. 
            Eventuali duplicati verranno rimossi automaticamente.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={mergeName}
              onChange={(e) => setMergeName(e.target.value)}
              placeholder="Nome della lista unita..."
              className="bg-white/80 border-accent/20 text-marrow-deep font-bold rounded-xl"
            />
            <div className="flex gap-2">
              <Button onClick={handleMerge} className="bg-accent text-white font-black rounded-xl">
                CONFERMA
              </Button>
              <Button onClick={() => setIsMerging(false)} variant="ghost" className="text-marrow-light font-black rounded-xl">
                ANNULLA
              </Button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
        </div>
      )}

      {/* Grid of lists */}
      {filteredLists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-marrow-faded glass-panel bg-white/20 border border-marrow-light/5 rounded-2xl">
          <ListMusic className="h-16 w-16 text-marrow-light/20 mb-3 animate-pulse" />
          <p className="font-black text-lg">Nessuna Lista Custom</p>
          <p className="text-xs font-semibold max-w-xs mt-1">
            Crea la tua prima lista manuale o usa il creatore AI per generarne una da un prompt.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredLists.map((list) => {
            const isChecked = selectedIds.includes(list.listId);
            const isActiveInProfile = activeCatalogIds.includes(list.listId);

            return (
              <div 
                key={list.listId}
                className={`glass-panel p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 ${
                  isChecked 
                    ? 'bg-primary/5 border-primary/40 shadow-lg shadow-primary/5 scale-[1.01]' 
                    : 'bg-white/40 border-marrow-light/10 hover:border-marrow-light/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Checkbox for merging */}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleSelect(list.listId)}
                      className="w-4 h-4 rounded text-primary border-marrow-light/30 focus:ring-primary/20 cursor-pointer animate-none"
                    />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-marrow-deep text-base sm:text-lg leading-snug">{list.name}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold py-0.5 px-2 bg-white/50 border-marrow-light/10 text-marrow-light shrink-0">
                          {list.type === 'series' ? 'Serie TV' : 'Film'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-marrow-light font-bold uppercase tracking-wider flex items-center gap-1">
                          {list.sourceType === 'ai_prompt' && (
                            <>
                              <Sparkles className="h-3 w-3 text-amber-500" />
                              Generata da AI
                            </>
                          )}
                          {list.sourceType === 'manual_items' && 'Manuale'}
                          {list.sourceType === 'merged' && (
                            <>
                              <GitMerge className="h-3 w-3 text-accent" />
                              Unione di Liste
                            </>
                          )}
                          {' • '}
                          {list.items?.length || 0} elementi
                        </span>
                        {isActiveInProfile && (
                          <Badge className="bg-green-500 text-white text-[9px] font-black uppercase py-0.5 px-2 rounded-lg flex items-center gap-1 shadow-sm shadow-green-500/20 shrink-0">
                            <Check className="h-2.5 w-2.5" />
                            Attiva su Stremio
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between border-t border-marrow-light/5 pt-3 mt-1">
                  {/* Activation Button */}
                  <div>
                    {isActiveInProfile ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDeactivate(list.listId)}
                        className="h-8 text-[10px] font-black text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 rounded-xl flex items-center gap-1"
                        title={`Disattiva da ${currentProfileName}`}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        DISATTIVA
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onActivate(list)}
                        className="h-8 text-[10px] font-black bg-green-600 text-white hover:bg-green-700 rounded-xl flex items-center gap-1 shadow-sm shadow-green-600/10"
                        title={`Attiva nel profilo "${currentProfileName}"`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        ATTIVA
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onEdit(list)}
                      className="h-8 w-8 text-marrow-light hover:text-primary hover:bg-primary/5 rounded-lg"
                      title="Modifica"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleClone(list.listId)}
                      className="h-8 w-8 text-marrow-light hover:text-accent hover:bg-accent/5 rounded-lg"
                      title="Clona"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(list.listId)}
                      className="h-8 w-8 text-marrow-light hover:text-red-500 hover:bg-red-500/5 rounded-lg"
                      title="Elimina"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
