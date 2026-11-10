'use client';
import { useState, useMemo, ReactNode, DragEventHandler } from 'react';
import { CatalogCardData } from '@/types';
import { getFrontendCatalogKind } from '@/lib/catalogKind';
import { TIPI_CATALOGO_MAP, FONTI_CATALOGO_MAP, TipoFamiglia } from '@/lib/catalogPresentation';
import { PosterRow } from '@/components/shared/PosterRow';
import { Switch } from '@/components/ui/switch';
import { GripVertical, Trash2, Pencil, ChevronUp, ChevronDown, Sparkles, List, Wand2, EyeOff, Film, Tv, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatShelfSeeds } from '@/lib/shelfPresentation';
import { useFinePointer } from '@/hooks/useFinePointer';

interface CatalogItemProps {
  catalog: CatalogCardData;
  /** Modalità dell'elenco in cui il catalogo è mostrato: l'anteprima usa le sue leve. */
  modo?: string;
  actions?: ReactNode;
  badges?: ReactNode;
  description?: string;
  onRemove?: () => void;
  onEdit?: () => void;
  onToggleActive?: (attivo: boolean) => void;
  isAttivo?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isDragging?: boolean;
  isHiddenBySelectors?: boolean;
  hiddenReason?: string;
  onDragStart?: DragEventHandler;
  onDragOver?: DragEventHandler;
  onDragLeave?: DragEventHandler;
  onDrop?: DragEventHandler;
  onDragEnd?: DragEventHandler;
}

