'use client';
import { useState, useCallback, useEffect } from 'react';
import { Profile, Catalog, RawProfileData, SyncStatus, TmdbMetadataMap, DNAItem } from '@/types';
import { api } from '@/lib/api';
import { VectorEngine, VectorAxis } from '@/engines/vectorEngine';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';

import { generateId } from '@/lib/utils';

function createGlobalProfile(): Profile {
  return {
    id: 'global',
    name: '🏠 Generale',
    raw_ui_state: {
      selectedPresets: [],
      newPrompts: [],
      presetOverrides: {},
      catalogOrder: [],
    },
    existingCatalogs: [],
    settings: {
      fastRefresh: false,
      manualDNA: [],
      suggestedDNA: [],
    },
  };
}

function createDefaultProfile(name: string = 'Profilo Principale'): Profile {
  return {
    id: generateId(),
    name,
    raw_ui_state: {
      selectedPresets: [],
      newPrompts: [],
      presetOverrides: {},
      catalogOrder: [],
    },
    existingCatalogs: [],
    settings: {
      fastRefresh: false,
    },
  };
}

function ensureGlobalProfile(list: Profile[]): Profile[] {
  if (list.some((p) => p.id === 'global')) return list;
  return [createGlobalProfile(), ...list];
}

export function useProfiles(initialProfiles?: Profile[], initialActiveProfileId?: string) {
  const [profiles, setProfiles] = useState<Profile[]>(
    initialProfiles && initialProfiles.length > 0
      ? ensureGlobalProfile(initialProfiles)
      : [createGlobalProfile()]
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    if (initialActiveProfileId && (initialProfiles ?? profiles).some((p: Profile) => p.id === initialActiveProfileId)) {
      return initialActiveProfileId;
    }
    return initialProfiles?.[0]?.id ?? profiles[0]?.id ?? '';
  });
  const [editingProfileId, setEditingProfileId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.EDITING_PROFILE_ID);
      if (stored) return stored;
    }
    return initialProfiles?.[0]?.id ?? profiles[0]?.id ?? '';
  });

  // Persist editingProfileId
  useEffect(() => {
    if (editingProfileId) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.EDITING_PROFILE_ID, editingProfileId);
    }
  }, [editingProfileId]);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    total: 0,
    current: 0,
    phase: '',
  });

  // Sync when initialProfiles changes (e.g. after async config decode or save)
  useEffect(() => {
    if (initialProfiles && initialProfiles.length > 0) {
      const safe = ensureGlobalProfile(initialProfiles);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfiles((current: Profile[]) => {
        // Only update if reference or length changed to avoid loop
        if (current === safe) return current;
        return safe;
      });
      setActiveProfileId((prev: string) =>
        safe.some((p: Profile) => p.id === prev) ? prev : safe[0].id
      );
      setEditingProfileId((prev: string) => {
        // Priority: stored local id > initial id > first profile
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.EDITING_PROFILE_ID);
          if (stored && safe.some((p: Profile) => p.id === stored)) return stored;
        }
        return safe.some((p: Profile) => p.id === prev) ? prev : safe[0].id;
      });
    }
  }, [initialProfiles]);

  const activeProfile = profiles.find((p: Profile) => p.id === activeProfileId) ?? profiles[0];
  const editingProfile = profiles.find((p: Profile) => p.id === editingProfileId) ?? profiles[0];

  const updateProfile = useCallback((id: string, updates: Partial<Profile>) => {
    setProfiles((prev: Profile[]) =>
      prev.map((p: Profile) => {
        if (p.id !== id) return p;
        if (p.id === 'global') {
          return {
            ...p,
            ...updates,
            name: p.name,
            settings: updates.settings ? { ...p.settings, ...updates.settings } : p.settings,
          };
        }
        return { ...p, ...updates };
      })
    );
  }, []);

  const addProfile = useCallback((name: string) => {
    const newProfile = createDefaultProfile(name);
    setProfiles((prev: Profile[]) => [...prev, newProfile]);
    setEditingProfileId(newProfile.id);
    return newProfile;
  }, []);

  const removeProfile = useCallback(
    (id: string) => {
      if (id === 'global') return;
      setProfiles((prev: Profile[]) => {
        const remaining = prev.filter((p: Profile) => p.id !== id);
        const result = remaining.length === 0 ? [createGlobalProfile()] : remaining;
        // Update editing/active IDs if the removed profile was selected
        if (editingProfileId === id) {
          setEditingProfileId(result[0]?.id ?? '');
        }
        if (activeProfileId === id) {
          setActiveProfileId(result[0]?.id ?? '');
        }
        return result;
      });
    },
    [editingProfileId, activeProfileId]
  );

  const togglePreset = useCallback(
    (profileId: string, presetId: string) => {
      setProfiles((prev: Profile[]) =>
        prev.map((p: Profile) => {
          if (p.id !== profileId) return p;
          const selected = p.raw_ui_state.selectedPresets;
          const isRemoving = selected.includes(presetId);
          const newSelected = isRemoving
            ? selected.filter((id: string) => id !== presetId)
            : [...selected, presetId];
          const currentOrder = p.raw_ui_state.catalogOrder ?? [];
          const newOrder = isRemoving
            ? currentOrder.filter((id: string) => id !== presetId)
            : currentOrder.includes(presetId)
              ? currentOrder
              : [...currentOrder, presetId];
          return {
            ...p,
            raw_ui_state: { ...p.raw_ui_state, selectedPresets: newSelected, catalogOrder: newOrder },
          };
        })
      );
    },
    []
  );

  const reorderCatalogs = useCallback((profileId: string, catalogs: Catalog[]) => {
    setProfiles((prev: Profile[]) =>
      prev.map((p: Profile) => {
        if (p.id !== profileId) return p;
        const existingIds = new Set(p.existingCatalogs.map((c: Catalog) => c.id));
        const existingCatalogMap = new Map(p.existingCatalogs.map((c: Catalog) => [c.id, c]));
        const reorderedExisting = catalogs
          .filter((c: Catalog) => existingIds.has(c.id))
          .map((c: Catalog) => existingCatalogMap.get(c.id))
          .filter((c: Catalog | undefined): c is Catalog => Boolean(c));
        const untouchedExisting = p.existingCatalogs.filter((c: Catalog) => !reorderedExisting.some((r: Catalog) => r.id === c.id));
        return {
          ...p,
          existingCatalogs: [...reorderedExisting, ...untouchedExisting],
          raw_ui_state: { ...p.raw_ui_state, catalogOrder: catalogs.map((c: Catalog) => c.id) },
        };
      })
    );
  }, []);

  const removeCatalog = useCallback((profileId: string, catalogId: string) => {
    setProfiles((prev: Profile[]) =>
      prev.map((p: Profile) => {
        if (p.id !== profileId) return p;
        const newSelectedPresets = p.raw_ui_state.selectedPresets.filter(
          (id: string) => id !== catalogId
        );
        const newCatalogs = p.existingCatalogs.filter((c: Catalog) => c.id !== catalogId);
        return {
          ...p,
          existingCatalogs: newCatalogs,
          raw_ui_state: {
            ...p.raw_ui_state,
            selectedPresets: newSelectedPresets,
            catalogOrder: (p.raw_ui_state.catalogOrder ?? []).filter((id: string) => id !== catalogId),
          },
        };
      })
    );
  }, []);

  const addCatalog = useCallback((profileId: string, catalog: Catalog) => {
    setProfiles((prev: Profile[]) =>
      prev.map((p: Profile) => {
        if (p.id !== profileId) return p;
        if (p.existingCatalogs.some((c: Catalog) => c.id === catalog.id)) return p;
        return {
          ...p,
          existingCatalogs: [...p.existingCatalogs, catalog],
          raw_ui_state: {
            ...p.raw_ui_state,
            catalogOrder: (p.raw_ui_state.catalogOrder ?? []).includes(catalog.id)
              ? p.raw_ui_state.catalogOrder
              : [...(p.raw_ui_state.catalogOrder ?? []), catalog.id],
          },
        };
      })
    );
  }, []);
  return {
    profiles,
    setProfiles,
    activeProfile,
    editingProfile,
    activeProfileId,
    editingProfileId,
    setActiveProfileId,
    setEditingProfileId,
    updateProfile,
    addProfile,
    removeProfile,
    togglePreset,
    reorderCatalogs,
    removeCatalog,
    addCatalog,

    syncStatus,
    syncProfileVectors: async (profileId: string, userId: string) => {
      try {
        setSyncStatus({ isSyncing: true, total: 100, current: 0, phase: 'Inizializzazione...' });
        
        // --- STAGE 1: Background Refresh ---
        setSyncStatus((prev: SyncStatus) => ({ ...prev, phase: 'Sincronizzazione Stremio/Trakt...', current: 6 }));
        await api.refreshSync(profileId, userId);

        // --- STAGE 2: Client Vector Calculation ---
        // 1. Fetch Raw Data (History + Manual DNA + Active Catalogs)
        setSyncStatus((prev: SyncStatus) => ({ ...prev, phase: 'Recupero dati profilo...', current: 10 }));
        const data: RawProfileData = await api.getRawProfileData(profileId, userId);
        
        // 2. Metadata Enrichment (Batch)
        setSyncStatus((prev: SyncStatus) => ({ ...prev, phase: 'Arricchimento metadati...', current: 20 }));
        
        const movies = [...new Set(data.history.filter(h => h.type === 'movie').map(h => h.tmdbId))];
        const tv = [...new Set(data.history.filter(h => h.type === 'tv').map(h => h.tmdbId))];
        
        const metadataMap: Record<number, any> = {};
        
        if (movies.length > 0) {
          const res = await api.batchTmdbDetails(movies, 'movie');
          Object.assign(metadataMap, res.results || {});
        }
        if (tv.length > 0) {
          const res = await api.batchTmdbDetails(tv, 'tv');
          Object.assign(metadataMap, res.results || {});
        }
        
        setSyncStatus((prev: SyncStatus) => ({ ...prev, phase: 'Calcolo vettori VSM...', current: 60 }));

        // 3. Vector Calculation: Real History + Manual Settings + Catalog Priming
        const vectors = VectorEngine.computeProfileVectors(
          data.history, 
          metadataMap,
          data.manualDNA || [], 
          data.activeCatalogs || []
        );

        // 4. Global Contamination (if not global)
        if (profileId !== 'global' && data.globalVectors?.V_final) {
          setSyncStatus((prev: SyncStatus) => ({ ...prev, phase: 'Contaminazione globale...', current: 80 }));
          vectors.V_final = VectorEngine.applyContamination(vectors.V_final, data.globalVectors.V_final);
        }

        // 5. Final Sync Back
        setSyncStatus((prev: SyncStatus) => ({ ...prev, phase: 'Sincronizzazione finale...', current: 90 }));
        await api.syncVectors(profileId, userId, { compiledVectors: vectors });
        
        setSyncStatus({ isSyncing: false, total: 100, current: 100, phase: 'Completato' });
        return vectors;
      } catch (err) {
        setSyncStatus({ isSyncing: false, total: 100, current: 0, phase: 'Errore' });
        console.error('Failed to sync profile vectors:', err);
        throw err;
      }
    }
  };
}
