'use client';
import { useState } from 'react';
import { Profile, Preset, Catalog, MyList, ProfileTemplate } from '@/types';
import { ProfileManager } from '@/components/dashboard/ProfileManager';
import { ProfileSettingsPanel } from '@/components/dashboard/ProfileSettingsPanel';
import { ActiveCatalogsPanel } from '@/components/dashboard/ActiveCatalogsPanel';
import { ExplorePanel } from '@/components/dashboard/ExplorePanel';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { DnaAndAiPanel } from '@/components/dashboard/DnaAndAiPanel';
import { RenameProfileDialog } from '@/components/modals/RenameProfileDialog';

type DashboardTab = 'active' | 'explore' | 'creator' | 'dna';

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
  onTemplateApplied?: (profileId: string, selectedPresets: string[]) => Promise<void> | void;
  syncStatus: any;
  syncProfileVectors: (profileId: string, userId: string) => Promise<any>;
  userId?: string;
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
  onTemplateApplied,
  syncStatus,
  syncProfileVectors,
  userId,
}: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('active');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? profiles[0];

  const handleApplyTemplate = async (template: ProfileTemplate) => {
    const currentPresets = editingProfile?.raw_ui_state.selectedPresets ?? [];
    const mergedPresets = Array.from(new Set([...currentPresets, ...template.presets]));
    const currentOrder = editingProfile?.raw_ui_state.catalogOrder ?? [];
    const mergedOrder = [...currentOrder];
    for (const presetId of template.presets) {
      if (!mergedOrder.includes(presetId)) {
        mergedOrder.push(presetId);
      }
    }
    onUpdateProfile(editingProfileId, {
      raw_ui_state: {
        ...editingProfile.raw_ui_state,
        selectedPresets: mergedPresets,
        catalogOrder: mergedOrder,
      },
    });
    await onTemplateApplied?.(editingProfileId, mergedPresets);
  };

  const myListCatalogs: Catalog[] = myLists.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    source: 'mylist',
    filters: l.filters,
    raw_prompt: l.prompt,
    emoji: '📝',
  }));

  const tabsItems = [
    { id: 'active' as const, label: 'Cataloghi Attivi', icon: 'grid_view' },
    { id: 'explore' as const, label: 'Esplora', icon: 'explore' },
    { id: 'creator' as const, label: 'Creatore', icon: 'auto_fix' },
    { id: 'dna' as const, label: 'DNA & AI Lab', icon: 'biotech' },
  ];

  return (
    <div className="flex flex-col w-full gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-marrow-deep text-3xl font-black leading-tight tracking-tight text-center md:text-left">Dashboard</h1>
        <p className="text-marrow-light text-sm text-center md:text-left font-medium">Gestisci i tuoi profili e personalizza i cataloghi multimediali</p>
      </div>

      {/* Profiles Section */}
      <ProfileManager
        profiles={profiles}
        editingProfileId={editingProfileId}
        activeProfileId={activeProfileId}
        onSelectEditing={onSelectEditing}
        onSetActive={onSetActive}
        onAdd={onAddProfile}
      />

      {/* Profile Settings Panel */}
      {editingProfile && (
        <ProfileSettingsPanel
          profile={editingProfile}
          profileTemplates={profileTemplates}
          onApplyTemplate={handleApplyTemplate}
          onUpdateProfile={onUpdateProfile}
          onSetActive={onSetActive}
          onRemove={onRemoveProfile}
          isActive={editingProfileId === activeProfileId}
          startRename={() => {
            if (editingProfile.id === 'global') return;
            setIsRenameOpen(true);
          }}
        />
      )}

      {/* Navigation Tabs */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex p-1.5 bg-white/40  rounded-2xl border border-marrow-light/20 shadow-xl shadow-primary/5 max-w-full overflow-x-auto hide-scrollbar">
          {tabsItems.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all duration-300 whitespace-nowrap
                ${activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/40 scale-105'
                  : 'text-marrow-light hover:text-primary hover:bg-primary/5'
                }
              `}
            >
              <span className={`material-symbols-outlined text-lg ${activeTab === tab.id ? 'animate-pulse' : ''}`}>{tab.icon}</span>
              <span className="uppercase tracking-wider">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full">
        <div className="glass-panel p-6 sm:p-8 min-h-[500px] relative overflow-hidden transition-all duration-500 bg-white/40 shadow-xl shadow-primary/5 rounded-2xl border border-marrow-light/10">
          {/* Subtle decorative elements */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 blur-3xl rounded-full" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/5 blur-3xl rounded-full" />

          <div className="relative z-10">
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
                onAddCatalog={(catalog) => onAddCatalog(editingProfileId, catalog)}
              />
            )}

            {activeTab === 'dna' && editingProfile && (
              <DnaAndAiPanel
                profile={editingProfile}
                onUpdateProfile={onUpdateProfile}
                syncStatus={syncStatus}
                syncProfileVectors={syncProfileVectors}
                userId={userId}
              />
            )}
          </div>
        </div>
      </div>

      <RenameProfileDialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        currentName={editingProfile?.name ?? ''}
        onRename={(newName) => onRenameProfile(editingProfile.id, newName)}
      />
    </div>
  );
}