export function CatalogItem({
  catalog,
  modo,
  actions,
  badges,
  description,
  onRemove,
  onEdit,
  onToggleActive,
  isAttivo,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  isDragging,
  isHiddenBySelectors = false,
  hiddenReason,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: CatalogItemProps) {
  const finePointer = useFinePointer();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const mediaSet = getFrontendCatalogKind(catalog).mediaSet;

  const isPreset = catalog.source === 'preset' || catalog.fonte === 'preset' || (!catalog.source && !catalog.fonte);
  const fonte = catalog.fonte || catalog.source;
  const nomeFonte = catalog.nomeFonte ?? catalog.nome_fonte;
  const confidenza = catalog.confidenza;
  const semiMembri = catalog.semiMembri ?? catalog.semi_membri;
  const semiRappresentativi = catalog.semiRappresentativi ?? catalog.semi_rappresentativi;
  const isRecommendation = fonte === 'grafo' || Boolean(semiRappresentativi?.length || semiMembri?.length || nomeFonte);
  const sourceLabel = FONTI_CATALOGO_MAP[fonte || '']?.label || (isPreset ? 'Preset' : (fonte === 'grafo' ? 'Suggerito' : 'Creato'));
  const SourceIcon = (fonte === 'preset' || fonte === 'grafo') ? Sparkles : (fonte === 'watchlist' || fonte === 'mylist' ? List : Wand2);

  const seeds = useMemo(() => {
    return formatShelfSeeds({
      semiMembri,
      semiRappresentativi,
      medium: catalog.media || (catalog.type === 'both' ? undefined : catalog.type),
    });
  }, [semiMembri, semiRappresentativi, catalog.media, catalog.type]);

  const activeState = Boolean(catalog.attivo ?? isAttivo);

  // Determina tipo effettivo (film/serie/anime/bambini)
  const tipoEffettivo = (catalog.tipo || (catalog.isAnime ? 'anime' : (catalog.type === 'series' ? 'serie' : (catalog.type === 'movie' ? 'film' : null)))) as TipoFamiglia | null;

  // Stremio type prioritario per l'anteprima (correzione 9: preserva 'anime' per la watchlist anime)
  const previewType = catalog.stremioType || (catalog.type === 'both' ? 'movie' : (catalog.type || (tipoEffettivo === 'serie' ? 'series' : 'movie')));

  // Filtra la dicitura generica del preset (ticket 06: via dicitura fissa)
  const rawDesc = description || catalog.description || catalog.raw_prompt;
  const isGenericDesc = rawDesc && /catalogo tematico preconfigurato/i.test(rawDesc);
  const effectiveDescription = isGenericDesc ? null : rawDesc;

  return (
    <div
      draggable={Boolean(onDragStart) && finePointer}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative flex flex-col w-full min-w-0 glass-card transition-all p-3 sm:p-5 ${
        isDragging
          ? 'opacity-30 scale-95'
          : isHiddenBySelectors
          ? 'border-2 border-dashed border-amber-500/40 bg-marrow-light/10 opacity-60 hover:opacity-90 transition-opacity'
          : ''
      } ${onDragStart ? 'sm:cursor-grab sm:active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between mb-2 sm:mb-4 relative z-10">
        <div className="flex gap-2 sm:gap-4 items-center min-w-0">
          <div className="flex items-center gap-2 sm:gap-3">
            {(onMoveUp || onMoveDown || onDragStart) && (
              <div className="flex items-center gap-1 shrink-0">
                {(onMoveUp || onMoveDown) && (
                  <div className="flex flex-col sm:hidden items-center justify-center bg-marrow-light/5 rounded-lg border border-marrow-light/10 divide-y divide-marrow-light/10 shrink-0">
                    <button
                      type="button"
                      disabled={!canMoveUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp?.();
                      }}
                      aria-label="Sposta su"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] text-marrow-light/60 hover:text-primary hover:bg-primary/5 active:bg-primary/15 disabled:opacity-20 disabled:pointer-events-none transition-all touch-manipulation flex items-center justify-center rounded-t-lg"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveDown}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown?.();
                      }}
                      aria-label="Sposta giù"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] text-marrow-light/60 hover:text-primary hover:bg-primary/5 active:bg-primary/15 disabled:opacity-20 disabled:pointer-events-none transition-all touch-manipulation flex items-center justify-center rounded-b-lg"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {onDragStart && (
                  <GripVertical className="hidden sm:block h-3.5 w-3.5 sm:h-4 sm:w-4 text-marrow-light/20 cursor-grab group-hover:text-primary/40 transition-colors shrink-0" />
                )}
              </div>
            )}
            <div className="size-9 sm:size-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all bg-white shadow-inner text-marrow-deep shrink-0">
              <span className="text-lg sm:text-2xl">{catalog.emoji ?? (tipoEffettivo && TIPI_CATALOGO_MAP[tipoEffettivo] ? TIPI_CATALOGO_MAP[tipoEffettivo].icon : '📋')}</span>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-marrow-deep text-sm sm:text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">{catalog.name}</h3>
            {/* Ticket 06: Il badge film/serie/anime sale accanto a preset e anime */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-black uppercase tracking-wider border border-primary/10">
                <SourceIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{sourceLabel}</span>
              </span>

              {/* Badge del tipo (Film / Serie / Anime / Bambini) */}
              {tipoEffettivo && TIPI_CATALOGO_MAP[tipoEffettivo] && (
                <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider border ${
                  tipoEffettivo === 'bambini'
                    ? 'bg-purple-500/10 text-purple-700 border-purple-500/20'
                    : tipoEffettivo === 'anime'
                    ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                    : 'bg-primary/5 text-primary border-primary/10'
                }`}>
                  <span>{TIPI_CATALOGO_MAP[tipoEffettivo].icon}</span>
                  <span>{TIPI_CATALOGO_MAP[tipoEffettivo].badgeLabel}</span>
                </span>
              )}

              {/* Medium (Film / Serie) basato su `media` (o `type`), NON su `tipo` */}
              {/* Un catalogo tipo: 'anime' con media: 'series' mostra Serie */}
              {(() => {
                const isSeries = catalog.media === 'series' || (!catalog.media && catalog.type === 'series');
                const isMovie = catalog.media === 'movie' || (!catalog.media && catalog.type === 'movie');

                if (tipoEffettivo === 'film' || tipoEffettivo === 'serie') {
                  return null;
                }

                if (isSeries) {
                  return (
                    <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-black uppercase tracking-wider border border-primary/10">
                      <Tv className="h-3 w-3 shrink-0" />
                      <span>Serie</span>
                    </span>
                  );
                }
                if (isMovie) {
                  return (
                    <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-black uppercase tracking-wider border border-primary/10">
                      <Film className="h-3 w-3 shrink-0" />
                      <span>Film</span>
                    </span>
                  );
                }
                return null;
              })()}

              {!tipoEffettivo && mediaSet.map((media) => (
                <span key={media} className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-black uppercase tracking-wider border border-primary/10">
                  {media === 'film' ? <Film className="h-3 w-3 shrink-0" /> : <Tv className="h-3 w-3 shrink-0" />}
                  <span>{media === 'film' ? 'Film' : 'Serie'}</span>
                </span>
              ))}

              {badges}

              {isHiddenBySelectors && (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-800 text-xs font-black uppercase tracking-wider border border-amber-500/30">
                  <EyeOff className="h-3 w-3 shrink-0" />
                  <span>{hiddenReason || 'Nascosto dai selettori'}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2 sm:ml-4">
          {isRecommendation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsInfoOpen(true);
              }}
              className="p-2 rounded-xl text-marrow-light/60 hover:text-primary hover:bg-primary/5 transition-all size-11 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              title="Informazioni raccomandazione"
              aria-label="Perché questo catalogo?"
            >
              <Info className="h-4 w-4" />
            </button>
          )}
          {onToggleActive && (
            <div className="flex items-center gap-2 mr-1">
              <span className={`text-xs font-bold uppercase tracking-wider hidden sm:inline ${activeState ? 'text-primary font-black' : 'text-marrow-light/50'}`}>
                {activeState ? 'Attivo' : 'Spento'}
              </span>
              <Switch
                checked={activeState}
                onCheckedChange={(checked) => onToggleActive(checked)}
                aria-label={`Attiva ${catalog.name}`}
              />
            </div>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-xl text-marrow-light/60 hover:text-primary hover:bg-primary/5 transition-all size-11 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              title="Modifica"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-2 rounded-xl text-marrow-light/60 hover:text-destructive hover:bg-destructive/5 transition-all size-11 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              title="Rimuovi"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {actions}
        </div>
      </div>

      {effectiveDescription && (
        <p className="text-xs sm:text-sm text-marrow-light/80 font-medium line-clamp-1 mb-2 sm:mb-4 relative z-10 px-1">
          {effectiveDescription}
        </p>
      )}

      <div className="-mx-1 sm:-mx-2 relative z-10 group/row">
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/row:opacity-100 transition-opacity rounded-2xl -z-10" />
        <PosterRow
          presetId={isPreset ? (catalog.id.startsWith('yaca_preset_') ? catalog.id : `yaca_preset_${catalog.id}`) : catalog.id}
          type={previewType}
          filters={catalog.filters}
          prompt={catalog.raw_prompt}
          modo={modo}
        />
      </div>

      {/* Popup esplicativo raccomandazione (Ticket correzione 11) */}
      {isRecommendation && (
        <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-4 sm:p-6 bg-[#fdfaf5] border border-marrow-light/20 rounded-2xl">
            <DialogHeader className="text-left space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{catalog.emoji || '✨'}</span>
                <DialogTitle className="text-base sm:text-lg font-black text-marrow-deep">
                  {catalog.name}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-marrow-light">
                Perché questo catalogo è presente nei tuoi suggerimenti
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {nomeFonte && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-marrow-deep">Origine del nome:</span>
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold">
                      {nomeFonte === 'tassonomia' ? 'Tassonomia' : nomeFonte === 'perche_hai_visto' ? 'Perché hai visto' : nomeFonte}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-marrow-deep">Medium:</span>
                  <span className="px-2 py-0.5 rounded-lg bg-white/70 border border-marrow-light/15 text-marrow-deep font-semibold">
                    {catalog.stremioType === 'anime' ? 'anime' : (catalog.media === 'series' || catalog.type === 'series' ? 'serie' : 'film')}
                  </span>
                </div>
                {typeof confidenza === 'number' && (
                  <div className="flex items-center gap-1.5 text-marrow-light/70">
                    <span className="font-bold text-marrow-deep">Confidenza:</span>
                    <span className="font-mono font-bold text-primary">{(confidenza * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-marrow-deep">
                  <span>Titoli del tuo profilo che lo hanno attivato</span>
                  <span className="font-mono text-marrow-light/70">({seeds.length})</span>
                </div>

                {seeds.length === 0 ? (
                  <p className="text-xs text-marrow-light/70 italic py-2.5 px-3 text-center bg-white/50 rounded-xl border border-marrow-light/10">
                    Questo catalogo raccomandato non ha titoli membri registrati nel profilo.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-marrow-light/10 bg-white/60 rounded-xl border border-marrow-light/15 overflow-hidden max-h-60 overflow-y-auto">
                    {seeds.map((seed, idx) => (
                      <div key={`${seed.tmdbId || seed.titolo}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-marrow-deep truncate">{seed.titolo}</span>
                          {seed.anno && (
                            <span className="text-marrow-light/60 font-mono shrink-0">({seed.anno})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-marrow-light/70 shrink-0">
                          {/*
                            Per una serie il numero è un numero di EPISODI, e solo quando viene
                            da Trakt (che consegna una voce per episodio). Per un film è quante
                            volte l'hai visto. `1` non è un'informazione: è il minimo di ogni
                            titolo presente in cronologia, quindi su una serie non si mostra.
                          */}
                          {typeof seed.plays === 'number' && Number.isFinite(seed.plays) && (() => {
                            const eSerie = seed.medium === 'series' || seed.medium === 'tv';
                            if (eSerie && seed.plays <= 1) return null;
                            const etichetta = eSerie
                              ? (seed.plays === 1 ? '1 episodio' : `${seed.plays} episodi`)
                              : (seed.plays === 1 ? '1 visione' : `${seed.plays} visioni`);
                            return (
                              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                                {etichetta}
                              </span>
                            );
                          })()}
                          {typeof seed.eta_giorni === 'number' && Number.isFinite(seed.eta_giorni) && (
                            <span className="text-marrow-light/60">
                              {seed.eta_giorni <= 0 ? 'oggi' : seed.eta_giorni === 1 ? '1 giorno fa' : `${seed.eta_giorni} gg fa`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
