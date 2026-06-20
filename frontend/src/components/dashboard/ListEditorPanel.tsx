'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { UserList, UserListItem } from './ListManagerPanel';
import { 
  Search, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  ArrowLeft, 
  Save, 
  Film, 
  Tv, 
  Star,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface ListEditorPanelProps {
  list?: UserList | null; // null if creating a new one
  userId?: string;
  onSave: () => void;
  onCancel: () => void;
}

interface SearchResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

export function ListEditorPanel({ list, userId, onSave, onCancel }: ListEditorPanelProps) {
  const isEditing = !!list;
  const [name, setName] = useState(list?.name || '');
  const [type, setType] = useState<'movie' | 'series'>(list?.type || 'movie');
  const [items, setItems] = useState<UserListItem[]>(list?.items || []);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Search TMDB when query changes
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchTmdbMulti(searchQuery);
        if (res.results) {
          // Filter results based on list type (tv for series, movie for movie)
          const targetMediaType = type === 'series' ? 'tv' : 'movie';
          const filtered = (res.results as SearchResult[]).filter(
            item => item.media_type === targetMediaType
          );
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error('Error searching TMDB:', err);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, type]);

  // When type changes, clear items to avoid mixed list states, if creating a new list
  const handleTypeChange = (newType: 'movie' | 'series') => {
    if (isEditing) return; // Cannot change type when editing
    setType(newType);
    setItems([]);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleAddItem = (result: SearchResult) => {
    const exists = items.some(item => item.tmdbId === result.id);
    if (exists) return;

    const posterUrl = result.poster_path 
      ? `https://image.tmdb.org/t/p/w185${result.poster_path}` 
      : undefined;

    const newItem: UserListItem = {
      tmdbId: result.id,
      type: type,
      title: result.title || result.name || 'Senza Titolo',
      poster: posterUrl
    };

    setItems([...items, newItem]);
    // Do NOT clear searchQuery and searchResults so user can keep adding
  };

  const handleRemoveItem = (tmdbId: number) => {
    setItems(items.filter(item => item.tmdbId !== tmdbId));
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...items];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setItems(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Il nome della lista è obbligatorio.');
      return;
    }
    if (items.length === 0) {
      setError('Aggiungi almeno un elemento alla lista.');
      return;
    }
    setError('');
    setSaving(true);

    try {
      let res;
      if (isEditing && list) {
        res = await api.updateList(list.listId, {
          name: name.trim(),
          items,
          userId
        });
      } else {
        res = await api.createList({
          name: name.trim(),
          type,
          sourceType: 'manual_items',
          items,
          userId
        });
      }

      if (res.success) {
        onSave();
      } else {
        setError(res.error || 'Impossibile salvare la lista.');
      }
    } catch (err) {
      console.error(err);
      setError('Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editor Header */}
      <div className="flex items-center gap-3 border-b border-marrow-light/10 pb-4">
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-marrow-light rounded-xl hover:bg-marrow-light/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-col">
          <h2 className="font-black text-marrow-deep text-lg sm:text-xl leading-tight">
            {isEditing ? `Modifica "${list.name}"` : 'Crea Nuova Lista'}
          </h2>
          <span className="text-[10px] text-marrow-light font-bold uppercase tracking-wider">
            {isEditing ? 'Stai modificando una lista esistente' : 'Configura una lista di film o serie'}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left column: List Config & Search */}
        <div className="md:col-span-1 space-y-4">
          <div className="glass-panel p-5 bg-white/40 border border-marrow-light/10 rounded-2xl space-y-4">
            <h3 className="text-xs font-black text-marrow-deep uppercase tracking-wider">Configurazione</h3>
            
            {/* List name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-marrow-light uppercase tracking-wider">Nome Lista</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Commendie Anni 90..."
                className="bg-white/80 border-marrow-light/20 text-marrow-deep font-bold rounded-xl"
              />
            </div>

            {/* List Type (Disabled when editing) */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-marrow-light uppercase tracking-wider block">Tipo Lista</label>
              <div className={`flex p-1 rounded-xl border border-marrow-light/10 ${isEditing ? 'opacity-60 bg-white/10' : 'bg-white/40'}`}>
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => handleTypeChange('movie')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    type === 'movie'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-marrow-light hover:text-primary'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  FILM
                </button>
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => handleTypeChange('series')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    type === 'series'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-marrow-light hover:text-primary'
                  }`}
                >
                  <Tv className="h-4 w-4" />
                  SERIE TV
                </button>
              </div>
              {isEditing && (
                <p className="text-[10px] text-marrow-faded italic">
                  Non puoi cambiare la tipologia di una lista esistente.
                </p>
              )}
            </div>

            {/* Save / Cancel buttons */}
            <div className="pt-2 flex flex-col gap-2">
              <Button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full bg-primary text-white font-black hover:bg-primary/95 flex items-center justify-center gap-1.5 rounded-xl shadow-lg shadow-primary/20"
              >
                <Save className="h-4 w-4" />
                {saving ? 'SALVATAGGIO...' : 'SALVA LISTA'}
              </Button>
              <Button 
                variant="ghost" 
                onClick={onCancel} 
                className="w-full text-marrow-light font-black rounded-xl hover:bg-marrow-light/10"
              >
                ANNULLA
              </Button>
            </div>
            
            {error && <p className="text-xs text-red-500 font-bold text-center">{error}</p>}
          </div>

          {/* Search container */}
          <div className="glass-panel p-5 bg-white/40 border border-marrow-light/10 rounded-2xl space-y-4">
            <h3 className="text-xs font-black text-marrow-deep uppercase tracking-wider">Cerca su TMDB</h3>
            
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-marrow-light/60" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Cerca ${type === 'series' ? 'serie tv' : 'film'}...`}
                className="bg-white/80 pl-9 border-marrow-light/20 text-marrow-deep font-bold rounded-xl"
              />
            </div>

            {/* Search results overlay/panel */}
            {searching ? (
              <div className="py-4 text-center text-xs text-marrow-faded animate-pulse">Ricerca in corso...</div>
            ) : searchResults.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-marrow-light/5 pr-1 border border-marrow-light/10 rounded-xl bg-white/80 shadow-md">
                {searchResults.map((result) => {
                  const title = result.title || result.name || 'Senza Titolo';
                  const year = result.release_date || result.first_air_date 
                    ? (result.release_date || result.first_air_date)!.substring(0, 4) 
                    : '';
                  
                  return (
                    <div key={result.id} className="p-3 flex items-center justify-between gap-3 hover:bg-primary/5 transition-colors">
                      <div className="flex items-center gap-3">
                        {result.poster_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={`https://image.tmdb.org/t/p/w92${result.poster_path}`} 
                            alt={title}
                            className="w-8 h-12 object-cover rounded shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-12 bg-marrow-light/10 border border-marrow-light/10 rounded flex items-center justify-center shrink-0">
                            {type === 'series' ? <Tv className="h-4 w-4 text-marrow-light/40" /> : <Film className="h-4 w-4 text-marrow-light/40" />}
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-marrow-deep text-xs leading-snug line-clamp-2">{title}</span>
                          <div className="flex items-center gap-1.5 text-[9px] text-marrow-light font-bold">
                            {year && <span>{year}</span>}
                            {result.vote_average ? (
                              <span className="flex items-center gap-0.5 text-amber-500">
                                <Star className="h-2.5 w-2.5 fill-amber-500" />
                                {result.vote_average.toFixed(1)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        disabled={items.some(i => i.tmdbId === result.id)}
                        onClick={() => handleAddItem(result)}
                        className="bg-primary/10 text-primary font-black hover:bg-primary hover:text-white rounded-lg px-2 h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {items.some(i => i.tmdbId === result.id) ? 'Aggiunto' : 'Aggiungi'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <div className="py-4 text-center text-xs text-marrow-faded italic">Nessun risultato trovato per la tipologia scelta.</div>
            ) : null}
          </div>
        </div>

        {/* Right column: List Items details & order */}
        <div className="md:col-span-2 space-y-4">
          <div className="glass-panel p-5 bg-white/40 border border-marrow-light/10 rounded-2xl min-h-[400px] flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-marrow-light/5 pb-2">
                <h3 className="text-xs font-black text-marrow-deep uppercase tracking-wider">Elementi in Lista</h3>
                <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary py-0.5 px-2.5">
                  {items.length} {items.length === 1 ? 'elemento' : 'elementi'}
                </Badge>
              </div>

              {items.length === 0 ? (
                <div className="py-20 text-center text-marrow-faded italic text-sm">
                  La lista è vuota. Cerca dei titoli a sinistra e aggiungili.
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 max-h-[550px] overflow-y-auto p-2">
                  {items.map((item, index) => (
                    <div key={item.tmdbId} className="group/poster relative shrink-0 cursor-pointer">
                      {item.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={item.poster} 
                          alt={item.title}
                          className="h-[180px] w-[120px] rounded-lg object-cover shadow-md border border-marrow-light/10 transition-transform duration-300 group-hover/poster:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex flex-col h-[180px] w-[120px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20 p-2 text-center">
                          {type === 'series' ? <Tv className="h-6 w-6 mb-2 opacity-50" /> : <Film className="h-6 w-6 mb-2 opacity-50" />}
                          {item.title}
                        </div>
                      )}
                      
                      {/* Number Badge */}
                      <div className="absolute -top-2 -left-2 bg-primary text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10">
                        {index + 1}
                      </div>

                      {/* Overlay */}
                      <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100">
                        <p className="text-[11px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight mb-2">{item.title}</p>
                        <div className="flex items-center justify-between gap-1 w-full bg-black/40 rounded-lg p-1 backdrop-blur-sm">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={index === 0}
                            onClick={() => moveItem(index, 'up')}
                            className="h-6 w-6 text-white hover:text-primary hover:bg-white/20 disabled:opacity-30 rounded-md"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.tmdbId)}
                            className="h-6 w-6 text-white hover:text-red-400 hover:bg-white/20 rounded-md"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={index === items.length - 1}
                            onClick={() => moveItem(index, 'down')}
                            className="h-6 w-6 text-white hover:text-primary hover:bg-white/20 disabled:opacity-30 rounded-md"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
