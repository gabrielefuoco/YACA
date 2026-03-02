'use client';
import { useState } from 'react';
import { Profile, Preset, Catalog, MyList, ProfileTemplate } from '@/types';
import { ProfileManager } from '@/components/dashboard/ProfileManager';
import { ActiveCatalogsPanel } from '@/components/dashboard/ActiveCatalogsPanel';
import { ExplorePanel } from '@/components/dashboard/ExplorePanel';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { cn } from '@/lib/utils';
import { Layers, Compass, Wand2, ChevronDown, ChevronUp } from 'lucide-react';

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
}: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('active');
  const [profilesExpanded, setProfilesExpanded] = useState(true);

  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? profiles[0];

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
    // Apply all presets from template to editing profile
    const currentPresets = editingProfile?.raw_ui_state.selectedPresets ?? [];
    for (const presetId of template.presets) {
      if (!currentPresets.includes(presetId)) {
        onTogglePreset(editingProfileId, presetId);
      }
    }
  };

  return (
    <div className="space-y-5">
      {/* Profile manager (collapsible) */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <button
          onClick={() => setProfilesExpanded(!profilesExpanded)}
          className="w-full flex items-center justify-between text-left group"
        >
          <span className="text-sm font-semibold text-white/70 uppercase tracking-wider group-hover:text-white/90 transition-colors">
            👤 Gestione Profili
          </span>
          {profilesExpanded ? (
            <ChevronUp className="h-4 w-4 text-white/40 group-hover:text-white/60 transition-colors" />
          ) : (
            <ChevronDown className="h-4 w-4 text-white/40 group-hover:text-white/60 transition-colors" />
          )}
        </button>

        {profilesExpanded && (
          <div className="mt-3">
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
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
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
