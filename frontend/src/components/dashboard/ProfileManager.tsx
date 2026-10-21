'use client';
import { useState } from 'react';
import { Profile, ProfileTemplate } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Baby, Check, Settings2, PlusCircle, Plus } from 'lucide-react';

interface ProfileManagerProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  onSelectEditing: (id: string) => void;
  onSetActive: (id: string) => void;
  onAdd: (name: string) => void;
  profileTemplates?: ProfileTemplate[];
  onCreateFromTemplate?: (template: ProfileTemplate) => void;
  onOpenSettings: () => void;
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
  onOpenSettings,
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

  return (
    <section className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-marrow-deep text-base sm:text-xl font-bold">I tuoi Profili</h2>
          <span className="bg-primary/10 text-primary text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full">
            {profiles.length} Profil{profiles.length !== 1 ? 'i' : 'o'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {editingProfile && (
            <button
              onClick={onOpenSettings}
              title="Impostazioni del profilo"
              className="flex items-center justify-center gap-1.5 rounded-lg min-h-[44px] h-11 px-3 sm:px-4 bg-white/80 text-marrow-deep hover:bg-white hover:text-primary transition-colors border border-marrow-light/20 shadow-sm touch-manipulation"
            >
              <Settings2 className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-bold">Impostazioni</span>
            </button>
          )}

          <button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 cursor-pointer justify-center rounded-lg min-h-[44px] h-11 px-3.5 sm:px-4 bg-primary text-white text-xs sm:text-sm font-bold hover:brightness-110 transition-all shadow-sm shadow-primary/20 touch-manipulation"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Nuovo Profilo</span>
            <span className="sm:hidden">Nuovo</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
        {profiles.map((profile) => {
          const isActive = activeProfileId === profile.id;
          const isEditing = editingProfileId === profile.id;

          // Gestione sicura per le Emoji (estrazione del primo simbolo vero, inclusi surrogate pairs)
          const icon = profile.emoji ?? (Array.from(profile.name)[0]?.toUpperCase() ?? 'P');

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
                {(profile.settings?.kidsMode || profile.settings?.typeSelectors?.anime) && (
                  <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
                    {profile.settings?.kidsMode && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 text-blue-700 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
                        title="Modalità bambini attiva"
                      >
                        <Baby className="h-2.5 w-2.5" /> Bambini
                      </span>
                    )}
                    {profile.settings?.typeSelectors?.anime === 'only' && (
                      <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide">
                        Solo anime
                      </span>
                    )}
                    {profile.settings?.typeSelectors?.anime === 'exclude' && (
                      <span className="rounded-full bg-marrow-light/15 text-marrow-deep px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide">
                        No anime
                      </span>
                    )}
                  </div>
                )}
                {isActive ? (
                  <p className="text-xs text-emerald-600 font-black uppercase mt-1 tracking-wider">
                    Attivo
                  </p>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); 
                      onSetActive(profile.id);
                    }}
                    title="Imposta come Attivo"
                    className="mt-1 flex items-center justify-center gap-1 w-full max-w-[100px] bg-emerald-500 text-white py-1 rounded-full text-xs font-bold uppercase hover:bg-emerald-600 transition-colors shadow-sm min-h-[44px] h-11 touch-manipulation"
                  >
                    <Check className="h-3 w-3" />
                    Attiva
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selettori di Tipo del Profilo */}
      {/* Dialog per Creazione Nuovo Profilo */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[92vw] sm:max-w-[600px] p-0 overflow-hidden max-h-[90dvh] flex flex-col rounded-2xl sm:rounded-3xl">
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 hide-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-marrow-deep flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-primary" />
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
                    className="bg-white border-marrow-light/20 flex-1 text-base sm:text-sm h-11 sm:h-11 min-h-[44px]"
                  />
                  <Button onClick={handleAdd} className="bg-primary hover:brightness-110 shrink-0 font-bold min-h-[44px] h-11 px-4 touch-manipulation">
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
