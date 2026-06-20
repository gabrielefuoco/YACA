'use client';
import { useState, useEffect } from 'react';
import { Profile, Preset, Catalog, MyList, ProfileTemplate } from '@/types';
import { ProfileManager } from '@/components/dashboard/ProfileManager';
import { ActiveCatalogsPanel } from '@/components/dashboard/ActiveCatalogsPanel';
import { ExplorePanel } from '@/components/dashboard/ExplorePanel';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { DnaAndAiPanel } from '@/components/dashboard/DnaAndAiPanel';
import { ListManagerPanel, UserList } from '@/components/dashboard/ListManagerPanel';
import { ListEditorPanel } from '@/components/dashboard/ListEditorPanel';
import { RenameProfileDialog } from '@/components/modals/RenameProfileDialog';
import { EditCatalogModal } from '@/components/modals/EditCatalogModal';
import { generateId } from '@/lib/utils';
import { api } from '@/lib/api';

type DashboardTab = 'active' | 'explore' | 'creator' | 'lists' | 'dna';

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
  onAddProfile: (name: string) => Profile;
  onRemoveProfile: (id: string) => void;
  onRenameProfile: (id: string, name: string) => void;
  onTogglePreset: (profileId: string, presetId: string) => void;
  onReorderCatalogs: (profileId: string, catalogs: Catalog[]) => void;
  onRemoveCatalog: (profileId: string, catalogId: string) => void;
  onAddCatalog: (profileId: string, catalog: Catalog) => void;
  onUpdateCatalog: (profileId: string, catalog: Catalog) => void;
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
  onUpdateCatalog,
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
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? profiles[0];

  const [customLists, setCustomLists] = useState<UserList[]>([]);
  const [editingList, setEditingList] = useState<UserList | null | undefined>(undefined);
  const [listsLoading, setListsLoading] = useState(false);

  const fetchCustomLists = async () => {
    setListsLoading(true);
    try {
      const res = await api.getLists();
      if (res.success && Array.isArray(res.lists)) {
        setCustomLists(res.lists);
      }
    } catch (err) {
      console.error('Error fetching custom lists:', err);
    } finally {
      setListsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'lists') {
      fetchCustomLists();
    }
  }, [activeTab]);

  const activeCatalogIds = editingProfile?.existingCatalogs?.map(c => c.id) || [];

  const handleActivateList = (list: UserList) => {
    onAddCatalog(editingProfileId, {
      id: list.listId,
      name: list.name,
      type: list.type,
      source: 'manual_items',
      queries: list.queries,
      presentation_strategy: list.presentation_strategy || 'popularity',
      emoji: '📝'
    });
  };

  const handleDeactivateList = (listId: string) => {
    onRemoveCatalog(editingProfileId, listId);
  };

  const handleEditCatalog = (catalog: Catalog) => {
    let catToEdit = { ...catalog };
    if (catalog.source === 'preset') {
      const preset = presets.find(p => p.id === catalog.id);
      if (preset) {
        catToEdit.filters = preset.filters;
        catToEdit.queries = preset.queries;
      }
    }
    setEditingCatalog(catToEdit);
    setIsEditOpen(true);
  };

  const handleDuplicateCatalog = (catalog: Catalog) => {
    let filters = catalog.filters ? JSON.parse(JSON.stringify(catalog.filters)) : undefined;
    let queries = catalog.queries ? JSON.parse(JSON.stringify(catalog.queries)) : undefined;
    if (catalog.source === 'preset') {
      const preset = presets.find(p => p.id === catalog.id);
      if (preset) {
        filters = preset.filters ? JSON.parse(JSON.stringify(preset.filters)) : undefined;
        queries = preset.queries ? JSON.parse(JSON.stringify(preset.queries)) : undefined;
      }
    }

    // Ensure filters is populated from queries if missing (especially for presets)
    if (!filters && queries) {
      if (queries.length > 1) {
        filters = { queries: JSON.parse(JSON.stringify(queries)), presentation_strategy: catalog.presentation_strategy || 'popularity' };
      } else if (queries.length === 1) {
        filters = JSON.parse(JSON.stringify(queries[0]));
      }
    }

    const duplicated: Catalog = {
      id: 'custom_' + generateId(),
      name: `${catalog.name} (Copia)`,
      type: catalog.type,
      source: 'manual',
      filters,
      queries,
      presentation_strategy: catalog.presentation_strategy || 'popularity',
      emoji: catalog.emoji || '🎨',
    };
    onAddCatalog(editingProfileId, duplicated);
  };

  const handleCreateFromTemplate = async (template: ProfileTemplate) => {
    // Creates a new profile with the template's name
    const newProfile = onAddProfile(template.name);
    
    // Set the template's presets to the new profile
    onUpdateProfile(newProfile.id, {
      raw_ui_state: {
        ...newProfile.raw_ui_state,
        selectedPresets: template.presets,
        catalogOrder: template.presets,
      },
    });

    onSetActive(newProfile.id);
    onSelectEditing(newProfile.id);
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
    { id: 'lists' as const, label: 'Liste Custom', icon: 'playlist_play' },
    { id: 'dna' as const, label: 'DNA & AI Lab', icon: 'biotech' },
  ];

  return (
    <div className="flex flex-col w-full gap-4 sm:gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-marrow-deep text-2xl sm:text-3xl font-black leading-tight tracking-tight text-center md:text-left">Dashboard</h1>
        <p className="text-marrow-light text-xs sm:text-sm text-center md:text-left font-medium">Gestisci i tuoi profili e personalizza i cataloghi multimediali</p>
      </div>

      {/* Profiles Section (Common Box) */}
      <div className="glass-panel p-4 sm:p-8 bg-white/40 shadow-xl shadow-primary/5 rounded-2xl border border-marrow-light/10 relative overflow-hidden">
        <ProfileManager
          profiles={profiles}
          editingProfileId={editingProfileId}
          activeProfileId={activeProfileId}
          onSelectEditing={onSelectEditing}
          onSetActive={onSetActive}
          onAdd={onAddProfile}
          profileTemplates={profileTemplates}
          onCreateFromTemplate={handleCreateFromTemplate}
          onRemove={(id) => onRemoveProfile(id)}
          onUpdateProfile={onUpdateProfile}
          startRename={() => {
            if (editingProfile?.id === 'global') return;
            setIsRenameOpen(true);
          }}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex justify-center mb-4 sm:mb-6 w-full px-1 sm:px-0">
        <div className="flex flex-wrap justify-center p-1 sm:p-1.5 bg-white/40 rounded-2xl border border-marrow-light/20 shadow-xl shadow-primary/5 w-full sm:w-auto gap-1 sm:gap-2">
          {tabsItems.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id !== 'creator') {
                  setEditingCatalog(null);
                }
                setActiveTab(tab.id);
              }}
              className={`
                flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-6 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-black transition-all duration-300 whitespace-nowrap flex-auto sm:flex-none
                ${activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/40 scale-105'
                  : 'text-marrow-light hover:text-primary hover:bg-primary/5'
                }
              `}
            >
              <span className={`material-symbols-outlined text-sm sm:text-lg ${activeTab === tab.id ? 'animate-pulse' : ''}`}>{tab.icon}</span>
              <span className="uppercase tracking-wider">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full">
        <div className="glass-panel p-3 sm:p-8 min-h-[500px] relative overflow-hidden transition-all duration-500 bg-white/40 shadow-xl shadow-primary/5 rounded-2xl border border-marrow-light/10">
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
                onEdit={handleEditCatalog}
                onDuplicate={handleDuplicateCatalog}
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
                onAddCatalog={(catalog) => {
                  onAddCatalog(editingProfileId, catalog);
                  setActiveTab('active');
                }}
              />
            )}

            {activeTab === 'lists' && editingProfile && (
              editingList !== undefined ? (
                <ListEditorPanel
                  list={editingList}
                  onSave={() => {
                    setEditingList(undefined);
                    fetchCustomLists();
                  }}
                  onCancel={() => {
                    setEditingList(undefined);
                  }}
                />
              ) : (
                <ListManagerPanel
                  lists={customLists}
                  activeCatalogIds={activeCatalogIds}
                  onRefresh={fetchCustomLists}
                  onEdit={(list) => setEditingList(list)}
                  onCreate={() => setEditingList(null)}
                  onActivate={handleActivateList}
                  onDeactivate={handleDeactivateList}
                  currentProfileName={editingProfile.name}
                />
              )
            )}

            {activeTab === 'dna' && editingProfile && (
              <DnaAndAiPanel
                profile={editingProfile}
                onUpdateProfile={onUpdateProfile}
                syncStatus={syncStatus}
                userId={userId}
                syncProfileVectors={syncProfileVectors}
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

      <EditCatalogModal
        open={isEditOpen}
        onClose={() => {
          setEditingCatalog(null);
          setIsEditOpen(false);
        }}
        catalog={editingCatalog}
        onAddCatalog={(cat) => onAddCatalog(editingProfileId, cat)}
        onRemoveCatalog={(id) => onRemoveCatalog(editingProfileId, id)}
        onUpdateCatalog={(cat) => onUpdateCatalog(editingProfileId, cat)}
      />
    </div>
  );
}
