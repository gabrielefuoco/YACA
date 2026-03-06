'use client';
import { useState, useEffect, useRef } from 'react';
import { mapBackendProfile, profilesToApiPayload, BackendProfile } from '@/lib/utils';
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
  const [userId, setUserId] = useState<string | null>(null);
  const [configDecoded, setConfigDecoded] = useState(false);
  const autoConfigCalledRef = useRef(false);

  // Async load user config from API
  useEffect(() => {
    if (!isLoaded) return;

    // Try to get userId from the URL path first (e.g., /ExVSfh84z8/configure)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    // userId is usually the first part if it's not "configure"
    let urlUserId = pathParts.length > 0 && pathParts[0] !== 'configure' ? pathParts[0] : null;

    // If it's a versioned URL (e.g., /ExVSfh84z8/v1/configure)
    if (urlUserId && pathParts.length > 2 && pathParts[2] === 'configure') {
      urlUserId = pathParts[0];
    }

    const storedUserId = urlUserId || localStorage.getItem(LOCAL_STORAGE_KEYS.USER_ID);

    if (!storedUserId) {
      setInitialProfiles(createDefaultProfiles());
      setConfigDecoded(true);
      return;
    }

    if (urlUserId) {
      setUserId(urlUserId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, urlUserId);
    } else {
      setUserId(storedUserId);
    }

    fetch(`/api/user/${storedUserId}`)
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
  }, [isLoaded]);

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
      // Silently fail if sessionStorage is unavailable (e.g., private browsing)
      console.warn('Failed to restore pending activeProfileId from sessionStorage. Active profile will not be restored:', err);
    }
  }, [profiles, setActiveProfileId]);

  // Auto-configure when stremio is logged in but no config/userId is stored yet
  useEffect(() => {
    if (!isLoaded || !authLoaded || !configDecoded) return;
    if (autoConfigCalledRef.current) return;
    if (stremioAuth && !userId) {
      autoConfigCalledRef.current = true;
      api.configure({
        profiles: profilesToApiPayload(profiles),
        activeProfileId,
        stremioAuthKey: stremioAuth.authKey,
        traktToken: traktToken ?? undefined,
        traktRefreshToken: traktRefreshToken ?? undefined,
      }).then((data) => {
        if (data.userId) {
          setUserId(data.userId);
          localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, data.userId);
        }
        if (data.configVersion) setConfigVersion(String(data.configVersion));
        if (data.userId && stremioAuth?.authKey) {
          const host = window.location.host;
          const manifestPath = data.configVersion
            ? `/${data.userId}/${data.configVersion}/manifest.json`
            : `/${data.userId}/manifest.json`;
          const httpsManifestUrl = `https://${host}${manifestPath}`;
          api.stremioAddonUpdate(stremioAuth.authKey, httpsManifestUrl).catch(() => { });
        }
      }).catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, authLoaded, configDecoded, stremioAuth, userId]);

  // Load my lists from localStorage
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

  const handleLoginComplete = async (
    newStremioAuth: StremioAuth | null,
    newTraktToken: string | null,
    newTraktRefreshToken: string | null,
    existingUserId?: string
  ) => {
    if (newStremioAuth) setStremioAuth(newStremioAuth);
    if (newTraktToken) setTraktToken(newTraktToken);
    if (newTraktRefreshToken) setTraktRefreshToken(newTraktRefreshToken);

    // If an existing userId was returned from check-user, set it immediately
    if (existingUserId) {
      setUserId(existingUserId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, existingUserId);
    }

    // Generate initial config
    try {
      const data = await api.configure({
        profiles: profilesToApiPayload(profiles),
        activeProfileId,
        userId: existingUserId || (userId ?? undefined),
        stremioAuthKey: newStremioAuth?.authKey,
        traktToken: newTraktToken,
        traktRefreshToken: newTraktRefreshToken,
      });
      if (data.userId) {
        setUserId(data.userId);
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, data.userId);
        if (data.configVersion) setConfigVersion(String(data.configVersion));

        // Auto-install addon in Stremio using short userId URL
        if (newStremioAuth?.authKey) {
          const host = window.location.host;
          const manifestPath = data.configVersion
            ? `/${data.userId}/${data.configVersion}/manifest.json`
            : `/${data.userId}/manifest.json`;
          const httpsManifestUrl = `https://${host}${manifestPath}`;
          try {
            await api.stremioAddonUpdate(newStremioAuth.authKey, httpsManifestUrl);
          } catch (e) {
            console.warn('Auto-install addon failed:', e);
          }
        }
      }
    } catch { }
  };

  const handleConfigSaved = (newUserId?: string) => {
    if (newUserId) {
      setUserId(newUserId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, newUserId);
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
        stremioAuthKey: stremioAuth?.authKey,
        traktToken: traktToken ?? undefined,
        traktRefreshToken: traktRefreshToken ?? undefined,
      });

      const resolvedUserId = data.userId || userId;
      if (!resolvedUserId) return;
      if (data.userId) {
        setUserId(data.userId);
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, data.userId);
      }
      if (data.configVersion) {
        setConfigVersion(String(data.configVersion));
      }

      const response = await fetch(`/api/user/${resolvedUserId}`);
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

  const handleLogout = () => {
    logout();
    // Aggressively clear all YACA-related localStorage and sessionStorage keys
    Object.values(LOCAL_STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    Object.values(SESSION_STORAGE_KEYS).forEach((key) => {
      sessionStorage.removeItem(key);
    });
    setUserId(null);
    setInitialProfiles(createDefaultProfiles());
    setProfiles(createDefaultProfiles());
    // Force a full page reload to reset all React state
    window.location.reload();
  };

  const handleDisconnectTrakt = () => {
    setTraktToken(null);
    setTraktRefreshToken(null);
  };

  const isLoggedIn = Boolean(userId || stremioAuth);

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
                  stremioEmail={stremioAuth?.email}
                  stremioAuthKey={stremioAuth?.authKey}
                  traktToken={traktToken}
                  traktRefreshToken={traktRefreshToken}
                  configVersion={configVersion}
                  userId={userId ?? undefined}
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
