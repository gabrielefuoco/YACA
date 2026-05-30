'use client';
import { useState } from 'react';
import { Profile, ProfileTemplate } from '@/types';
import { Input } from '@/components/ui/input';

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
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
    setAdding(false);
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-marrow-deep text-xl font-bold">I tuoi Profili</h2>
          <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
            {profiles.length} Profil{profiles.length !== 1 ? 'i' : 'o'}
          </span>
        </div>

        {adding ? (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome profilo..."
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              autoFocus
             className="h-9 w-32 md:w-48 bg-white/60 border-marrow-light/10"
            />
            <button onClick={handleAdd} className="flex items-center justify-center rounded-lg h-9 w-9 bg-primary text-white hover:brightness-110">
              <span className="material-symbols-outlined text-sm">check</span>
            </button>
            <button onClick={() => setAdding(false)} className="flex items-center justify-center rounded-lg h-9 w-9 bg-marrow-light/10 text-marrow-light hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 cursor-pointer justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-bold hover:brightness-110 transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            <span>Nuovo</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {profiles.map((profile) => {
          const isActive = activeProfileId === profile.id;
          const isEditing = editingProfileId === profile.id;

          let icon = profile.name.charAt(0).toUpperCase();
          if (profile.name.startsWith('🏠')) icon = 'home';
          else if (profile.name.startsWith('🎬') || profile.name.startsWith('📺') || profile.name.startsWith('🎭')) icon = 'movie';

          return (
            <button
              key={profile.id}
              onClick={() => onSelectEditing(profile.id)}
              className={`flex flex-col items-center p-4 rounded-xl border-2 gap-3 relative transition-all text-left w-full ${
                isEditing
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-lg shadow-primary/5'
                  : 'border-marrow-light/10 bg-white/30 hover:border-primary/50 hover:bg-white/50'
              }`}
            >
              <div className={`size-12 rounded-full flex items-center justify-center font-bold shrink-0 transition-colors ${
                isEditing 
                  ? 'bg-primary text-white shadow-md shadow-primary/20' 
                  : isActive 
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-marrow-light/10 text-marrow-light'
              }`}>
                {icon.length > 2 ? <span className="material-symbols-outlined">{icon}</span> : icon}
              </div>
              <div className="text-center w-full">
                <p className="text-sm font-bold text-marrow-deep truncate w-full">{profile.name}</p>
                {isActive && <p className="text-[10px] text-emerald-500 font-black uppercase mt-0.5 tracking-wider">Attivo</p>}
              </div>

              {/* Status Indicators */}
              <div className="absolute top-2 right-2 flex gap-1">
                {isActive && (
                  <div className="size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                )}
                {isEditing && !isActive && (
                  <span className="material-symbols-outlined text-primary text-sm">edit</span>
                )}
                {isEditing && isActive && (
                  <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {profileTemplates.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-marrow-deep text-lg font-bold">Oppure parti da un Profilo Preimpostato</h3>
            <span className="material-symbols-outlined text-primary">auto_awesome</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {profileTemplates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => onCreateFromTemplate?.(tpl)}
                className="flex flex-col items-start p-4 rounded-xl border-2 border-marrow-light/10 bg-white/30 hover:border-primary/50 hover:bg-white/50 transition-all text-left shadow-sm group"
              >
                <p className="text-sm font-bold text-marrow-deep group-hover:text-primary transition-colors mb-1">{tpl.name}</p>
                <p className="text-xs text-marrow-light/80 font-medium line-clamp-2">{tpl.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
