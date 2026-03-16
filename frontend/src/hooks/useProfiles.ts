'use client';
import { useState, useCallback, useEffect } from 'react';
import { Profile, Catalog } from '@/types';
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
      voteAverageMin: 0,
      voteCountMin: 0,
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
      voteAverageMin: 0,
      voteCountMin: 0,
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
    if (initialActiveProfileId && (initialProfiles ?? profiles).some(p => p.id === initialActiveProfileId)) {
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

  // Sync when initialProfiles changes (e.g. after async config decode or save)
  useEffect(() => {
    if (initialProfiles && initialProfiles.length > 0) {
      const safe = ensureGlobalProfile(initialProfiles);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfiles((current) => {
        // Only update if reference or length changed to avoid loop
        if (current === safe) return current;
        return safe;
      });
      setActiveProfileId((prev) =>
        safe.some((p) => p.id === prev) ? prev : safe[0].id
      );
      setEditingProfileId((prev) => {
        // Priority: stored local id > initial id > first profile
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.EDITING_PROFILE_ID);
          if (stored && safe.some(p => p.id === stored)) return stored;
        }
        return safe.some((p) => p.id === prev) ? prev : safe[0].id;
      });
    }
  }, [initialProfiles]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? profiles[0];

  const updateProfile = useCallback((id: string, updates: Partial<Profile>) => {
    setProfiles((prev) =>
      prev.map((p) => {
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
    setProfiles((prev) => [...prev, newProfile]);
    setEditingProfileId(newProfile.id);
    return newProfile;
  }, []);

  const removeProfile = useCallback(
    (id: string) => {
      if (id === 'global') return;
      setProfiles((prev) => {
        const remaining = prev.filter((p) => p.id !== id);
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
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== profileId) return p;
          const selected = p.raw_ui_state.selectedPresets;
          const isRemoving = selected.includes(presetId);
          const newSelected = isRemoving
            ? selected.filter((id) => id !== presetId)
            : [...selected, presetId];
          const currentOrder = p.raw_ui_state.catalogOrder ?? [];
          const newOrder = isRemoving
            ? currentOrder.filter((id) => id !== presetId)
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
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== profileId) return p;
        const existingIds = new Set(p.existingCatalogs.map((c) => c.id));
        const existingCatalogMap = new Map(p.existingCatalogs.map((c) => [c.id, c]));
        const reorderedExisting = catalogs
          .filter((c) => existingIds.has(c.id))
          .map((c) => existingCatalogMap.get(c.id))
          .filter((c): c is Catalog => Boolean(c));
        const untouchedExisting = p.existingCatalogs.filter((c) => !reorderedExisting.some((r) => r.id === c.id));
        return {
          ...p,
          existingCatalogs: [...reorderedExisting, ...untouchedExisting],
          raw_ui_state: { ...p.raw_ui_state, catalogOrder: catalogs.map((c) => c.id) },
        };
      })
    );
  }, []);

  const removeCatalog = useCallback((profileId: string, catalogId: string) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== profileId) return p;
        const newSelectedPresets = p.raw_ui_state.selectedPresets.filter(
          (id) => id !== catalogId
        );
        const newCatalogs = p.existingCatalogs.filter((c) => c.id !== catalogId);
        return {
          ...p,
          existingCatalogs: newCatalogs,
          raw_ui_state: {
            ...p.raw_ui_state,
            selectedPresets: newSelectedPresets,
            catalogOrder: (p.raw_ui_state.catalogOrder ?? []).filter((id) => id !== catalogId),
          },
        };
      })
    );
  }, []);

  const addCatalog = useCallback((profileId: string, catalog: Catalog) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== profileId) return p;
        if (p.existingCatalogs.some((c) => c.id === catalog.id)) return p;
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
  };
}
