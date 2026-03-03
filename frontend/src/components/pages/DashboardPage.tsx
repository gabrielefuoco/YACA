'use client';
import { useState } from 'react';
import { Profile, Preset, Catalog, MyList, ProfileTemplate, Pillar } from '@/types';
import { ProfileManager } from '@/components/dashboard/ProfileManager';
import { ActiveCatalogsPanel } from '@/components/dashboard/ActiveCatalogsPanel';
import { ExplorePanel } from '@/components/dashboard/ExplorePanel';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { cn } from '@/lib/utils';
import { Layers, Compass, Wand2, X, Plus } from 'lucide-react';
import { api } from '@/lib/api';

type DashboardTab = 'active' | 'explore' | 'creator';

interface DashboardPageProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  presets: Preset[];
  categories: string[];
  profileTemplates: ProfileTemplate[];
  myLists: MyList[];
  onSelectEditing: (id: string) => void;
  onSetActive: (id: string) => void;
  onAddProfile: (name: string) => void;
  onRemoveProfile: (id: string) => void;
  onRenameProfile: (id: string, name: string) => void;
  onTogglePreset: (profileId: string, presetId: string) => void;
  onReorderCatalogs: (profileId: string, catalogs: Catalog[]) => void;
  onRemoveCatalog: (profileId: string, catalogId: string) => void;
  onAddCatalog: (profileId: string, catalog: Catalog) => void;
  onSaveMyList: (list: MyList) => void;
  onRemoveMyList: (id: string) => void;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
}

export function DashboardPage({
  profiles,
  editingProfileId,
  activeProfileId,
  presets,
  categories,
  profileTemplates,
  myLists,
  onSelectEditing,
  onSetActive,
  onAddProfile,
  onRemoveProfile,
  onRenameProfile,
  onTogglePreset,
  onReorderCatalogs,
  onRemoveCatalog,
  onAddCatalog,
  onSaveMyList,
  onRemoveMyList,
  onUpdateProfile,
}: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('active');

  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? profiles[0];
  const profileKeywords: Pillar[] = editingProfile?.settings?.manualPillars ?? [];
  const suggestedKeywords: Pillar[] = editingProfile?.settings?.suggestedPillars ?? [];

  const handleAddPillar = (pillar: Pillar) => {
    if (profileKeywords.find((p) => String(p.id) === String(pillar.id))) return;
    const newPillars = [...profileKeywords, pillar];
    onUpdateProfile(editingProfile.id, {
      settings: { ...editingProfile.settings, manualPillars: newPillars },
    });
  };

  const handleRemovePillar = (pillarId: string) => {
    const newPillars = profileKeywords.filter((p) => String(p.id) !== String(pillarId));
    onUpdateProfile(editingProfile.id, {
      settings: { ...editingProfile.settings, manualPillars: newPillars },
    });
  };

  const tabs = [
    { id: 'active' as const, label: 'Cataloghi Attivi', icon: Layers },
    { id: 'explore' as const, label: 'Esplora', icon: Compass },
    { id: 'creator' as const, label: 'Creatore', icon: Wand2 },
  ];

  const myListCatalogs: Catalog[] = myLists.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    source: 'mylist',
    filters: l.filters,
    raw_prompt: l.prompt,
    emoji: '📝',
  }));

  const handleApplyTemplate = (template: ProfileTemplate) => {
    const currentPresets = editingProfile?.raw_ui_state.selectedPresets ?? [];
    for (const presetId of template.presets) {
      if (!currentPresets.includes(presetId)) {
        onTogglePreset(editingProfileId, presetId);
      }
    }
  };

  return (
    <div className="space-y-5">
      {/* Profile manager */}
      <ProfileManager
        profiles={profiles}
        editingProfileId={editingProfileId}
        activeProfileId={activeProfileId}
        profileTemplates={profileTemplates}
        onSelectEditing={onSelectEditing}
        onSetActive={onSetActive}
        onAdd={onAddProfile}
        onRemove={onRemoveProfile}
        onRename={onRenameProfile}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* Profile keywords section */}
      <div className="rounded-xl border border-[#8a5aeb]/30 bg-[#8a5aeb]/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#8a5aeb] uppercase tracking-wider">
            🔑 Parole Chiave del Profilo
          </h3>
          {profileKeywords.length > 2 && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-2 py-0.5">
              ⚠️ Molti pilastri attivi
            </span>
          )}
        </div>
        <p className="text-xs text-white/40">
          Vincola le raccomandazioni del profilo <strong className="text-white/60">{editingProfile?.name}</strong> a temi specifici. Troppi vincoli possono ridurre i risultati.
        </p>

        <div className="flex flex-wrap gap-2">
          {profileKeywords.length === 0 && (
            <p className="text-xs text-white/30 italic">Nessuna parola chiave configurata.</p>
          )}
          {profileKeywords.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-[#8a5aeb] text-white px-3 py-1 text-xs font-medium"
            >
              {p.type === 'genre' ? '🎭' : p.type === 'country' ? '🌍' : '🔑'} {p.name}
              <button
                onClick={() => handleRemovePillar(String(p.id))}
                className="ml-1 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        <AutocompleteSearch
          placeholder="Cerca una parola chiave da aggiungere…"
          searchFn={api.searchTmdbKeywords}
          onSelect={(item) =>
            handleAddPillar({ type: 'keyword', id: String(item.id), name: item.name })
          }
        />

        {suggestedKeywords.filter((sp) => !profileKeywords.find((mp) => String(mp.id) === String(sp.id))).length > 0 && (
          <div className="pt-2 border-t border-[#8a5aeb]/20">
            <p className="text-[11px] text-[#8a5aeb] mb-2">Suggeriti per te</p>
            <div className="flex flex-wrap gap-2">
              {suggestedKeywords
                .filter((sp) => !profileKeywords.find((mp) => String(mp.id) === String(sp.id)))
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddPillar(p)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#8a5aeb]/40 bg-[#8a5aeb]/10 text-[#8a5aeb] px-3 py-1 text-xs font-medium hover:bg-[#8a5aeb]/20 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {p.type === 'genre' ? '🎭' : p.type === 'country' ? '🌍' : '🔑'} {p.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Section chip tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-all shrink-0',
              activeTab === id
                ? 'bg-gradient-to-r from-[#8a5aeb] to-[#6d3fd4] text-white shadow-lg shadow-[#8a5aeb]/25'
                : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white border border-white/[0.06]'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="pt-2">
        {activeTab === 'active' && editingProfile && (
          <ActiveCatalogsPanel
            profile={editingProfile}
            onReorder={(catalogs) => onReorderCatalogs(editingProfileId, catalogs)}
            onRemove={(id) => onRemoveCatalog(editingProfileId, id)}
            onMerge={(catalog) => onAddCatalog(editingProfileId, catalog)}
            presets={presets}
            myLists={myListCatalogs}
            onRemoveMyList={onRemoveMyList}
          />
        )}

        {activeTab === 'explore' && editingProfile && (
          <ExplorePanel
            presets={presets}
            categories={categories}
            profile={editingProfile}
            onTogglePreset={(presetId) => onTogglePreset(editingProfileId, presetId)}
          />
        )}

        {activeTab === 'creator' && (
          <CreatorPanel
            onSaveList={onSaveMyList}
            onAddCatalog={(catalog) => onAddCatalog(editingProfileId, catalog)}
          />
        )}
      </div>
    </div>
  );
}
