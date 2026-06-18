'use client';
import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { PosterRow } from '@/components/shared/PosterRow';
import { Catalog, QueryBlock } from '@/types';
import { GENRE_NAMES, SORT_OPTIONS, LANGUAGES } from '@/lib/constants';
import { Loader2, Wand2, Save, X, Eye, Plus, Layers, Info, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { generateId } from '@/lib/utils';

const MAX_AI_CATALOG_NAME_LENGTH = 30;

interface CreatorPanelProps {
  onAddCatalog: (catalog: Catalog) => void;
  editCatalog?: Catalog;
  onCancel?: () => void;
}

interface SelectedItem {
  id: string;
  name: string;
}

interface BlockState {
  id: string;
  strategy: 'discovery' | 'multi_search' | 'similar' | 'ai';
  aiPrompt?: string;
  aiLoading?: boolean;
  similarTo?: string;
  textSearch?: string;
  sortBy: string;
  language: string;
  genres: string[];
  keywords: SelectedItem[];
  cast: SelectedItem[];
  crew: SelectedItem[];
  voteMin: number;
  voteMax: number;
  yearFrom: string;
  yearTo: string;
  withoutGenres: string[];
  withoutKeywords: SelectedItem[];
  certificationLte: string;
  runtimeGte: string;
  runtimeLte: string;
  collapsed: boolean;
}

function createEmptyBlock(): BlockState {
  return {
    id: generateId(),
    strategy: 'discovery',
    aiPrompt: '',
    aiLoading: false,
    similarTo: '',
    textSearch: '',
    sortBy: 'popularity.desc',
    language: '',
    genres: [],
    keywords: [],
    cast: [],
    crew: [],
    voteMin: 0,
    voteMax: 10,
    yearFrom: '',
    yearTo: '',
    withoutGenres: [],
    withoutKeywords: [],
    certificationLte: '',
    runtimeGte: '',
    runtimeLte: '',
    collapsed: false,
  };
}

const parseList = (val: unknown) => {
  if (!val) return [];
  return String(val).replace(/\|/g, ',').split(',').map(s => s.trim()).filter(Boolean);
};

const mapToPills = (val: unknown, prefix: string) => parseList(val).map(id => ({ id, name: `${prefix}: ${id}` }));

export function CreatorPanel({ onAddCatalog, editCatalog, onCancel }: CreatorPanelProps) {
  // Global state
  const [name, setName] = useState('');
  const [type, setType] = useState<'movie' | 'series'>('movie');
  const [presentationStrategy, setPresentationStrategy] = useState<'popularity' | 'interleave'>('popularity');

  // Block state
  const [blocks, setBlocks] = useState<BlockState[]>([]);

  const [previewFilters, setPreviewFilters] = useState<Record<string, unknown> | null>(null);
  const [previewType, setPreviewType] = useState<'movie' | 'series'>('movie');
  const [saved, setSaved] = useState(false);

  // Convert API filters to a BlockState
  const filtersToBlock = useCallback((f: Record<string, unknown>): BlockState => {
    let kws: SelectedItem[];
    const keywordNames = f._keywordNames as string | undefined;
    if (keywordNames) {
      const names = keywordNames.replace(/\|/g, ',').split(',').map(s => s.trim()).filter(Boolean);
      const ids = parseList(f.with_keywords);
      kws = names.map((n, i) => ({ id: ids[i] || n, name: n }));
    } else if (f.with_keywords) {
      kws = mapToPills(f.with_keywords, 'Keyword');
    } else if (f.keyword) {
      kws = parseList(f.keyword).map(name => ({ id: name, name }));
    } else {
      kws = [];
    }

    const dateGte = (f['primary_release_date.gte'] as string) || (f['first_air_date.gte'] as string);
    const dateLte = (f['primary_release_date.lte'] as string) || (f['first_air_date.lte'] as string);
    const cast = mapToPills(f.with_cast, 'Cast');
    const crew = mapToPills(f.with_crew, 'Crew');
    const people = mapToPills(f.with_people, 'Persona');
    const shouldUsePeopleForCast = cast.length === 0 && people.length > 0;
    
    let withoutKws: SelectedItem[] = [];
    if (f.without_keywords) {
      withoutKws = mapToPills(f.without_keywords, 'Escluso');
    }

    return {
      id: generateId(),
      strategy: (f.strategy as BlockState['strategy']) || 'discovery',
      similarTo: (f.similar_to as string) || '',
      textSearch: (f.text_search as string) || '',
      sortBy: (f.sort_by as string) || 'popularity.desc',
      language: (f.with_original_language as string) || (f.original_language as string) || '',
      genres: parseList(f.with_genres ?? f.genre_ids),
      keywords: kws,
      cast: shouldUsePeopleForCast ? people : cast,
      crew,
      voteMin: Number(f['vote_average.gte']) || 0,
      voteMax: Number(f['vote_average.lte']) || 10,
      yearFrom: (f.year_from as string) || (dateGte ? dateGte.substring(0, 4) : ''),
      yearTo: (f.year_to as string) || (dateLte ? dateLte.substring(0, 4) : ''),
      withoutGenres: parseList(f.without_genres ?? f.without_genre_ids),
      withoutKeywords: withoutKws,
      certificationLte: (f['certification.lte'] as string) || (f.certification_lte as string) || '',
      runtimeGte: f['with_runtime.gte'] ? String(f['with_runtime.gte']) : (f.runtime_gte ? String(f.runtime_gte) : ''),
      runtimeLte: f['with_runtime.lte'] ? String(f['with_runtime.lte']) : (f.runtime_lte ? String(f.runtime_lte) : ''),
      collapsed: false,
    };
  }, []);

  // Load editCatalog if provided
  useEffect(() => {
    if (editCatalog) {
      setName(editCatalog.name || '');
      setType(editCatalog.type || 'movie');
      setPresentationStrategy(editCatalog.presentation_strategy || 'popularity');

      let initialBlocks: BlockState[] = [];
      if (editCatalog.queries && editCatalog.queries.length > 0) {
        initialBlocks = editCatalog.queries.map(q => filtersToBlock(q));
      } else if (editCatalog.filters) {
        const rawFilters = editCatalog.filters;
        const qArr = Array.isArray(rawFilters.queries) ? rawFilters.queries : [];
        if (qArr.length > 0) {
          initialBlocks = qArr.map(q => filtersToBlock(q as Record<string, unknown>));
        } else {
          initialBlocks = [filtersToBlock(rawFilters)];
        }
      }

      if (initialBlocks.length === 0) {
        initialBlocks = [createEmptyBlock()];
      }
      setBlocks(initialBlocks);
    } else {
      setName('');
      setType('movie');
      setPresentationStrategy('popularity');
      setBlocks([createEmptyBlock()]);
      setPreviewFilters(null);
    }
  }, [editCatalog, filtersToBlock]);

  // --- Block helpers ---
  const updateBlock = useCallback((blockId: string, patch: Partial<BlockState>) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...patch } : b));
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.length > 1 ? prev.filter(b => b.id !== blockId) : prev);
  }, []);

  const addBlock = useCallback(() => {
    setBlocks(prev => [...prev, createEmptyBlock()]);
  }, []);

  const toggleBlockGenre = useCallback((blockId: string, genreId: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const genres = b.genres.includes(genreId) ? b.genres.filter(g => g !== genreId) : [...b.genres, genreId];
      return { ...b, genres };
    }));
  }, []);

  const toggleBlockItem = useCallback((blockId: string, field: 'keywords' | 'cast' | 'crew' | 'withoutKeywords', item: SelectedItem) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const list = b[field] as SelectedItem[];
      const exists = list.find(x => x.id === item.id);
      return { ...b, [field]: exists ? list.filter(x => x.id !== item.id) : [...list, item] };
    }));
  }, []);

  const toggleBlockWithoutGenre = useCallback((blockId: string, genreId: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const withoutGenres = b.withoutGenres.includes(genreId) ? b.withoutGenres.filter(g => g !== genreId) : [...b.withoutGenres, genreId];
      return { ...b, withoutGenres };
    }));
  }, []);

  // --- AI Generation ---
  const handleAiGenerateBlock = async (blockId: string, promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    updateBlock(blockId, { aiLoading: true });
    try {
      const result = await api.previewCatalog({ prompt: trimmed, type });
      const aiType = result?.type === 'series' ? 'series' as const : 'movie' as const;
      setType(aiType);
      setPreviewType(aiType);
      if (!name) {
          setName(result?.name || trimmed.slice(0, MAX_AI_CATALOG_NAME_LENGTH));
      }

      // Support multi-query AI response, including nested payloads in filters.queries
      const rawFilters = result?.filters as Record<string, unknown> | undefined;
      const extractedQueries: Record<string, unknown>[] = Array.isArray(result?.queries)
        ? result.queries as Record<string, unknown>[]
        : Array.isArray(rawFilters?.queries)
          ? rawFilters.queries as Record<string, unknown>[]
          : rawFilters ? [rawFilters] : [];

      if (extractedQueries.length > 0) {
        const newBlocks = extractedQueries.map(q => filtersToBlock(q));
        setBlocks(prev => {
          const index = prev.findIndex(b => b.id === blockId);
          if (index === -1) return prev;
          const before = prev.slice(0, index);
          const after = prev.slice(index + 1);
          return [...before, ...newBlocks, ...after];
        });
        // Preview using normalized filters from the first UI block
        setPreviewFilters(buildFiltersFromBlock(newBlocks[0]));

        if (result?.presentation_strategy === 'interleave') {
          setPresentationStrategy('interleave');
        }
      }
    } catch (e) { console.error('AI generation failed:', e); }
    updateBlock(blockId, { aiLoading: false });
  };

  // --- Build query blocks for save ---
  const buildQueryBlock = (block: BlockState): QueryBlock => {
    const dateKey = type === 'series' ? 'first_air_date' : 'primary_release_date';
    return {
      strategy: block.strategy === 'ai' ? 'discovery' : block.strategy,
      ...(block.similarTo && { similar_to: block.similarTo }),
      ...(block.textSearch && { text_search: block.textSearch }),
      sort_by: block.sortBy,
      ...(block.language && { with_original_language: block.language }),
      ...(block.genres.length && { with_genres: block.genres.join(',') }),
      ...(block.keywords.length && { with_keywords: block.keywords.map(k => k.id).join('|') }),
      ...(block.cast.length && { with_cast: block.cast.map(c => c.id).join(',') }),
      ...(block.crew.length && { with_crew: block.crew.map(c => c.id).join(',') }),
      ...(block.voteMin > 0 && { 'vote_average.gte': block.voteMin }),
      ...(block.voteMax < 10 && { 'vote_average.lte': block.voteMax }),
      ...(block.yearFrom && { [`${dateKey}.gte`]: `${block.yearFrom}-01-01` }),
      ...(block.yearTo && { [`${dateKey}.lte`]: `${block.yearTo}-12-31` }),
      ...(block.withoutGenres.length && { without_genres: block.withoutGenres.join(',') }),
      ...(block.withoutKeywords.length && { without_keywords: block.withoutKeywords.map(k => k.id).join('|') }),
      ...(block.certificationLte && { 'certification.lte': block.certificationLte }),
      ...(block.runtimeGte && { 'with_runtime.gte': Number(block.runtimeGte) }),
      ...(block.runtimeLte && { 'with_runtime.lte': Number(block.runtimeLte) }),
    };
  };

  // Build a flat filters object from a block (for preview backward compat)
  const buildFiltersFromBlock = (block: BlockState): Record<string, unknown> => buildQueryBlock(block) as Record<string, unknown>;

  const handleManualPreview = useCallback(() => {
    if (blocks.length === 0) return;
    // For multi-query, send all queries so the backend processes them via universal pipeline
    if (blocks.length > 1) {
      const queries = blocks.map(buildQueryBlock);
      setPreviewFilters({ queries, presentation_strategy: presentationStrategy });
    } else {
      setPreviewFilters(buildFiltersFromBlock(blocks[0]));
    }
    setPreviewType(type);
  }, [blocks, type, presentationStrategy]);

  // Auto-update global preview when presentation or type changes
  useEffect(() => {
    if (previewFilters) {
      handleManualPreview();
    }
  }, [presentationStrategy, type]);

  const handleSave = () => {
    const queries = blocks.map(buildQueryBlock);
    const catalog: Catalog = {
      id: editCatalog ? editCatalog.id : generateId(),
      name: name || 'Catalogo Personalizzato',
      type,
      source: editCatalog ? editCatalog.source : 'manual',
      queries,
      presentation_strategy: presentationStrategy,
      // For multi-query: put queries[] in filters so the backend normalizer picks them up
      // For single-query: flatten the block as a simple filters object
      filters: blocks.length > 1
        ? { queries, presentation_strategy: presentationStrategy }
        : buildFiltersFromBlock(blocks[0]),
      emoji: editCatalog ? editCatalog.emoji : '🎨',
    };
    onAddCatalog(catalog);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // --- Shared UI pieces ---
  const renderPills = (items: SelectedItem[], onRemove: (item: SelectedItem) => void) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map(item => (
        <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold border border-primary/20">
          {item.name}
          <button onClick={() => onRemove(item)} className="text-primary/70 hover:text-primary ml-0.5 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );

  const chevronSvg = (
    <span className="transition group-open:rotate-180">
      <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
    </span>
  );

  // --- Render a single query block card ---
  const renderBlock = (block: BlockState, index: number) => (
    <div key={block.id} className="rounded-xl border border-marrow-light/20 bg-white/40 shadow-sm overflow-hidden ">
      {/* Block header – clickable to collapse/expand */}
      <button
        type="button"
        onClick={() => updateBlock(block.id, { collapsed: !block.collapsed })}
        className="w-full flex items-center justify-between px-3 sm:px-5 py-2 sm:py-3 bg-primary-dark/5 select-none hover:bg-primary-dark/10 transition-colors"
      >
        <span className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black text-marrow-deep uppercase tracking-wider">
          <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          Query {index + 1}
          <span className="text-[10px] sm:text-xs font-medium normal-case text-marrow-light/70 hidden sm:inline">
            — {block.strategy === 'ai' ? 'Genera con AI' : block.strategy === 'discovery' ? 'Discovery (Filtri)' : block.strategy === 'similar' ? 'Simili a...' : 'Ricerca Testuale'}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {blocks.length > 1 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); removeBlock(block.id); } }}
              className="text-marrow-faded hover:text-destructive transition-colors p-0.5 rounded"
              title="Rimuovi query"
            >
              <X className="h-4 w-4" />
            </span>
          )}
          <span className={`transition-transform ${block.collapsed ? '' : 'rotate-180'} text-marrow-light/40`}>
            <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="20"><path d="M6 9l6 6 6-6"></path></svg>
          </span>
        </span>
      </button>

      {/* Block body */}
      {!block.collapsed && (
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-5">
          {/* Strategy selector and inputs */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <Label className="text-marrow-deep font-black uppercase tracking-wide text-[10px] block mb-1.5 sm:mb-2">Strategia</Label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); updateBlock(block.id, { strategy: 'ai' }); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                    block.strategy === 'ai'
                    ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' 
                    : 'bg-white/60 border-marrow-light/10 text-marrow-light hover:text-primary hover:border-primary/30'
                  }`}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Genera con AI
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); updateBlock(block.id, { strategy: 'discovery' }); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                    block.strategy === 'discovery'
                    ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' 
                    : 'bg-white/60 border-marrow-light/10 text-marrow-light hover:text-primary hover:border-primary/30'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Discovery
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); updateBlock(block.id, { strategy: 'similar' }); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                    block.strategy === 'similar'
                    ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' 
                    : 'bg-white/60 border-marrow-light/10 text-marrow-light hover:text-primary hover:border-primary/30'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Simili a...
                </button>
              </div>
            </div>

            {block.strategy === 'ai' && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 mt-3">
                <p className="text-xs text-marrow-light font-medium">
                  Descrivi il catalogo che vuoi creare. L&apos;AI interpreterà la tua richiesta e configurerà questo blocco per te.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={block.aiPrompt || ''}
                    onChange={(e) => updateBlock(block.id, { aiPrompt: e.target.value })}
                    placeholder="es. Film horror italiani degli anni 80..."
                    className="flex-1 bg-white border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerateBlock(block.id, block.aiPrompt || ''); } }}
                  />
                  <Button onClick={(e) => { e.preventDefault(); handleAiGenerateBlock(block.id, block.aiPrompt || ''); }} disabled={block.aiLoading || !block.aiPrompt?.trim()} className="shrink-0 bg-primary text-white hover:brightness-110">
                    {block.aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Genera
                  </Button>
                </div>
              </div>
            )}

            {block.strategy === 'similar' && (
              <div>
                <Label className="text-marrow-deep font-black uppercase tracking-wide text-[10px]">Titolo di Riferimento</Label>
                <Input value={block.similarTo || ''} onChange={(e) => updateBlock(block.id, { similarTo: e.target.value })} placeholder="es. Bridgerton" className="mt-1 bg-white/60 border-marrow-light/10 text-marrow-deep font-black placeholder:text-marrow-light/40" />
              </div>
            )}

            {block.strategy === 'multi_search' && (
              <div>
                <Label className="text-marrow-deep font-black uppercase tracking-wide text-[10px]">Titolo da Cercare</Label>
                <Input value={block.textSearch || ''} onChange={(e) => updateBlock(block.id, { textSearch: e.target.value })} placeholder="es. The Matrix" className="mt-1 bg-white/60 border-marrow-light/10 text-marrow-deep font-black placeholder:text-marrow-light/40" />
              </div>
            )}
          </div>

          {block.strategy !== 'ai' && (
            <>
          {/* Basic filters */}
          <details className="group [&_summary::-webkit-details-marker]:hidden" open>
            <summary className="flex cursor-pointer items-center justify-between font-black text-[10px] text-marrow-light select-none uppercase tracking-widest">
              Filtri di Base
              {chevronSvg}
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-tight text-marrow-light/70">Ordina per</Label>
                  <Select value={block.sortBy} onValueChange={(v) => updateBlock(block.id, { sortBy: v })}>
                    <SelectTrigger className="mt-1 bg-white/60 border-marrow-light/10 text-marrow-deep font-bold text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-tight text-marrow-light/70">Lingua originale</Label>
                  <Select value={block.language || '__any'} onValueChange={(v) => updateBlock(block.id, { language: v === '__any' ? '' : v })}>
                    <SelectTrigger className="mt-1 bg-white/60 border-marrow-light/10 text-marrow-deep font-bold text-xs">
                      <SelectValue placeholder="Qualsiasi" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value || '__any'} value={l.value || '__any'}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block text-xs font-bold text-marrow-deep">Voto minimo: {block.voteMin > 0 ? block.voteMin.toFixed(1) : 'Qualsiasi'}</Label>
                  <div className="px-2">
                    <Slider min={0} max={9} step={0.5} value={[block.voteMin]} onValueChange={([v]) => updateBlock(block.id, { voteMin: v })} />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-bold text-marrow-deep">Voto massimo: {block.voteMax < 10 ? block.voteMax.toFixed(1) : 'Qualsiasi'}</Label>
                  <div className="px-2">
                    <Slider min={1} max={10} step={0.5} value={[block.voteMax]} onValueChange={([v]) => updateBlock(block.id, { voteMax: v })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-marrow-deep/60 font-black uppercase tracking-wide text-[9px]">Anno da</Label>
                  <Input value={block.yearFrom} onChange={(e) => updateBlock(block.id, { yearFrom: e.target.value })} placeholder="es. 2000" className="mt-1 bg-white border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40" type="number" min="1900" max="2099" />
                </div>
                <div>
                  <Label className="text-marrow-deep/60 font-black uppercase tracking-wide text-[9px]">Anno a</Label>
                  <Input value={block.yearTo} onChange={(e) => updateBlock(block.id, { yearTo: e.target.value })} placeholder="es. 2024" className="mt-1 bg-white border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40" type="number" min="1900" max="2099" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-marrow-deep/60 font-black uppercase tracking-wide text-[9px]">Durata min (min)</Label>
                  <Input value={block.runtimeGte} onChange={(e) => updateBlock(block.id, { runtimeGte: e.target.value })} placeholder="es. 90" className="mt-1 bg-white border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40" type="number" min="0" max="400" />
                </div>
                <div>
                  <Label className="text-marrow-deep/60 font-black uppercase tracking-wide text-[9px]">Durata max (min)</Label>
                  <Input value={block.runtimeLte} onChange={(e) => updateBlock(block.id, { runtimeLte: e.target.value })} placeholder="es. 180" className="mt-1 bg-white border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40" type="number" min="0" max="400" />
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase tracking-tight text-marrow-light/70">Censura (Fino a)</Label>
                <Select value={block.certificationLte || '__any'} onValueChange={(v) => updateBlock(block.id, { certificationLte: v === '__any' ? '' : v })}>
                  <SelectTrigger className="mt-1 bg-white/60 border-marrow-light/10 text-marrow-deep font-bold text-xs">
                    <SelectValue placeholder="Qualsiasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Qualsiasi</SelectItem>
                    <SelectItem value="G">G (Tutti)</SelectItem>
                    <SelectItem value="PG">PG (Bambini accompagnati)</SelectItem>
                    <SelectItem value="PG-13">PG-13 (Vietato ai minori di 13)</SelectItem>
                    <SelectItem value="R">R (Vietato ai minori di 17)</SelectItem>
                    <SelectItem value="NC-17">NC-17 (Solo adulti)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </details>

          {/* Genres */}
          <details className="group [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-black text-[10px] text-marrow-light select-none uppercase tracking-widest">
              Generi {block.genres.length > 0 && <span className="text-[10px] font-normal normal-case text-primary ml-2">({block.genres.length} selezionati)</span>}
              {chevronSvg}
            </summary>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(GENRE_NAMES).map(([id, genreName]) => (
                <button
                  key={id}
                  onClick={() => toggleBlockGenre(block.id, id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all shadow-sm ${block.genres.includes(id)
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-white/40 text-marrow-light hover:text-primary hover:bg-primary/10 border border-marrow-light/20 shadow-sm'
                    }`}
                >
                  {genreName}
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-marrow-light/10 pt-4">
              <Label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-marrow-light/70">Escludi Generi {block.withoutGenres.length > 0 && <span className="text-[10px] font-normal normal-case text-red-500 ml-1">({block.withoutGenres.length} esclusi)</span>}</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(GENRE_NAMES).map(([id, genreName]) => (
                  <button
                    key={`without-${id}`}
                    onClick={() => toggleBlockWithoutGenre(block.id, id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all shadow-sm ${block.withoutGenres.includes(id)
                      ? 'bg-red-500 text-white shadow-red-500/20'
                      : 'bg-white/40 text-marrow-light hover:text-red-500 hover:bg-red-500/10 border border-marrow-light/20 shadow-sm'
                      }`}
                  >
                    {genreName}
                  </button>
                ))}
              </div>
            </div>
          </details>

          {/* Keywords & Staff */}
          <details className="group [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-black text-[10px] text-marrow-light select-none uppercase tracking-widest">
              Parole Chiave & Staff {(block.keywords.length + block.cast.length + block.crew.length) > 0 && <span className="text-[10px] font-normal normal-case text-primary ml-2">({block.keywords.length + block.cast.length + block.crew.length} selezionati)</span>}
              {chevronSvg}
            </summary>
            <div className="mt-4 space-y-5">
              <div>
                <Label className="mb-2 block text-xs font-bold text-marrow-deep">Parole Chiave</Label>
                <AutocompleteSearch
                  placeholder="Cerca parole chiave su TMDB..."
                  searchFn={api.searchTmdbKeywords}
                  onSelect={(item) => !block.keywords.find(k => k.id === item.id) && toggleBlockItem(block.id, 'keywords', item)}
                />
                {block.keywords.length > 0 && renderPills(block.keywords, (item) => toggleBlockItem(block.id, 'keywords', item))}
              </div>

              <div className="border-t border-marrow-light/10 pt-4">
                <Label className="mb-2 block text-xs font-bold text-marrow-deep">Escludi Parole Chiave</Label>
                <AutocompleteSearch
                  placeholder="Cerca parole chiave da escludere..."
                  searchFn={api.searchTmdbKeywords}
                  onSelect={(item) => !block.withoutKeywords.find(k => k.id === item.id) && toggleBlockItem(block.id, 'withoutKeywords', item)}
                />
                {block.withoutKeywords.length > 0 && renderPills(block.withoutKeywords, (item) => toggleBlockItem(block.id, 'withoutKeywords', item))}
              </div>

              <div>
                <Label className="mb-2 block text-xs font-bold text-marrow-deep">Attori (Cast)</Label>
                <AutocompleteSearch
                  placeholder="Cerca un attore..."
                  searchFn={api.searchTmdbPeople}
                  onSelect={(item) => !block.cast.find(k => k.id === item.id) && toggleBlockItem(block.id, 'cast', item)}
                />
                {block.cast.length > 0 && renderPills(block.cast, (item) => toggleBlockItem(block.id, 'cast', item))}
              </div>

              <div>
                <Label className="mb-2 block text-xs font-bold text-marrow-deep">Registi / Crew</Label>
                <AutocompleteSearch
                  placeholder="Cerca regista o membro dello staff..."
                  searchFn={api.searchTmdbPeople}
                  onSelect={(item) => !block.crew.find(k => k.id === item.id) && toggleBlockItem(block.id, 'crew', item)}
                />
                {block.crew.length > 0 && renderPills(block.crew, (item) => toggleBlockItem(block.id, 'crew', item))}
              </div>
            </div>
          </details>
          </>
          )}

          {/* Per-block inline preview */}
          {block.strategy !== 'ai' && (
            <div className="pt-3 border-t border-dashed border-marrow-light/15">
              <p className="text-[9px] font-black uppercase tracking-widest text-marrow-light/50 mb-2">Anteprima Query {index + 1}</p>
              <PosterRow filters={buildFiltersFromBlock(block)} type={type} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO CARD: Name + Type + Presentation Strategy – all in one place */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-white/60 to-primary/5 p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-lg shadow-primary/5">
        {/* Row 1: Name input + Type toggle */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <Label className="text-marrow-deep font-black uppercase tracking-wide text-[10px]">Nome catalogo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Il mio catalogo"
              className="mt-1 bg-white border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40 text-sm sm:text-base h-9 sm:h-10"
            />
          </div>
          <div className="sm:w-56 shrink-0">
            <Label className="text-marrow-deep font-black uppercase tracking-wide text-[10px]">Tipo</Label>
            <div className="flex gap-1.5 mt-1">
              {(['movie', 'series'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-lg border py-1.5 sm:py-2 text-xs sm:text-sm font-bold transition-all ${type === t
                    ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                    : 'border-marrow-light/20 bg-white/40 text-marrow-light hover:text-primary hover:border-primary/50'
                    }`}
                >
                  {t === 'movie' ? '🎬 Film' : '📺 Serie'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Presentation Strategy */}
        <div className="flex flex-col sm:flex-row sm:items-center items-start gap-1 sm:gap-3 pt-1">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            <span className="text-marrow-deep font-black uppercase tracking-wide text-[9px] sm:text-[10px] whitespace-nowrap">Presentazione</span>
            <span className="relative group">
              <Info className="h-3.5 w-3.5 text-marrow-light/60 cursor-help" />
              <span className="absolute bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-64 rounded-lg bg-primary-dark text-white text-xs p-3 shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                <strong>Popularity:</strong> ordina tutti i risultati per popolarità globale.
                <br /><strong>Interleave:</strong> alterna i risultati di ogni query per massima varietà (consensus scoring).
              </span>
            </span>
          </div>
          <div className="flex gap-1.5 w-full sm:w-auto">
            {(['popularity', 'interleave'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPresentationStrategy(s)}
                className={`flex-1 sm:flex-none rounded-lg border px-2 sm:px-4 py-1.5 text-[10px] sm:text-xs font-bold transition-all ${presentationStrategy === s
                  ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                  : 'border-marrow-light/20 bg-white/50 text-marrow-light hover:text-primary hover:border-primary/50'
                  }`}
              >
                {s === 'popularity' ? '🏆 Popularity' : '🔀 Interleave'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-marrow-deep">
            Query Blocks ({blocks.length})
          </span>
          <Button onClick={addBlock} variant="outline" size="sm" className="h-8 gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-bold text-marrow-deep bg-white/40 border-primary/20 hover:bg-primary/10">
            <Plus className="h-3.5 w-3.5" />
            Aggiungi Query
          </Button>
        </div>

        {blocks.map((block, i) => renderBlock(block, i))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FLOATING ACTION BAR: Preview & Save */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="sticky bottom-4 z-50 mt-4 sm:mt-6">
        <div className="glass-panel p-2 sm:p-3 flex items-center justify-between gap-2 sm:gap-3 bg-white/80 shadow-2xl shadow-primary/10 border-2 border-primary/20 rounded-2xl mx-auto max-w-2xl backdrop-blur-xl">
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              className="font-bold border-marrow-light/20 text-marrow-light hover:bg-marrow-light/5 text-[10px] sm:text-sm h-10 sm:h-12 px-3 sm:px-4"
            >
              Annulla
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={handleManualPreview}
            className="flex-1 font-bold text-marrow-deep hover:bg-primary/10 hover:text-primary text-[10px] sm:text-sm h-10 sm:h-12"
          >
            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Aggiorna</span> Anteprima
          </Button>

          <Button
            onClick={handleSave}
            disabled={!name.trim() || blocks.length === 0 || saved}
            className={`flex-1 font-black shadow-lg text-[10px] sm:text-sm h-10 sm:h-12 transition-all duration-300 ${saved
              ? 'bg-success hover:bg-success text-white shadow-success/30'
              : 'bg-primary hover:brightness-110 text-white shadow-primary/30'
              }`}
          >
            {saved ? (
              <span className="flex items-center">
                <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Salvato!
              </span>
            ) : editCatalog ? (
              <span className="flex items-center">
                <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Salva</span> Modifiche
              </span>
            ) : (
              <span className="flex items-center">
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Crea</span> Catalogo
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
