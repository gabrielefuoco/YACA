'use client';
import { useState } from 'react';
import { Profile, ProfileTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Check, Pencil, Trash2, X, BookTemplate, Sparkles } from 'lucide-react';

interface ProfileManagerProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  profileTemplates: ProfileTemplate[];
  onSelectEditing: (id: string) => void;
  onSetActive: (id: string) => void;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onApplyTemplate: (template: ProfileTemplate) => void;
}

export function ProfileManager({
  profiles,
  editingProfileId,
  activeProfileId,
  profileTemplates,
  onSelectEditing,
  onSetActive,
  onAdd,
  onRemove,
  onRename,
  onApplyTemplate,
}: ProfileManagerProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

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
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTemplates(!showTemplates)}
            className="h-7 text-xs"
            title="Modelli profilo"
          >
            <BookTemplate className="h-3.5 w-3.5 mr-1" />
            Modelli
          </Button>
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

      {/* Profile template cards */}
      {showTemplates && profileTemplates.length > 0 && (
        <div className="rounded-lg border border-[#8a5aeb]/20 bg-[#8a5aeb]/5 p-3">
          <p className="text-xs text-white/50 mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[#8a5aeb]" />
            Applica un modello al profilo selezionato
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {profileTemplates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => {
                  onApplyTemplate(tpl);
                  setShowTemplates(false);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left transition-all hover:border-[#8a5aeb]/40 hover:bg-[#8a5aeb]/10 group"
              >
                <p className="text-sm font-medium text-white group-hover:text-[#8a5aeb] transition-colors truncate">
                  {tpl.name}
                </p>
                <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{tpl.description}</p>
                <p className="text-[10px] text-white/25 mt-1">{tpl.presets.length} cataloghi</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            onClick={() => onSelectEditing(profile.id)}
            className={`relative shrink-0 cursor-pointer rounded-xl border px-4 py-3 min-w-[130px] transition-all ${
              editingProfileId === profile.id
                ? 'border-[#8a5aeb] bg-gradient-to-br from-[#8a5aeb]/15 to-[#8a5aeb]/5 shadow-lg shadow-[#8a5aeb]/10'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
            }`}
          >
            {activeProfileId === profile.id && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
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
