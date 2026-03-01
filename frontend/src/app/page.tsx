'use client';
import { useState, useEffect } from 'react';
import { mapBackendProfile, profilesToApiPayload } from '@/lib/utils';
import { useConfig } from '@/hooks/useConfig';
import { useAuth } from '@/hooks/useAuth';
import { useProfiles } from '@/hooks/useProfiles';
import { usePresets } from '@/hooks/usePresets';
import { Header } from '@/components/layout/Header';
import { TabNav } from '@/components/layout/TabNav';
import { LoginPage } from '@/components/pages/LoginPage';
import { DashboardPage } from '@/components/pages/DashboardPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { MyList, StremioAuth, Profile } from '@/types';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';
import { decodeConfigAsync } from '@/lib/configCodec';
import { api } from '@/lib/api';

// Default profiles for new users (matches the original HTML quick-start profiles)
function createDefaultProfiles(): Profile[] {
  return [
    {
      id: 'default_main',
      name: '🏠 Generale',
      raw_ui_state: {
        selectedPresets: [
          'preset_pop_movies', 'preset_pop_series', 'preset_new_movies', 'preset_new_series',
          'preset_top_rated_movies', 'preset_top_rated_series', 'preset_pop_anime',
        ],
        newPrompts: [],
        presetOverrides: {},
        catalogOrder: [],
      },
      existingCatalogs: [],
      settings: { voteAverageMin: 0, voteCountMin: 0, fastRefresh: false },
    },
  ];
}

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
  const [initialProfiles, setInitialProfiles] = useState<Profile[] | undefined>(undefined);
  const [configDecoded, setConfigDecoded] = useState(false);

  // Async decode config from localStorage/URL
  useEffect(() => {
    if (!isLoaded) return;
    if (!configBase64) {
      setInitialProfiles(createDefaultProfiles());
      setConfigDecoded(true);
      return;
    }
    decodeConfigAsync(configBase64).then((parsed) => {
      if (parsed && typeof parsed === 'object') {
        const cfg = parsed as Record<string, unknown>;
        if (cfg.configVersion) setConfigVersion(String(cfg.configVersion));
        if (Array.isArray(cfg.profiles) && cfg.profiles.length > 0) {
          setInitialProfiles(
            (cfg.profiles as Record<string, unknown>[]).map(mapBackendProfile)
          );
        } else {
          setInitialProfiles(createDefaultProfiles());
        }
      } else {
        setInitialProfiles(createDefaultProfiles());
      }
      setConfigDecoded(true);
    });
  }, [isLoaded, configBase64]);

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
  } = useProfiles(initialProfiles);

  const { presets, categories } = usePresets();

  // Load my lists from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_LISTS);
      if (raw) setMyLists(JSON.parse(raw));
    } catch {}
  }, []);

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
        profiles: profilesToApiPayload(profiles),
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
    setInitialProfiles(createDefaultProfiles());
    setProfiles(createDefaultProfiles());
  };

  const handleDisconnectTrakt = () => {
    setTraktToken(null);
    setTraktRefreshToken(null);
  };

  const isLoggedIn = Boolean(configBase64 || stremioAuth);

  if (!isLoaded || !authLoaded || !configDecoded) {
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
