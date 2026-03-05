'use client';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { PosterRow } from '@/components/shared/PosterRow';
import { Catalog, MyList } from '@/types';
import { GENRE_NAMES, SORT_OPTIONS, LANGUAGES } from '@/lib/constants';
import { Loader2, Wand2, Save, Plus, Trash2, Settings2, X } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<string>('ai');

  // AI tab state
  const [prompts, setPrompts] = useState<string[]>(['']);
  const [aiType, setAiType] = useState<'movie' | 'series'>('movie');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreviewFilters, setAiPreviewFilters] = useState<Record<string, unknown> | null>(null);
  const [aiPreviewType, setAiPreviewType] = useState<'movie' | 'series'>(aiType);
  const [aiCatalogName, setAiCatalogName] = useState<string>('');
  const [aiRawPrompt, setAiRawPrompt] = useState<string>('');
  const [aiSaved, setAiSaved] = useState(false);

  // Manual tab state
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<'movie' | 'series'>('movie');
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [language, setLanguage] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<SelectedItem[]>([]);
  const [cast, setCast] = useState<SelectedItem[]>([]);
  const [crew, setCrew] = useState<SelectedItem[]>([]);
  const [voteMin, setVoteMin] = useState(0);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualPreviewFilters, setManualPreviewFilters] = useState<Record<string, unknown> | null>(null);

  const addPrompt = () => setPrompts((p) => [...p, '']);
  const removePrompt = (i: number) => setPrompts((p) => p.filter((_, j) => j !== i));
  const updatePrompt = (i: number, val: string) => setPrompts((p) => p.map((x, j) => (j === i ? val : x)));

  const toggleGenre = (id: string) =>
    setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const toggleKeyword = (item: SelectedItem) =>
    setKeywords((k) => (k.find(x => x.id === item.id) ? k.filter((x) => x.id !== item.id) : [...k, item]));
  const toggleCast = (item: SelectedItem) =>
    setCast((k) => (k.find(x => x.id === item.id) ? k.filter((x) => x.id !== item.id) : [...k, item]));
  const toggleCrew = (item: SelectedItem) =>
    setCrew((k) => (k.find(x => x.id === item.id) ? k.filter((x) => x.id !== item.id) : [...k, item]));

  const handleAiPreview = async () => {
    const validPrompts = prompts.filter((p) => p.trim());
    if (!validPrompts.length) return;
    setAiLoading(true);
    try {
      const prompt = validPrompts[0].trim();
      const result = await api.previewCatalog({ prompt, type: aiType });
      if (result?.filters && typeof result.filters === 'object') {
        setAiPreviewFilters(result.filters);
        setAiPreviewType(result.type === 'series' ? 'series' : 'movie');
        setAiCatalogName(result.name || prompt.slice(0, MAX_AI_CATALOG_NAME_LENGTH));
        setAiRawPrompt(prompt);
      }
    } catch { }
    setAiLoading(false);
  };

  const handleAiSave = () => {
    if (!aiPreviewFilters) return;
    const catalog: Catalog = {
      id: generateId(),
      name: aiCatalogName || 'Catalogo AI',
      raw_prompt: aiRawPrompt,
      type: aiPreviewType,
      source: 'ai',
      filters: aiPreviewFilters,
      emoji: '🤖',
    };
    onAddCatalog(catalog);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 3000);
    setPrompts(['']);
    setAiPreviewFilters(null);
    setAiRawPrompt('');
    setAiCatalogName('');
  };

  const buildManualFilters = () => ({
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
    setManualPreviewFilters(buildManualFilters());
    setManualLoading(true);
    setTimeout(() => setManualLoading(false), 200);
  };

  const handleManualSave = () => {
    const filters = buildManualFilters();
    const catalog: Catalog = {
      id: generateId(),
      name: manualName || 'Catalogo Personalizzato',
      type: manualType,
      source: 'manual',
      filters,
      emoji: '🎨',
    };
    onAddCatalog(catalog);
  };

  const handleEditManually = () => {
    if (!aiPreviewFilters) return;

    setManualName(aiCatalogName);
    setManualType(aiPreviewType);

    setSortBy((aiPreviewFilters.sort_by as string) || 'popularity.desc');
    setLanguage((aiPreviewFilters.with_original_language as string) || '');

    const parseList = (val: unknown) => {
      if (!val) return [];
      return String(val).replace(/\|/g, ',').split(',').map(s => s.trim()).filter(Boolean);
    };

    setGenres(parseList(aiPreviewFilters.with_genres));

    // Convert flat AI IDs to pill objects
    const mapToPills = (val: unknown, prefix: string) => parseList(val).map(id => ({ id, name: `${prefix}: ${id}` }));

    setKeywords(mapToPills(aiPreviewFilters.with_keywords, 'Keyword'));
    setCast(mapToPills(aiPreviewFilters.with_cast, 'Cast'));
    setCrew(mapToPills(aiPreviewFilters.with_crew, 'Crew'));

    const voteGte = aiPreviewFilters['vote_average.gte'];
    setVoteMin(Number(voteGte) || 0);

    const dateGte = aiPreviewFilters['primary_release_date.gte'] as string;
    if (dateGte) {
      setYearFrom(dateGte.substring(0, 4));
    } else {
      setYearFrom('');
    }

    const dateLte = aiPreviewFilters['primary_release_date.lte'] as string;
    if (dateLte) {
      setYearTo(dateLte.substring(0, 4));
    } else {
      setYearTo('');
    }

    setManualPreviewFilters(aiPreviewFilters);
    setActiveTab('manual');
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

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="ai" className="flex-1">
            <Wand2 className="h-4 w-4 mr-2" />
            Catalogo AI
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex-1">
            <Plus className="h-4 w-4 mr-2" />
            Creazione Manuale
          </TabsTrigger>
        </TabsList>

        {/* AI Tab */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          <div>
            <Label className="mb-2 block text-slate-900 dark:text-slate-100 font-bold">Tipo</Label>
            <div className="flex gap-2">
              {(['movie', 'series'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAiType(t)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-colors shadow-sm ${aiType === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/50'
                    }`}
                >
                  {t === 'movie' ? '🎬 Film' : '📺 Serie'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="block text-slate-900 dark:text-slate-100 font-bold">Descrivi il catalogo che vuoi creare</Label>
            {prompts.map((prompt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={prompt}
                  onChange={(e) => updatePrompt(i, e.target.value)}
                  placeholder="es. Film horror italiani degli anni 80..."
                />
                {prompts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePrompt(i)}
                    className="shrink-0 text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addPrompt} className="text-white/50">
              <Plus className="h-4 w-4 mr-1" /> Aggiungi prompt
            </Button>
          </div>

          {aiPreviewFilters && (
            <PosterRow
              filters={aiPreviewFilters}
              type={aiPreviewType}
            />
          )}

          <div className="flex gap-2">
            <Button onClick={handleAiPreview} disabled={aiLoading} className="flex-1">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Genera Anteprima
            </Button>
            {aiPreviewFilters && (
              <Button onClick={handleEditManually} variant="secondary" className="flex-1">
                <Settings2 className="h-4 w-4 mr-2" />
                Modifica Manualmente
              </Button>
            )}
            <Button variant="outline" onClick={handleAiSave} disabled={aiSaved || !aiPreviewFilters} className={aiPreviewFilters ? "flex-1" : ""}>
              <Save className="h-4 w-4 mr-2" />
              {aiSaved ? '✅ Aggiunto!' : 'Aggiungi al Profilo'}
            </Button>
          </div>

          {aiSaved && (
            <p className="text-xs text-emerald-400">Catalogo AI aggiunto al profilo.</p>
          )}
        </TabsContent>

        {/* Manual Tab */}
        <TabsContent value="manual" className="space-y-6 mt-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="manual-name" className="text-slate-900 dark:text-slate-100 font-bold">Nome catalogo</Label>
              <Input
                id="manual-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Il mio catalogo"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-900 dark:text-slate-100 font-bold">Tipo</Label>
              <div className="flex gap-2 mt-1">
                {(['movie', 'series'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setManualType(t)}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-bold transition-colors ${manualType === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/50'
                      }`}
                  >
                    {t === 'movie' ? 'Film' : 'Serie'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <details className="group border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden" open>
            <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-900 dark:text-slate-100 select-none">
              Filtri di Base
              <span className="transition group-open:rotate-180">
                <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ordina per</Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="mt-1">
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
                    <SelectTrigger className="mt-1">
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
                  <Input
                    id="year-from"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="es. 2000"
                    className="mt-1"
                    type="number"
                    min="1900"
                    max="2099"
                  />
                </div>
                <div>
                  <Label htmlFor="year-to">Anno a</Label>
                  <Input
                    id="year-to"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="es. 2024"
                    className="mt-1"
                    type="number"
                    min="1900"
                    max="2099"
                  />
                </div>
              </div>
            </div>
          </details>

          <details className="group border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-900 dark:text-slate-100 select-none">
              Generi
              <span className="transition group-open:rotate-180">
                <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
              </span>
            </summary>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(GENRE_NAMES).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => toggleGenre(id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors shadow-sm ${genres.includes(id)
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </details>

          <details className="group border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-900 dark:text-slate-100 select-none">
              Parole Chiave & Staff (Ricerca)
              <span className="transition group-open:rotate-180">
                <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
              </span>
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
          {manualPreviewFilters && !manualLoading && (
            <PosterRow filters={manualPreviewFilters} type={manualType} />
          )}

          <div className="flex gap-2">
            <Button onClick={handleManualPreview} disabled={manualLoading} variant="outline" className="flex-1">
              {manualLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Anteprima
            </Button>
            <Button onClick={handleManualSave} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              Salva e Aggiungi
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
