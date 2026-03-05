'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { PosterRow } from '@/components/shared/PosterRow';
import { Catalog } from '@/types';
import { GENRE_NAMES, SORT_OPTIONS, LANGUAGES } from '@/lib/constants';
import { Loader2, Wand2, Save, X, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { generateId } from '@/lib/utils';

const MAX_AI_CATALOG_NAME_LENGTH = 30;

interface CreatorPanelProps {
  onAddCatalog: (catalog: Catalog) => void;
}

interface SelectedItem {
  id: string;
  name: string;
}

export function CreatorPanel({ onAddCatalog }: CreatorPanelProps) {
  // Unified state
  const [name, setName] = useState('');
  const [type, setType] = useState<'movie' | 'series'>('movie');
  const [prompt, setPrompt] = useState('');
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [language, setLanguage] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<SelectedItem[]>([]);
  const [cast, setCast] = useState<SelectedItem[]>([]);
  const [crew, setCrew] = useState<SelectedItem[]>([]);
  const [voteMin, setVoteMin] = useState(0);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [previewFilters, setPreviewFilters] = useState<Record<string, unknown> | null>(null);
  const [previewType, setPreviewType] = useState<'movie' | 'series'>('movie');
  const [saved, setSaved] = useState(false);

  const toggleGenre = (id: string) =>
    setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const toggleKeyword = (item: SelectedItem) =>
    setKeywords((k) => (k.find(x => x.id === item.id) ? k.filter((x) => x.id !== item.id) : [...k, item]));
  const toggleCast = (item: SelectedItem) =>
    setCast((k) => (k.find(x => x.id === item.id) ? k.filter((x) => x.id !== item.id) : [...k, item]));
  const toggleCrew = (item: SelectedItem) =>
    setCrew((k) => (k.find(x => x.id === item.id) ? k.filter((x) => x.id !== item.id) : [...k, item]));

  const parseList = (val: unknown) => {
    if (!val) return [];
    return String(val).replace(/\|/g, ',').split(',').map(s => s.trim()).filter(Boolean);
  };

  const mapToPills = (val: unknown, prefix: string) => parseList(val).map(id => ({ id, name: `${prefix}: ${id}` }));

  // AI Generation: sends prompt, populates all filter fields
  const handleAiGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setAiLoading(true);
    try {
      const result = await api.previewCatalog({ prompt: trimmed, type });
      if (result?.filters && typeof result.filters === 'object') {
        const f = result.filters as Record<string, unknown>;

        // Populate fields from AI response
        const aiType = result.type === 'series' ? 'series' as const : 'movie' as const;
        setType(aiType);
        setPreviewType(aiType);
        setName(result.name || trimmed.slice(0, MAX_AI_CATALOG_NAME_LENGTH));

        setSortBy((f.sort_by as string) || 'popularity.desc');
        setLanguage((f.with_original_language as string) || '');
        setGenres(parseList(f.with_genres));
        setKeywords(mapToPills(f.with_keywords, 'Keyword'));
        setCast(mapToPills(f.with_cast, 'Cast'));
        setCrew(mapToPills(f.with_crew, 'Crew'));

        const voteGte = f['vote_average.gte'];
        setVoteMin(Number(voteGte) || 0);

        const dateGte = f['primary_release_date.gte'] as string;
        setYearFrom(dateGte ? dateGte.substring(0, 4) : '');
        const dateLte = f['primary_release_date.lte'] as string;
        setYearTo(dateLte ? dateLte.substring(0, 4) : '');

        setPreviewFilters(f);
      }
    } catch { }
    setAiLoading(false);
  };

  // Build filters from current manual state
  const buildFilters = () => ({
    sort_by: sortBy,
    ...(language && { with_original_language: language }),
    ...(genres.length && { with_genres: genres.join(',') }),
    ...(keywords.length && { with_keywords: keywords.map(k => k.id).join(',') }),
    ...(cast.length && { with_cast: cast.map(c => c.id).join(',') }),
    ...(crew.length && { with_crew: crew.map(c => c.id).join(',') }),
    ...(voteMin > 0 && { 'vote_average.gte': voteMin }),
    ...(yearFrom && { 'primary_release_date.gte': `${yearFrom}-01-01` }),
    ...(yearTo && { 'primary_release_date.lte': `${yearTo}-12-31` }),
  });

  const handleManualPreview = () => {
    const filters = buildFilters();
    setPreviewFilters(filters);
    setPreviewType(type);
  };

  const handleSave = () => {
    const filters = buildFilters();
    const catalog: Catalog = {
      id: generateId(),
      name: name || 'Catalogo Personalizzato',
      raw_prompt: prompt || undefined,
      type,
      source: prompt.trim() ? 'ai' : 'manual',
      filters,
      emoji: prompt.trim() ? '🤖' : '🎨',
    };
    onAddCatalog(catalog);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

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

  return (
    <div className="space-y-6">
      {/* Header: Name + Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-900 dark:text-slate-100 font-bold">Nome catalogo</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Il mio catalogo"
            className="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          />
        </div>
        <div>
          <Label className="text-slate-900 dark:text-slate-100 font-bold">Tipo</Label>
          <div className="flex gap-2 mt-1">
            {(['movie', 'series'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-all ${type === t
                  ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/50'
                  }`}
              >
                {t === 'movie' ? '🎬 Film' : '📺 Serie'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Prompt Section */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <Wand2 className="h-5 w-5" />
          <span className="text-sm font-black uppercase tracking-widest">Genera con AI</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Descrivi il catalogo che vuoi creare. L&apos;AI interpreterà la tua richiesta e compilerà i filtri sottostanti.
        </p>
        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="es. Film horror italiani degli anni 80..."
            className="flex-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAiGenerate(); }}
          />
          <Button onClick={handleAiGenerate} disabled={aiLoading || !prompt.trim()} className="shrink-0 bg-primary text-white hover:brightness-110">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Genera
          </Button>
        </div>
      </div>

      {/* Filters: Filtri di Base */}
      <details className="group border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden" open>
        <summary className="flex cursor-pointer items-center justify-between font-bold text-sm text-slate-900 dark:text-slate-100 select-none uppercase tracking-wider">
          Filtri di Base
          {chevronSvg}
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordina per</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="mt-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
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
              <Label>Lingua originale</Label>
              <Select value={language || '__any'} onValueChange={(v) => setLanguage(v === '__any' ? '' : v)}>
                <SelectTrigger className="mt-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
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

          <div>
            <Label className="mb-2 block">Voto minimo: {voteMin > 0 ? voteMin.toFixed(1) : 'Qualsiasi'}</Label>
            <div className="px-2">
              <Slider min={0} max={9} step={0.5} value={[voteMin]} onValueChange={([v]) => setVoteMin(v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="year-from">Anno da</Label>
              <Input id="year-from" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="es. 2000" className="mt-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" type="number" min="1900" max="2099" />
            </div>
            <div>
              <Label htmlFor="year-to">Anno a</Label>
              <Input id="year-to" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="es. 2024" className="mt-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" type="number" min="1900" max="2099" />
            </div>
          </div>
        </div>
      </details>

      {/* Filters: Generi */}
      <details className="group border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between font-bold text-sm text-slate-900 dark:text-slate-100 select-none uppercase tracking-wider">
          Generi {genres.length > 0 && <span className="text-xs font-normal normal-case text-primary ml-2">({genres.length} selezionati)</span>}
          {chevronSvg}
        </summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(GENRE_NAMES).map(([id, genreName]) => (
            <button
              key={id}
              onClick={() => toggleGenre(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all shadow-sm ${genres.includes(id)
                ? 'bg-primary text-white shadow-primary/20'
                : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                }`}
            >
              {genreName}
            </button>
          ))}
        </div>
      </details>

      {/* Filters: Parole Chiave & Staff */}
      <details className="group border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between font-bold text-sm text-slate-900 dark:text-slate-100 select-none uppercase tracking-wider">
          Parole Chiave & Staff {(keywords.length + cast.length + crew.length) > 0 && <span className="text-xs font-normal normal-case text-primary ml-2">({keywords.length + cast.length + crew.length} selezionati)</span>}
          {chevronSvg}
        </summary>
        <div className="mt-4 space-y-5">
          <div>
            <Label className="mb-2 block">Parole Chiave</Label>
            <AutocompleteSearch
              placeholder="Cerca parole chiave su TMDB..."
              searchFn={api.searchTmdbKeywords}
              onSelect={(item) => !keywords.find(k => k.id === item.id) && toggleKeyword(item)}
            />
            {keywords.length > 0 && renderPills(keywords, toggleKeyword)}
          </div>

          <div>
            <Label className="mb-2 block">Attori (Cast)</Label>
            <AutocompleteSearch
              placeholder="Cerca un attore..."
              searchFn={api.searchTmdbPeople}
              onSelect={(item) => !cast.find(k => k.id === item.id) && toggleCast(item)}
            />
            {cast.length > 0 && renderPills(cast, toggleCast)}
          </div>

          <div>
            <Label className="mb-2 block">Registi / Crew</Label>
            <AutocompleteSearch
              placeholder="Cerca regista o membro dello staff..."
              searchFn={api.searchTmdbPeople}
              onSelect={(item) => !crew.find(k => k.id === item.id) && toggleCrew(item)}
            />
            {crew.length > 0 && renderPills(crew, toggleCrew)}
          </div>
        </div>
      </details>

      {/* Preview */}
      {previewFilters && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 p-4 overflow-hidden">
          <PosterRow filters={previewFilters} type={previewType} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button onClick={handleManualPreview} variant="outline" className="flex-1 py-3 font-bold">
          <Eye className="h-4 w-4 mr-2" />
          Anteprima
        </Button>
        <Button onClick={handleSave} disabled={saved} className="flex-1 py-3 bg-primary text-white hover:brightness-110 font-bold">
          <Save className="h-4 w-4 mr-2" />
          {saved ? '✅ Aggiunto!' : 'Salva e Aggiungi'}
        </Button>
      </div>

      {saved && (
        <p className="text-xs text-emerald-500 font-medium text-center">Catalogo aggiunto con successo al profilo.</p>
      )}
    </div>
  );
}
