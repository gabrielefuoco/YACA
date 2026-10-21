'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Baby, Trash2, Settings2 } from 'lucide-react';
import type { Profile } from '@/types';

/** Le emoji che si possono scegliere. Fisse: un campo libero non è verificabile a video. */
const EMOJI_CHOICES = ['🏠', '🎬', '📺', '🎭', '🎨', '🧸', '👨‍👩‍👧', '🧑‍🚀', '🌙', '⭐', '🔥', '💎', '🎯', '🧠', '🎸', '🍿', '🚀', '🏮'];

type AnimeFilter = 'only' | 'exclude' | null;

const ANIME_OPTIONS: { value: AnimeFilter; label: string }[] = [
  { value: null, label: 'Tutti' },
  { value: 'only', label: 'Solo anime' },
  { value: 'exclude', label: 'No anime' },
];

interface ProfileSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  canDelete: boolean;
  onSave: (updates: Partial<Profile>) => void;
  onDelete?: () => void;
}

/**
 * Un solo posto dove si configura un profilo: nome, emoji, modalità bambini, filtro anime.
 *
 * Prima erano sparsi in tre punti (icona baby + matita + cestino nella riga, due checkbox in un
 * pannello sotto la griglia, un dialog a parte per il nome). Il filtro anime è un segmento a tre
 * stati perché «Solo anime» e «No anime» sono lo stesso valore: due checkbox potevano sembrare
 * entrambe spente e invece significavano «tutti».
 */
export function ProfileSettingsDialog({
  open,
  onOpenChange,
  profile,
  canDelete,
  onSave,
  onDelete,
}: ProfileSettingsDialogProps) {
  const [name, setName] = React.useState('');
  const [emoji, setEmoji] = React.useState<string | null>(null);
  const [kidsMode, setKidsMode] = React.useState(false);
  const [anime, setAnime] = React.useState<AnimeFilter>(null);

  React.useEffect(() => {
    if (!open || !profile) return;
    setName(profile.name ?? '');
    setEmoji(profile.emoji ?? null);
    setKidsMode(Boolean(profile.settings?.kidsMode));
    setAnime(profile.settings?.typeSelectors?.anime ?? null);
  }, [open, profile]);

  const avatar = emoji ?? Array.from(name.trim() || 'P')[0]?.toUpperCase() ?? 'P';

  const handleSave = () => {
    if (!profile) return;
    const nextName = name.trim() || profile.name;
    onSave({
      name: nextName,
      emoji: emoji ?? undefined,
      settings: {
        ...(profile.settings ?? {}),
        kidsMode,
        typeSelectors: {
          ...(profile.settings?.typeSelectors ?? {}),
          anime,
        },
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] sm:max-w-md max-h-[90dvh] flex flex-col rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-black flex items-center gap-2 text-marrow-deep">
            <Settings2 className="h-5 w-5 text-primary" />
            Impostazioni profilo
          </DialogTitle>
          <DialogDescription className="text-xs text-marrow-light">
            Valgono per questo profilo: nome, emoji, modalità bambini e filtro anime.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-3 overflow-y-auto hide-scrollbar">
          {/* Anteprima + nome */}
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-primary text-white flex items-center justify-center text-xl shrink-0 shadow-md shadow-primary/20">
              {avatar}
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label htmlFor="profile-name" className="text-xs font-bold uppercase tracking-wider text-marrow-light/70">
                Nome
              </label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome del profilo"
                className="h-11 min-h-[44px] text-base sm:text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>
          </div>

          {/* Emoji */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-marrow-light/70">Emoji</span>
            <div className="grid grid-cols-6 min-[420px]:grid-cols-9 gap-1">
              <button
                type="button"
                onClick={() => setEmoji(null)}
                aria-label="Nessuna emoji"
                aria-pressed={emoji === null}
                className={`size-11 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                  emoji === null ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-marrow-light/5 text-marrow-light/60 hover:bg-marrow-light/15'
                }`}
              >
                —
              </button>
              {EMOJI_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setEmoji(choice)}
                  aria-label={`Emoji ${choice}`}
                  aria-pressed={emoji === choice}
                  className={`size-11 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-lg transition-colors ${
                    emoji === choice ? 'bg-primary/15 ring-2 ring-primary' : 'bg-marrow-light/5 hover:bg-marrow-light/15'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
            <p className="text-xs text-marrow-light/60">Senza emoji l&apos;avatar mostra la prima lettera del nome.</p>
          </div>

          {/* Modalità bambini */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-marrow-light/15 bg-white/50 px-3 min-h-[56px]">
            <div className="flex items-center gap-2">
              <Baby className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-bold text-marrow-deep">Modalità bambini</p>
                <p className="text-xs text-marrow-light/70">Filtra i contenuti per età nel manifest.</p>
              </div>
            </div>
            <Switch checked={kidsMode} onCheckedChange={setKidsMode} aria-label="Modalità bambini" />
          </div>

          {/* Filtro anime: un valore, tre stati */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-marrow-light/70">Filtro anime</span>
            <div role="group" aria-label="Filtro anime" className="grid grid-cols-3 gap-1 p-1 bg-marrow-light/10 rounded-xl">
              {ANIME_OPTIONS.map((option) => {
                const selected = anime === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAnime(option.value)}
                    className={`min-h-[44px] rounded-lg px-2 text-xs font-bold transition-colors touch-manipulation ${
                      selected ? 'bg-primary text-white shadow-sm' : 'text-marrow-deep hover:bg-white/60'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-marrow-light/60">
              Decide quali cataloghi restano accesi: è lo stesso filtro che vedi su «Cataloghi Attivi» e «Esplora».
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-col-reverse sm:flex-row sm:justify-between">
          {canDelete ? (
            <Button
              variant="ghost"
              onClick={() => {
                onDelete?.();
                onOpenChange(false);
              }}
              className="min-h-[44px] text-destructive hover:bg-destructive/10 hover:text-destructive justify-start w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Elimina profilo
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="min-h-[44px]">
              Annulla
            </Button>
            <Button onClick={handleSave} className="min-h-[44px] bg-primary hover:brightness-110">
              Salva
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
