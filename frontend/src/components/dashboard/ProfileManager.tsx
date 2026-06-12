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
}: ProfileManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
    setIsDialogOpen(false);
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-marrow-deep text-xl font-bold">I tuoi Profili</h2>
          <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
            {profiles.length} Profil{profiles.length !== 1 ? 'i' : 'o'}
          </span>
        </div>

        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center gap-2 cursor-pointer justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-bold hover:brightness-110 transition-all shadow-sm shadow-primary/20"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          <span>Nuovo Profilo</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {profiles.map((profile) => {
          const isActive = activeProfileId === profile.id;
          const isEditing = editingProfileId === profile.id;

          // Gestione sicura per le Emoji (estrazione del primo simbolo vero, inclusi surrogate pairs)
          let icon = Array.from(profile.name)[0].toUpperCase();

          return (
            <div
              key={profile.id}
              onClick={() => onSelectEditing(profile.id)} // Click seleziona per la modifica
              className={`flex flex-col items-center p-4 rounded-xl border-2 gap-3 relative transition-all text-left w-full cursor-pointer group ${
                isActive
                  ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                  : isEditing
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-marrow-light/10 bg-white/30 hover:border-primary/30 hover:bg-white/50'
              }`}
            >
              <div
                className={`size-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0 transition-colors ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : isEditing
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'bg-marrow-light/10 text-marrow-deep group-hover:bg-primary/10 group-hover:text-primary'
                }`}
              >
                {icon}
              </div>

              <div className="text-center w-full">
                <p className={`text-sm font-bold truncate w-full ${isActive ? 'text-emerald-700' : isEditing ? 'text-primary' : 'text-marrow-deep'}`}>
                  {profile.name}
                </p>
                {isActive && (
                  <p className="text-[10px] text-emerald-600 font-black uppercase mt-0.5 tracking-wider">
                    Attivo
                  </p>
                )}
              </div>

              {/* Pulsante Attiva rapido sulla card */}
              {!isActive && isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); 
                    onSetActive(profile.id);
                  }}
                  title="Imposta come Attivo"
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-primary/20 text-primary text-[10px] font-bold uppercase hover:bg-primary hover:text-white transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[12px]">check</span>
                  Attiva
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog per Creazione Nuovo Profilo */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-background-light border-marrow-light/10 shadow-2xl p-0 overflow-hidden">
          <div className="p-6">
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
                    className="bg-white border-marrow-light/20 flex-1"
                  />
                  <Button onClick={handleAdd} className="bg-primary hover:brightness-110 shrink-0 font-bold">
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
                        className="flex flex-col items-start p-3 rounded-xl border border-marrow-light/10 bg-white hover:border-primary/50 hover:bg-primary/5 transition-all text-left shadow-sm group/tpl"
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
