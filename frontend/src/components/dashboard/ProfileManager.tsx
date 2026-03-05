'use client';
import { useState } from 'react';
import { Profile } from '@/types';
import { Input } from '@/components/ui/input';

interface ProfileManagerProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  onSelectEditing: (id: string) => void;
  onSetActive: (id: string) => void;
  onAdd: (name: string) => void;
}

export function ProfileManager({
  profiles,
  editingProfileId,
  activeProfileId,
  onSelectEditing,
  onSetActive,
  onAdd,
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
          <h2 className="text-slate-900 dark:text-slate-100 text-xl font-bold">I tuoi Profili</h2>
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
              className="h-9 w-32 md:w-48 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            />
            <button onClick={handleAdd} className="flex items-center justify-center rounded-lg h-9 w-9 bg-primary text-white hover:brightness-110">
              <span className="material-symbols-outlined text-sm">check</span>
            </button>
            <button onClick={() => setAdding(false)} className="flex items-center justify-center rounded-lg h-9 w-9 bg-slate-200 dark:bg-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 cursor-pointer justify-center rounded-lg h-9 px-4 bg-primary text-slate-100 text-sm font-bold hover:brightness-110 transition-all"
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

          if (isActive) {
            return (
              <div
                key={profile.id}
                onClick={() => onSelectEditing(profile.id)}
                className={`flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer gap-3 relative transition-all ${isEditing ? 'border-primary bg-primary/5' : 'border-primary/50 bg-primary/5 hover:border-primary'}`}
              >
                <div className="size-12 rounded-full bg-primary text-white flex items-center justify-center">
                  {icon.length > 2 ? <span className="material-symbols-outlined">{icon}</span> : icon}
                </div>
                <div className="text-center w-full">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate w-full">{profile.name}</p>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase mt-0.5">Attivo</p>
                </div>
                <div className="absolute top-2 right-2">
                  <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={profile.id}
              onClick={() => onSelectEditing(profile.id)}
              className={`flex flex-col items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/40 gap-3 hover:border-primary/50 transition-all cursor-pointer ${isEditing ? 'ring-2 ring-primary/30 border-primary/50' : ''}`}
            >
              <div className="size-12 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 flex items-center justify-center font-bold">
                {icon.length > 2 ? <span className="material-symbols-outlined">{icon}</span> : icon}
              </div>
              <div className="text-center w-full">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate w-full">{profile.name}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
