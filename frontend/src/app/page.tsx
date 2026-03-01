'use client';
import { useState, useEffect } from 'react';
import { generateId } from '@/lib/utils';
import { useConfig } from '@/hooks/useConfig';
import { useAuth } from '@/hooks/useAuth';
import { useProfiles } from '@/hooks/useProfiles';
import { usePresets } from '@/hooks/usePresets';
import { Header } from '@/components/layout/Header';
import { TabNav } from '@/components/layout/TabNav';
import { LoginPage } from '@/components/pages/LoginPage';
import { DashboardPage } from '@/components/pages/DashboardPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { AppConfig, MyList, StremioAuth } from '@/types';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';
import { decodeConfig } from '@/lib/configCodec';
import { api } from '@/lib/api';

export default function Home() {
  const { configBase64, setConfigBase64, clearConfig, isLoaded } = useConfig();
  const {
    stremioAuth,
    traktToken,
    traktRefreshToken,
    isLoaded: authLoaded,
    setStremioAuth,
    setTraktToken,
    setTraktRefreshToken,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [myLists, setMyLists] = useState<MyList[]>([]);
  const [configVersion, setConfigVersion] = useState<string | undefined>();

  // Parse config for profiles
  const parsedConfig = configBase64 ? (decodeConfig(configBase64) as AppConfig | null) : null;

  const {
    profiles,
    setProfiles,
    editingProfileId,
    activeProfileId,
    setEditingProfileId,
    setActiveProfileId,
    updateProfile,
    addProfile,
    removeProfile,
    togglePreset,
    reorderCatalogs,
    removeCatalog,
    addCatalog,
  } = useProfiles(parsedConfig?.profiles);

  const { presets, categories, loading: presetsLoading } = usePresets();

  // Load my lists from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_LISTS);
      if (raw) setMyLists(JSON.parse(raw));
    } catch {}
  }, []);

  // Extract config version from parsed config
  useEffect(() => {
    if (parsedConfig?.configVersion) {
      setConfigVersion(parsedConfig.configVersion);
    }
  }, [parsedConfig?.configVersion]);

  const saveMyLists = (lists: MyList[]) => {
    setMyLists(lists);
    localStorage.setItem(LOCAL_STORAGE_KEYS.MY_LISTS, JSON.stringify(lists));
  };

  const handleSaveMyList = (list: MyList) => {
    saveMyLists([...myLists, list]);
  };

  const handleRemoveMyList = (id: string) => {
    saveMyLists(myLists.filter((l) => l.id !== id));
  };

  const handleLoginComplete = async (
    newStremioAuth: StremioAuth | null,
    newTraktToken: string | null,
    newTraktRefreshToken: string | null
  ) => {
    if (newStremioAuth) setStremioAuth(newStremioAuth);
    if (newTraktToken) setTraktToken(newTraktToken);
    if (newTraktRefreshToken) setTraktRefreshToken(newTraktRefreshToken);

    // Generate initial config
    try {
      const data = await api.configure({
        profiles,
        activeProfileId,
        stremioAuthKey: newStremioAuth?.authKey,
        traktToken: newTraktToken,
        traktRefreshToken: newTraktRefreshToken,
      });
      if (data.configBase64) {
        setConfigBase64(data.configBase64);
      }
    } catch {}
  };

  const handleConfigSaved = (base64: string) => {
    setConfigBase64(base64);
  };

  const handleLogout = () => {
    logout();
    clearConfig();
    setProfiles([{
      id: generateId(),
      name: 'Profilo Principale',
      raw_ui_state: { selectedPresets: [], newPrompts: [], presetOverrides: {}, catalogOrder: [] },
      existingCatalogs: [],
      settings: {},
    }]);
  };

  const handleDisconnectTrakt = () => {
    setTraktToken(null);
    setTraktRefreshToken(null);
  };

  const isLoggedIn = Boolean(configBase64 || stremioAuth);

  if (!isLoaded || !authLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#8a5aeb]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="mx-auto w-full max-w-4xl xl:max-w-5xl">
        {/* Glass panel */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-2xl p-4 sm:p-6">
          <Header />

          {!isLoggedIn ? (
            <LoginPage onComplete={handleLoginComplete} />
          ) : (
            <>
              <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

              {activeTab === 'dashboard' && (
                <DashboardPage
                  profiles={profiles}
                  editingProfileId={editingProfileId}
                  activeProfileId={activeProfileId}
                  presets={presets}
                  categories={categories}
                  myLists={myLists}
                  onSelectEditing={setEditingProfileId}
                  onSetActive={setActiveProfileId}
                  onAddProfile={addProfile}
                  onRemoveProfile={removeProfile}
                  onRenameProfile={(id, name) => updateProfile(id, { name })}
                  onTogglePreset={togglePreset}
                  onReorderCatalogs={reorderCatalogs}
                  onRemoveCatalog={removeCatalog}
                  onAddCatalog={addCatalog}
                  onSaveMyList={handleSaveMyList}
                  onRemoveMyList={handleRemoveMyList}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsPage
                  profiles={profiles}
                  activeProfileId={activeProfileId}
                  stremioEmail={stremioAuth?.email}
                  stremioAuthKey={stremioAuth?.authKey}
                  traktToken={traktToken}
                  traktRefreshToken={traktRefreshToken}
                  configVersion={configVersion}
                  onUpdateProfile={updateProfile}
                  onLogout={handleLogout}
                  onDisconnectTrakt={handleDisconnectTrakt}
                  onConfigSaved={handleConfigSaved}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

