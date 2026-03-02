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
import { GENRE_NAMES, KEYWORD_NAMES, SORT_OPTIONS, LANGUAGES } from '@/lib/constants';
import { Loader2, Wand2, Save, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
const MAX_AI_CATALOG_NAME_LENGTH = 30;

interface CreatorPanelProps {
  onSaveList: (list: MyList) => void;
  onAddCatalog: (catalog: Catalog) => void;
}

import { generateId } from '@/lib/utils';

export function CreatorPanel({ onSaveList, onAddCatalog }: CreatorPanelProps) {
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
  const [keywords, setKeywords] = useState<string[]>([]);
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
  const toggleKeyword = (id: string) =>
    setKeywords((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));

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
    } catch {}
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
    // Reset prompt fields
    setPrompts(['']);
    setAiPreviewFilters(null);
    setAiRawPrompt('');
    setAiCatalogName('');
  };

  const buildManualFilters = () => ({
    sort_by: sortBy,
    ...(language && { with_original_language: language }),
    ...(genres.length && { with_genres: genres.join(',') }),
    ...(keywords.length && { with_keywords: keywords.join(',') }),
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

  return (
    <div className="space-y-4">
      <Tabs defaultValue="ai">
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
            <Label className="mb-2 block">Tipo</Label>
            <div className="flex gap-2">
              {(['movie', 'series'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAiType(t)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    aiType === t
                      ? 'border-[#8a5aeb] bg-[#8a5aeb]/20 text-[#8a5aeb]'
                      : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                  }`}
                >
                  {t === 'movie' ? '🎬 Film' : '📺 Serie'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrivi il catalogo che vuoi creare</Label>
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
            <Button variant="outline" onClick={handleAiSave} disabled={aiSaved || !aiPreviewFilters}>
              <Save className="h-4 w-4 mr-2" />
              {aiSaved ? '✅ Aggiunto!' : 'Aggiungi al Profilo'}
            </Button>
          </div>

          {aiSaved && (
            <p className="text-xs text-emerald-400">Catalogo AI aggiunto al profilo.</p>
          )}
        </TabsContent>

        {/* Manual Tab */}
        <TabsContent value="manual" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="manual-name">Nome catalogo</Label>
              <Input
                id="manual-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Il mio catalogo"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <div className="flex gap-2 mt-1">
                {(['movie', 'series'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setManualType(t)}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                      manualType === t
                        ? 'border-[#8a5aeb] bg-[#8a5aeb]/20 text-[#8a5aeb]'
                        : 'border-white/10 bg-white/5 text-white/50'
                    }`}
                  >
                    {t === 'movie' ? 'Film' : 'Serie'}
                  </button>
                ))}
              </div>
            </div>
          </div>

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

          {/* Genres */}
          <div>
            <Label className="mb-2 block">Generi</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(GENRE_NAMES).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => toggleGenre(id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    genres.includes(id)
                      ? 'bg-[#8a5aeb] text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div>
            <Label className="mb-2 block">Parole chiave</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(KEYWORD_NAMES).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => toggleKeyword(id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    keywords.includes(id)
                      ? 'bg-[#8a5aeb] text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Vote min */}
          <div>
            <Label className="mb-2 block">Voto minimo: {voteMin > 0 ? voteMin.toFixed(1) : 'Qualsiasi'}</Label>
            <Slider
              min={0}
              max={9}
              step={0.5}
              value={[voteMin]}
              onValueChange={([v]) => setVoteMin(v)}
            />
          </div>

          {/* Year range */}
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

          {/* Preview */}
          {manualPreviewFilters && !manualLoading && (
            <PosterRow filters={manualPreviewFilters} type={manualType} />
          )}

          <div className="flex gap-2">
            <Button onClick={handleManualPreview} disabled={manualLoading} variant="outline" className="flex-1">
              {manualLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Anteprima
            </Button>
            <Button onClick={handleManualSave}>
              <Save className="h-4 w-4 mr-2" />
              Salva e Aggiungi
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
