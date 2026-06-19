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
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { MyList, StremioAuth, Profile } from '@/types';
import { LOCAL_STORAGE_KEYS, SESSION_STORAGE_KEYS, DEFAULT_PRESET_IDS } from '@/lib/constants';
import { api } from '@/lib/api';
import { usePathname } from 'next/navigation';

function createDefaultProfiles(): Profile[] {
  const HERO_PRESET_IDS = [
    'yaca_true_blend_movies', 'yaca_true_blend_series',
    'yaca_seed_network_movies', 'yaca_seed_network_series',
    'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
  ];

  return [
    {
      id: 'global',
      name: '🏠 Generale',
      raw_ui_state: {
        selectedPresets: [...DEFAULT_PRESET_IDS, ...HERO_PRESET_IDS],
        newPrompts: [],
        presetOverrides: {},
        catalogOrder: [...HERO_PRESET_IDS],
        heroPresetsInitialized: true,
      },
      existingCatalogs: [],
      settings: { fastRefresh: false },
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
  const [initialActiveProfileId, setInitialActiveProfileId] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [configDecoded, setConfigDecoded] = useState(false);
  const [globalTmdbKey, setGlobalTmdbKey] = useState<string>('');
  const [globalMistralKey, setGlobalMistralKey] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const autoConfigCalledRef = useRef(false);
  const pathname = usePathname();

  // Initialize background sync worker for crowdsourced ecosystem
  useBackgroundSync(globalTmdbKey, userId ?? undefined);

  // Async load user config from API (cookie-based session)
  useEffect(() => {
    if (!isLoaded) return;

    // Try to get userId from the URL path first (e.g., /ExVSfh84z8/configure)
    const pathParts = pathname ? pathname.split('/').filter(Boolean) : [];
    // userId is usually the first part if it's not "configure"
    let urlUserId = pathParts.length > 0 && pathParts[0] !== 'configure' ? pathParts[0] : null;

    // If it's a versioned URL (e.g., /ExVSfh84z8/v1/configure)
    if (urlUserId && pathParts.length > 2 && pathParts[2] === 'configure') {
      urlUserId = pathParts[0];
    }

    const storedUserId = urlUserId || localStorage.getItem(LOCAL_STORAGE_KEYS.USER_ID);

    if (!storedUserId) {
      // Try cookie-based session restoration via /api/auth/me
      api.authMe()
        .then(data => {
          if (data.authenticated && data.userId) {
            setUserId(data.userId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, data.userId);
            // Load full user data
            return fetch(`/api/user/${data.userId}`, { credentials: 'include' });
          }
          return null;
        })
        .then(res => {
          if (res && res.ok) return res.json();
          return null;
        })
        .then(data => {
          if (data && Array.isArray(data.profiles) && data.profiles.length > 0) {
            const mappedProfiles = (data.profiles as BackendProfile[]).map(mapBackendProfile);
            setInitialProfiles(mappedProfiles);
            if (data.configVersion) setConfigVersion(String(data.configVersion));
            if (data.apiKeys) {
              if (data.apiKeys.tmdb) setGlobalTmdbKey(data.apiKeys.tmdb);
              if (data.apiKeys.mistral) setGlobalMistralKey(data.apiKeys.mistral);
              if (data.apiKeys.trakt) setTraktToken(data.apiKeys.trakt);
              if (data.apiKeys.traktRefreshToken) setTraktRefreshToken(data.apiKeys.traktRefreshToken);
            }
          } else {
            setInitialProfiles(createDefaultProfiles());
          }
        })
        .catch(() => {
          setInitialProfiles(createDefaultProfiles());
        })
        .finally(() => {
          setIsInitializing(false);
          setConfigDecoded(true);
        });
      return;
    }

    if (urlUserId) {
      setUserId(urlUserId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, urlUserId);
    } else {
      setUserId(storedUserId);
    }

    fetch(`/api/user/${storedUserId}`, { credentials: 'include' })
      .then(res => {
        if (res.status === 401) throw new Error("Unauthorized");
        if (!res.ok) throw new Error("User not found");
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.profiles) && data.profiles.length > 0) {
          const mappedProfiles = (data.profiles as BackendProfile[]).map(mapBackendProfile);
          setInitialProfiles(mappedProfiles);
          if (data.configVersion) setConfigVersion(String(data.configVersion));

          if (data.activeProfileId && typeof data.activeProfileId === 'string') {
            setInitialActiveProfileId(data.activeProfileId);
          }

          if (data.apiKeys) {
            if (data.apiKeys.tmdb) setGlobalTmdbKey(data.apiKeys.tmdb);
            if (data.apiKeys.mistral) setGlobalMistralKey(data.apiKeys.mistral);
            if (data.apiKeys.trakt) setTraktToken(data.apiKeys.trakt);
            if (data.apiKeys.traktRefreshToken) setTraktRefreshToken(data.apiKeys.traktRefreshToken);
          }
        } else {
          setInitialProfiles(createDefaultProfiles());
        }
      })
      .catch((err) => {
        console.error("Error loading user profile from DB:", err);
        if (err.message === "Unauthorized") {
          localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_ID);
          setUserId(null);
        }
        setInitialProfiles(createDefaultProfiles());
      })
      .finally(() => {
        setIsInitializing(false);
        setConfigDecoded(true);
      });
  }, [isLoaded, setTraktToken, setTraktRefreshToken, pathname]);

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
    updateCatalog,
    syncStatus,
    syncProfileVectors,
  } = useProfiles(initialProfiles, initialActiveProfileId);

  const { presets, profileTemplates, categories, hasGlobalErdb } = usePresets();

  // Remove manual sessionStorage restoration since it's handled by useProfiles constructor/effect

  // 1. DB Sync (No debounce)
  useEffect(() => {
    if (isInitializing || !configDecoded || !userId || !stremioAuth) return;
    
    // Skip if these are just the initial default profiles and we're still waiting for real data
    if (!initialProfiles && profiles.length === 1 && profiles[0].id === 'global' && profiles[0].raw_ui_state.selectedPresets.length === 0) {
      return;
    }

    // Execute immediately on state change without delay
    api.configure({
      profiles: profilesToApiPayload(profiles),
      activeProfileId,
      stremioAuthKey: stremioAuth?.authKey || undefined,
      email: stremioAuth?.email,
      traktToken: traktToken ?? undefined,
      traktRefreshToken: traktRefreshToken ?? undefined,
    }).then(data => {
      if (data.configVersion) setConfigVersion(String(data.configVersion));
    }).catch(err => {
      console.warn('DB Auto-save failed:', err);
    });
  }, [profiles, activeProfileId, userId, isInitializing, configDecoded, stremioAuth, traktToken, traktRefreshToken, initialProfiles]);

  // 2. Delayed Stremio Addon Update (20s base + 1s increment per change)
  const addonUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const addonUpdateDelayRef = useRef<number>(20000); // 20s base
  const changeCountRef = useRef<number>(0);

  useEffect(() => {
    if (isInitializing || !configDecoded || !userId || !stremioAuth?.authKey) return;

    // Reset/Increment timer logic
    if (addonUpdateTimerRef.current) {
      clearTimeout(addonUpdateTimerRef.current);
      changeCountRef.current += 1;
      addonUpdateDelayRef.current += 1000; // +1s for each extra change
    } else {
      changeCountRef.current = 0;
      addonUpdateDelayRef.current = 20000; // start at 20s
    }

    addonUpdateTimerRef.current = setTimeout(() => {
      const manifestPath = configVersion
        ? `/${userId}/${configVersion}/manifest.json`
        : `/${userId}/manifest.json`;
      const httpsManifestUrl = `https://${window.location.host}${manifestPath}`;
      
      api.stremioAddonUpdate(stremioAuth.authKey, httpsManifestUrl)
        .then(() => {
          addonUpdateTimerRef.current = null;
          changeCountRef.current = 0;
          addonUpdateDelayRef.current = 20000;
        })
        .catch(err => {
          console.warn('Stremio addon update failed:', err);
          addonUpdateTimerRef.current = null; // allow retry on next change
        });
    }, addonUpdateDelayRef.current);

    return () => {
      if (addonUpdateTimerRef.current) {
        clearTimeout(addonUpdateTimerRef.current);
      }
    };
  }, [profiles, activeProfileId, userId, isInitializing, configDecoded, stremioAuth, configVersion]);

  // Auto-configure when stremio is logged in but no config/userId is stored yet
  useEffect(() => {
    if (!isLoaded || !authLoaded || !configDecoded || isInitializing) return;
    if (autoConfigCalledRef.current) return;
    if (stremioAuth && !userId) {
      autoConfigCalledRef.current = true;
      api.configure({
        profiles: profilesToApiPayload(profiles),
        activeProfileId,
        stremioAuthKey: stremioAuth.authKey || undefined,
        email: stremioAuth.email,
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
          api.stremioAddonUpdate(stremioAuth.authKey, httpsManifestUrl).catch((err) => {
            console.error('Auto-install addon during auto-config failed:', err);
          });
        }
      }).catch((err) => {
        console.error('Auto-config failed:', err);
      });
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
    existingUserId?: string,
    tmdbKey?: string,
    mistralKey?: string,
    existingProfiles?: BackendProfile[],
    existingActiveProfileId?: string
  ) => {
    if (newStremioAuth) setStremioAuth(newStremioAuth);
    if (newTraktToken) setTraktToken(newTraktToken);
    if (newTraktRefreshToken) setTraktRefreshToken(newTraktRefreshToken);

    let activeProfiles = profiles;

    // If existing profiles are returned (returning user), restore them immediately
    if (existingProfiles && Array.isArray(existingProfiles) && existingProfiles.length > 0) {
      const mapped = existingProfiles.map(mapBackendProfile);
      setProfiles(mapped);
      activeProfiles = mapped; // Use these for the configure call below

      if (existingActiveProfileId) {
        setActiveProfileId(existingActiveProfileId);
      }
    }

    // If an existing userId was returned, set it immediately
    if (existingUserId) {
      setUserId(existingUserId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, existingUserId);
    }
    if (tmdbKey) setGlobalTmdbKey(tmdbKey);
    if (mistralKey) setGlobalMistralKey(mistralKey);

    // Generate initial config — no auth tokens in body, cookie handles identity
    try {
      const data = await api.configure({
        profiles: profilesToApiPayload(activeProfiles),
        activeProfileId: existingActiveProfileId || activeProfileId,
        tmdbKey: tmdbKey ?? undefined,
        mistralKey: mistralKey ?? undefined,
        stremioAuthKey: newStremioAuth?.authKey || undefined,
        email: newStremioAuth?.email,
        traktToken: newTraktToken ?? undefined,
        traktRefreshToken: newTraktRefreshToken ?? undefined,
      });
      if (data.userId) {
        setUserId(data.userId);
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, data.userId);
        if (data.configVersion) setConfigVersion(String(data.configVersion));

        // Restore tokens if returned (ensure state stays in sync)
        if (data.apiKeys?.trakt) setTraktToken(data.apiKeys.trakt);
        if (data.apiKeys?.traktRefreshToken) setTraktRefreshToken(data.apiKeys.traktRefreshToken);
        if (data.apiKeys?.tmdb) setGlobalTmdbKey(data.apiKeys.tmdb);
        if (data.apiKeys?.mistral) setGlobalMistralKey(data.apiKeys.mistral);

        // Auto-install addon in Stremio
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
    } catch (err) {
      console.error('Login complete configuration sync failed:', err);
    }
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
        stremioAuthKey: stremioAuth?.authKey || undefined,
        email: stremioAuth?.email,
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
    await logout(); // Calls /api/auth/logout to clear HttpOnly cookie
    // Clear only non-sensitive localStorage keys (USER_ID, CONFIG, MY_LISTS)
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

  const isLoggedIn = Boolean(stremioAuth);

  if (!isLoaded || !authLoaded || !configDecoded || isInitializing) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-6xl pb-32">
          <DashboardSkeleton />
        </main>
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

      <main className="flex flex-1 justify-center py-4 sm:py-8">
        <div className="layout-content-container flex flex-col w-full max-w-[1200px] px-3 sm:px-6 md:px-10 gap-4 sm:gap-8">
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
                  onUpdateCatalog={updateCatalog}
                  onSaveMyList={handleSaveMyList}
                  onRemoveMyList={handleRemoveMyList}
                  onUpdateProfile={updateProfile}
                  onTemplateApplied={handleTemplateApplied}
                  syncStatus={syncStatus}
                  syncProfileVectors={syncProfileVectors}
                  userId={userId ?? undefined}
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
                  globalTmdbKey={globalTmdbKey}
                  globalMistralKey={globalMistralKey}
                  hasGlobalErdb={hasGlobalErdb}
                  onUpdateProfile={updateProfile}
                  onLogout={handleLogout}
                  onDisconnectTrakt={handleDisconnectTrakt}
                  onConnectTrakt={(t, r) => {
                    setTraktToken(t);
                    setTraktRefreshToken(r);
                  }}
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
