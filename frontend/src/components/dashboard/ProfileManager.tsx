'use client';
import { useState } from 'react';
import { Profile, ProfileTemplate } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ProfileManagerProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  onSelectEditing: (id: string) => void;
  onSetActive: (id: string) => void;
  onAdd: (name: string) => void;
  profileTemplates?: ProfileTemplate[];
  onCreateFromTemplate?: (template: ProfileTemplate) => void;
  onRemove?: (id: string) => void;
  startRename?: () => void;
  onUpdateProfile?: (id: string, updates: Partial<Profile>) => void;
}

export function ProfileManager({
  profiles,
  editingProfileId,
  activeProfileId,
  onSelectEditing,
  onSetActive,
  onAdd,
  profileTemplates = [],
  onCreateFromTemplate,
  onRemove,
  startRename,
  onUpdateProfile,
}: ProfileManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
    setIsDialogOpen(false);
  };

  const editingProfile = profiles.find(p => p.id === editingProfileId);
  const isGlobalSelected = editingProfile?.id === 'global';

  const currentSelectors = editingProfile?.settings?.typeSelectors || { film: false, serie: false, anime: null };

  const handleToggleFilm = () => {
    if (!editingProfile) return;
    const newSelectors = {
      ...currentSelectors,
      film: !currentSelectors.film
    };
    onUpdateProfile?.(editingProfile.id, {
      settings: {
        ...editingProfile.settings,
        typeSelectors: newSelectors
      }
    });
  };

  const handleToggleSerie = () => {
    if (!editingProfile) return;
    const newSelectors = {
      ...currentSelectors,
      serie: !currentSelectors.serie
    };
    onUpdateProfile?.(editingProfile.id, {
      settings: {
        ...editingProfile.settings,
        typeSelectors: newSelectors
      }
    });
  };

  const handleToggleAnimeOnly = () => {
    if (!editingProfile) return;
    const newAnime: 'only' | 'exclude' | null = currentSelectors.anime === 'only' ? null : 'only';
    const newSelectors = {
      ...currentSelectors,
      anime: newAnime
    };
    onUpdateProfile?.(editingProfile.id, {
      settings: {
        ...editingProfile.settings,
        typeSelectors: newSelectors
      }
    });
  };

  const handleToggleNoAnime = () => {
    if (!editingProfile) return;
    const newAnime: 'only' | 'exclude' | null = currentSelectors.anime === 'exclude' ? null : 'exclude';
    const newSelectors = {
      ...currentSelectors,
      anime: newAnime
    };
    onUpdateProfile?.(editingProfile.id, {
      settings: {
        ...editingProfile.settings,
        typeSelectors: newSelectors
      }
    });
  };

  return (
    <section className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-marrow-deep text-base sm:text-xl font-bold">I tuoi Profili</h2>
          <span className="bg-primary/10 text-primary text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full">
            {profiles.length} Profil{profiles.length !== 1 ? 'i' : 'o'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {editingProfile && !isGlobalSelected && (
            <div className="flex items-center gap-1.5 mr-1 sm:mr-2 pr-2 sm:pr-4 border-r border-marrow-light/20">
              <button 
                onClick={() => onUpdateProfile?.(editingProfile.id, { settings: { ...editingProfile.settings, kidsMode: !editingProfile.settings?.kidsMode } })}
                title={editingProfile.settings?.kidsMode ? "Disabilita Modalità Bambini" : "Abilita Modalità Bambini"}
                className={`flex items-center justify-center size-9 sm:size-8 rounded-full transition-colors border shadow-sm touch-manipulation ${
                  editingProfile.settings?.kidsMode 
                    ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600' 
                    : 'bg-white/50 text-marrow-deep hover:bg-white hover:text-blue-500 border-marrow-light/10'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {editingProfile.settings?.kidsMode ? 'child_care' : 'child_friendly'}
                </span>
              </button>
              <button 
                onClick={startRename}
                title="Rinomina profilo selezionato"
                className="flex items-center justify-center size-9 sm:size-8 rounded-full bg-white/50 text-marrow-deep hover:bg-white hover:text-primary transition-colors border border-marrow-light/10 shadow-sm touch-manipulation"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button 
                onClick={() => onRemove?.(editingProfile.id)}
                title="Elimina profilo selezionato"
                className="flex items-center justify-center size-9 sm:size-8 rounded-full bg-destructive/5 text-destructive hover:bg-destructive hover:text-white transition-colors border border-destructive/10 shadow-sm touch-manipulation"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 cursor-pointer justify-center rounded-lg h-9 sm:h-9 px-3.5 sm:px-4 bg-primary text-white text-xs sm:text-sm font-bold hover:brightness-110 transition-all shadow-sm shadow-primary/20 min-h-[36px] touch-manipulation"
          >
            <span className="material-symbols-outlined text-xs sm:text-sm">add</span>
            <span className="hidden sm:inline">Nuovo Profilo</span>
            <span className="sm:hidden">Nuovo</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-4">
        {profiles.map((profile) => {
          const isActive = activeProfileId === profile.id;
          const isEditing = editingProfileId === profile.id;

          // Gestione sicura per le Emoji (estrazione del primo simbolo vero, inclusi surrogate pairs)
          let icon = Array.from(profile.name)[0].toUpperCase();

          return (
            <div
              key={profile.id}
              onClick={() => onSelectEditing(profile.id)} // Click seleziona per la modifica
              className={`flex flex-col items-center p-3 sm:p-4 rounded-xl border-2 gap-2 sm:gap-3 relative transition-all text-left w-full cursor-pointer group ${
                isActive
                  ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                  : isEditing
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-marrow-light/10 bg-white/30 hover:border-primary/30 hover:bg-white/50'
              }`}
            >
              <div
                className={`size-10 sm:size-12 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold shrink-0 transition-colors ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : isEditing
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'bg-marrow-light/10 text-marrow-deep group-hover:bg-primary/10 group-hover:text-primary'
                }`}
              >
                {icon}
              </div>

              <div className="text-center w-full flex flex-col items-center">
                <p className={`text-xs sm:text-sm font-bold truncate w-full ${isActive ? 'text-emerald-700' : isEditing ? 'text-primary' : 'text-marrow-deep'}`}>
                  {profile.name}
                </p>
                {isActive ? (
                  <p className="text-[10px] text-emerald-600 font-black uppercase mt-1 tracking-wider">
                    Attivo
                  </p>
                ) : isEditing ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); 
                      onSetActive(profile.id);
                    }}
                    title="Imposta come Attivo"
                    className="mt-1 flex items-center justify-center gap-1 w-full max-w-[100px] bg-emerald-500 text-white py-1 rounded-full text-[10px] font-bold uppercase hover:bg-emerald-600 transition-colors shadow-sm min-h-[28px] sm:min-h-[24px] touch-manipulation"
                  >
                    <span className="material-symbols-outlined text-[12px]">check</span>
                    Attiva
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selettori di Tipo del Profilo */}
      {editingProfile && (
        <div className="p-3 sm:p-4 rounded-xl border border-marrow-light/15 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-xl">tune</span>
            <div>
              <p className="text-xs sm:text-sm font-bold text-marrow-deep">
                Selettori di Tipo: <span className="text-primary font-black">{editingProfile.name}</span>
              </p>
              <p className="text-[10px] sm:text-xs text-marrow-light/70 font-medium">
                Filtra i cataloghi del profilo nel manifest di Stremio e nella dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            {/* Gruppo 1: Media (Film / Serie) - Indipendenti */}
            <div className="flex items-center gap-2 p-1 bg-white/80 rounded-lg border border-marrow-light/10 shadow-xs">
              <label className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-marrow-deep cursor-pointer hover:text-primary transition-colors select-none">
                <input
                  type="checkbox"
                  checked={Boolean(currentSelectors.film)}
                  onChange={handleToggleFilm}
                  className="rounded border-marrow-light/30 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
                />
                <span>Solo Film</span>
              </label>
              <span className="text-marrow-light/20">|</span>
              <label className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-marrow-deep cursor-pointer hover:text-primary transition-colors select-none">
                <input
                  type="checkbox"
                  checked={Boolean(currentSelectors.serie)}
                  onChange={handleToggleSerie}
                  className="rounded border-marrow-light/30 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
                />
                <span>Solo Serie</span>
              </label>
            </div>

            {/* Gruppo 2: Anime (Solo Anime / No Anime) - Mutuamente esclusivi */}
            <div className="flex items-center gap-2 p-1 bg-white/80 rounded-lg border border-marrow-light/10 shadow-xs">
              <label className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-marrow-deep cursor-pointer hover:text-primary transition-colors select-none">
                <input
                  type="checkbox"
                  checked={currentSelectors.anime === 'only'}
                  onChange={handleToggleAnimeOnly}
                  className="rounded border-marrow-light/30 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
                />
                <span>Solo Anime</span>
              </label>
              <span className="text-marrow-light/20">|</span>
              <label className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-marrow-deep cursor-pointer hover:text-primary transition-colors select-none">
                <input
                  type="checkbox"
                  checked={currentSelectors.anime === 'exclude'}
                  onChange={handleToggleNoAnime}
                  className="rounded border-marrow-light/30 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
                />
                <span>No Anime</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Dialog per Creazione Nuovo Profilo */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[92vw] sm:max-w-[600px] bg-background-light border-marrow-light/10 shadow-2xl p-0 overflow-hidden max-h-[90dvh] flex flex-col rounded-2xl sm:rounded-3xl">
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-marrow-deep flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">add_circle</span>
                Crea Nuovo Profilo
              </DialogTitle>
              <DialogDescription className="text-marrow-light/80">
                Puoi creare un profilo partendo da zero o usare un preset ottimizzato.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex flex-col gap-6">
              {/* Opzione 1: Da Zero */}
              <div className="flex flex-col gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                <label className="text-xs font-bold uppercase tracking-widest text-primary">
                  Vuoto / Personalizzato
                </label>
                <div className="flex gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome del nuovo profilo..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    className="bg-white border-marrow-light/20 flex-1 text-base sm:text-sm h-10 sm:h-9"
                  />
                  <Button onClick={handleAdd} className="bg-primary hover:brightness-110 shrink-0 font-bold min-h-[40px] px-4 touch-manipulation">
                    Crea
                  </Button>
                </div>
              </div>

              {/* Opzione 2: Preset */}
              {profileTemplates.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <hr className="flex-1 border-marrow-light/10" />
                    <span className="text-xs font-bold uppercase text-marrow-light/60">
                      Oppure scegli un Preset
                    </span>
                    <hr className="flex-1 border-marrow-light/10" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[250px] overflow-y-auto p-1 hide-scrollbar">
                    {profileTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          onCreateFromTemplate?.(tpl);
                          setIsDialogOpen(false);
                        }}
                        className="flex flex-col items-start p-3 rounded-xl border border-marrow-light/10 bg-white hover:border-primary/50 hover:bg-primary/5 transition-all text-left shadow-sm group/tpl touch-manipulation min-h-[44px]"
                      >
                        <p className="text-sm font-bold text-marrow-deep group-hover/tpl:text-primary transition-colors mb-1 truncate w-full">
                          {tpl.name}
                        </p>
                        <p className="text-xs text-marrow-light/70 font-medium line-clamp-2">
                          {tpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
