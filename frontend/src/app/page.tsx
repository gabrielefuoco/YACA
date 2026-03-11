'use client';
import { useState, useEffect, useRef } from 'react';
import { mapBackendProfile, profilesToApiPayload, BackendProfile } from '@/lib/utils';
import { useConfig } from '@/hooks/useConfig';
import { useAuth } from '@/hooks/useAuth';
import { useProfiles } from '@/hooks/useProfiles';
import { usePresets } from '@/hooks/usePresets';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';
import { Header } from '@/components/layout/Header';
import { TabNav } from '@/components/layout/TabNav';
import { LoginPage } from '@/components/pages/LoginPage';
import { DashboardPage } from '@/components/pages/DashboardPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { MyList, Profile } from '@/types';
import { LOCAL_STORAGE_KEYS, SESSION_STORAGE_KEYS, DEFAULT_PRESET_IDS } from '@/lib/constants';
import { api } from '@/lib/api';

// Default profiles for new users (matches the original HTML quick-start profiles)
function createDefaultProfiles(): Profile[] {
  return [
    {
      id: 'global',
      name: '🏠 Generale',
      raw_ui_state: {
        selectedPresets: [...DEFAULT_PRESET_IDS],
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
  const { isLoaded } = useConfig();
  const {
    user,
    isAuthenticated,
    isLoaded: authLoaded,
    logout,
    refreshSession,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [myLists, setMyLists] = useState<MyList[]>([]);
  const [configVersion, setConfigVersion] = useState<string | undefined>();
  const [initialProfiles, setInitialProfiles] = useState<Profile[] | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [configDecoded, setConfigDecoded] = useState(false);
  const [globalTmdbKey, setGlobalTmdbKey] = useState<string>('');
  const [globalMistralKey, setGlobalMistralKey] = useState<string>('');
  const autoConfigCalledRef = useRef(false);

  // Initialize background sync worker for crowdsourced ecosystem
  useBackgroundSync(globalTmdbKey, userId ?? undefined);

  // Sync userId from session
  useEffect(() => {
    if (user?.userId) {
      setUserId(user.userId);
    }
  }, [user]);

  // Async load user config from API
  useEffect(() => {
    if (!isLoaded || !authLoaded) return;

    // Try to get userId from the URL path first (e.g., /ExVSfh84z8/configure)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    let urlUserId = pathParts.length > 0 && pathParts[0] !== 'configure' ? pathParts[0] : null;
    if (urlUserId && pathParts.length > 2 && pathParts[2] === 'configure') {
      urlUserId = pathParts[0];
    }

    const sessionUserId = user?.userId || null;
    const storedUserId = urlUserId || sessionUserId;

    if (!storedUserId) {
      setInitialProfiles(createDefaultProfiles());
      setConfigDecoded(true);
      return;
    }

    setUserId(storedUserId);

    fetch(`/api/user/${storedUserId}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error("User not found");
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.profiles) && data.profiles.length > 0) {
          const mappedProfiles = (data.profiles as BackendProfile[]).map(mapBackendProfile);
          setInitialProfiles(mappedProfiles);
          if (data.configVersion) setConfigVersion(String(data.configVersion));

          if (data.activeProfileId && typeof data.activeProfileId === 'string') {
            const profileExists = mappedProfiles.some(p => p.id === data.activeProfileId);
            if (profileExists) {
              try {
                sessionStorage.setItem(SESSION_STORAGE_KEYS.PENDING_ACTIVE_PROFILE_ID, data.activeProfileId);
              } catch (err) {
                console.warn('Failed to store pending activeProfileId:', err);
              }
            }
          }

          if (data.apiKeys) {
            if (data.apiKeys.tmdb) setGlobalTmdbKey(data.apiKeys.tmdb);
            if (data.apiKeys.mistral) setGlobalMistralKey(data.apiKeys.mistral);
          }
        } else {
          setInitialProfiles(createDefaultProfiles());
        }
      })
      .catch((err) => {
        console.error("Error loading user profile from DB:", err);
        setInitialProfiles(createDefaultProfiles());
      })
      .finally(() => {
        setConfigDecoded(true);
      });
  }, [isLoaded, authLoaded, user]);

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

  const { presets, profileTemplates, categories } = usePresets();

  // Restore activeProfileId from decoded config if it was stored temporarily
  useEffect(() => {
    try {
      const pendingId = sessionStorage.getItem(SESSION_STORAGE_KEYS.PENDING_ACTIVE_PROFILE_ID);
      if (pendingId && profiles.some(p => p.id === pendingId)) {
        setActiveProfileId(pendingId);
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.PENDING_ACTIVE_PROFILE_ID);
      }
    } catch (err) {
      console.warn('Failed to restore pending activeProfileId from sessionStorage. Active profile will not be restored:', err);
    }
  }, [profiles, setActiveProfileId]);

  // Auto-configure when user session exists but no config has been fetched yet
  useEffect(() => {
    if (!isLoaded || !authLoaded || !configDecoded) return;
    if (autoConfigCalledRef.current) return;
    if (isAuthenticated && user && !configVersion) {
      autoConfigCalledRef.current = true;
      api.configure({
        profiles: profilesToApiPayload(profiles),
        activeProfileId,
        userId: user.userId,
        traktToken: user.traktToken ?? undefined,
        traktRefreshToken: user.traktRefreshToken ?? undefined,
      }).then((data) => {
        if (data.userId) {
          setUserId(data.userId);
        }
        if (data.configVersion) setConfigVersion(String(data.configVersion));
      }).catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, authLoaded, configDecoded, isAuthenticated, user]);

  // Load my lists from localStorage (non-sensitive UI data)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_LISTS);
      if (raw) setMyLists(JSON.parse(raw));
    } catch { }
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

  const handleLoginComplete = async (loginData: {
    userId: string;
    email: string;
    traktToken: string | null;
    traktRefreshToken: string | null;
    profiles: any[];
    activeProfileId: string;
  }) => {
    let activeProfiles = profiles;

    // If existing profiles are returned (returning user), restore them immediately
    if (loginData.profiles && Array.isArray(loginData.profiles) && loginData.profiles.length > 0) {
      const mapped = loginData.profiles.map(mapBackendProfile);
      setProfiles(mapped);
      activeProfiles = mapped;

      if (loginData.activeProfileId) {
        setActiveProfileId(loginData.activeProfileId);
      }
    }

    setUserId(loginData.userId);

    // Generate initial config
    try {
      const data = await api.configure({
        profiles: profilesToApiPayload(activeProfiles),
        activeProfileId: loginData.activeProfileId || activeProfileId,
        userId: loginData.userId,
        traktToken: loginData.traktToken,
        traktRefreshToken: loginData.traktRefreshToken,
      });
      if (data.userId) {
        setUserId(data.userId);
        if (data.configVersion) setConfigVersion(String(data.configVersion));
      }
    } catch { }

    // Refresh session to update user data
    await refreshSession();
  };

  const handleConfigSaved = (newUserId?: string) => {
    if (newUserId) {
      setUserId(newUserId);
    }
  };

  const handleTemplateApplied = async (profileId: string, selectedPresets: string[]) => {
    const nextProfiles = profiles.map((p) =>
      p.id === profileId
        ? {
          ...p,
          raw_ui_state: {
            ...p.raw_ui_state,
            selectedPresets,
          },
        }
        : p
    );

    try {
      const data = await api.configure({
        profiles: profilesToApiPayload(nextProfiles),
        activeProfileId,
        userId: userId ?? undefined,
        traktToken: user?.traktToken ?? undefined,
        traktRefreshToken: user?.traktRefreshToken ?? undefined,
      });

      const resolvedUserId = data.userId || userId;
      if (!resolvedUserId) return;
      if (data.userId) {
        setUserId(data.userId);
      }
      if (data.configVersion) {
        setConfigVersion(String(data.configVersion));
      }

      const response = await fetch(`/api/user/${resolvedUserId}`, { credentials: 'include' });
      if (!response.ok) return;
      const freshUser = await response.json();
      if (Array.isArray(freshUser.profiles) && freshUser.profiles.length > 0) {
        const mappedProfiles = (freshUser.profiles as BackendProfile[]).map(mapBackendProfile);
        setProfiles(mappedProfiles);
      }
    } catch (err) {
      console.warn('Template apply sync failed:', err);
    }
  };

  const handleLogout = async () => {
    await logout();
    // Clear non-sensitive UI localStorage keys
    Object.values(SESSION_STORAGE_KEYS).forEach((key) => {
      sessionStorage.removeItem(key);
    });
    setUserId(null);
    setInitialProfiles(createDefaultProfiles());
    setProfiles(createDefaultProfiles());
    window.location.reload();
  };

  const handleDisconnectTrakt = () => {
    // Trakt disconnect: update the configure endpoint to remove trakt token
    if (userId) {
      api.configure({
        userId,
        profiles: profilesToApiPayload(profiles),
        activeProfileId,
        traktToken: null,
        traktRefreshToken: null,
      }).catch(() => { });
    }
  };

  const isLoggedIn = Boolean(userId || isAuthenticated);

  if (!isLoaded || !authLoaded || !configDecoded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#8a5aeb]" />
      </div>
    );
  }

  return (
    <>
      <Header>
        {isLoggedIn && (
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
        )}
      </Header>

      <main className="flex flex-1 justify-center py-8">
        <div className="layout-content-container flex flex-col w-full max-w-[1200px] px-6 md:px-10 gap-8">
          {!isLoggedIn ? (
            <LoginPage onComplete={handleLoginComplete} />
          ) : (
            <>

              {activeTab === 'dashboard' && (
                <DashboardPage
                  profiles={profiles}
                  editingProfileId={editingProfileId}
                  activeProfileId={activeProfileId}
                  presets={presets}
                  categories={categories}
                  profileTemplates={profileTemplates}
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
                  onUpdateProfile={updateProfile}
                  onTemplateApplied={handleTemplateApplied}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsPage
                  profiles={profiles}
                  activeProfileId={activeProfileId}
                  stremioEmail={user?.email}
                  traktToken={user?.traktToken}
                  traktRefreshToken={user?.traktRefreshToken}
                  configVersion={configVersion}
                  userId={userId ?? undefined}
                  globalTmdbKey={globalTmdbKey}
                  globalMistralKey={globalMistralKey}
                  onUpdateProfile={updateProfile}
                  onLogout={handleLogout}
                  onDisconnectTrakt={handleDisconnectTrakt}
                  onConfigSaved={handleConfigSaved}
                />
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
