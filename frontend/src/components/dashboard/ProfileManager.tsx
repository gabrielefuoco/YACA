'use client';
import { useState } from 'react';
import { Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Check, Pencil, Trash2, X } from 'lucide-react';

interface ProfileManagerProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  onSelectEditing: (id: string) => void;
  onSetActive: (id: string) => void;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function ProfileManager({
  profiles,
  editingProfileId,
  activeProfileId,
  onSelectEditing,
  onSetActive,
  onAdd,
  onRemove,
  onRename,
}: ProfileManagerProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
    setAdding(false);
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Profili</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding(!adding)}
          className="h-7 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nuovo
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome profilo..."
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
            className="h-8"
          />
          <Button size="sm" onClick={handleAdd} className="h-8 shrink-0">
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)} className="h-8 shrink-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            onClick={() => onSelectEditing(profile.id)}
            className={`relative shrink-0 cursor-pointer rounded-xl border px-4 py-3 min-w-[120px] transition-all ${
              editingProfileId === profile.id
                ? 'border-[#8a5aeb] bg-[#8a5aeb]/10'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            {activeProfileId === profile.id && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-emerald-400" title="Attivo" />
            )}
            {renamingId === profile.id ? (
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                onBlur={commitRename}
                className="h-6 text-xs p-1"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="text-sm font-medium text-white truncate max-w-[100px]">{profile.name}</p>
            )}
            <p className="text-xs text-white/40 mt-0.5">
              {profile.existingCatalogs.length} cataloghi
            </p>
            <div className="mt-2 flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetActive(profile.id);
                }}
                title="Imposta attivo"
                className={`rounded p-0.5 text-xs transition-colors ${
                  activeProfileId === profile.id
                    ? 'text-emerald-400'
                    : 'text-white/30 hover:text-emerald-400'
                }`}
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(profile.id, profile.name);
                }}
                className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {profiles.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(profile.id);
                  }}
                  className="rounded p-0.5 text-white/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
