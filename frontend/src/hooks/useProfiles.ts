'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Profile, Catalog } from '@/types';

import { generateId } from '@/lib/utils';

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

export function useProfiles(initialProfiles?: Profile[]) {
  const [profiles, setProfiles] = useState<Profile[]>(
    initialProfiles && initialProfiles.length > 0
      ? initialProfiles
      : [createDefaultProfile()]
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialProfiles?.[0]?.id ?? profiles[0]?.id ?? ''
  );
  const [editingProfileId, setEditingProfileId] = useState<string>(
    initialProfiles?.[0]?.id ?? profiles[0]?.id ?? ''
  );

  // Sync when initialProfiles changes (e.g. after async config decode or save)
  const initialRef = useRef(initialProfiles);
  useEffect(() => {
    if (initialProfiles && initialProfiles.length > 0 && initialProfiles !== initialRef.current) {
      initialRef.current = initialProfiles;
      setProfiles(initialProfiles);
      setActiveProfileId((prev) =>
        initialProfiles.some((p) => p.id === prev) ? prev : initialProfiles[0].id
      );
      setEditingProfileId((prev) =>
        initialProfiles.some((p) => p.id === prev) ? prev : initialProfiles[0].id
      );
    }
  }, [initialProfiles]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? profiles[0];

  const updateProfile = useCallback((id: string, updates: Partial<Profile>) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  const addProfile = useCallback((name: string) => {
    const newProfile = createDefaultProfile(name);
    setProfiles((prev) => [...prev, newProfile]);
    setEditingProfileId(newProfile.id);
    return newProfile;
  }, []);

  const removeProfile = useCallback(
    (id: string) => {
      setProfiles((prev) => {
        const remaining = prev.filter((p) => p.id !== id);
        const result = remaining.length === 0 ? [createDefaultProfile()] : remaining;
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
          const newSelected = selected.includes(presetId)
            ? selected.filter((id) => id !== presetId)
            : [...selected, presetId];
          return {
            ...p,
            raw_ui_state: { ...p.raw_ui_state, selectedPresets: newSelected },
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
        return { ...p, existingCatalogs: catalogs };
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
          raw_ui_state: { ...p.raw_ui_state, selectedPresets: newSelectedPresets },
        };
      })
    );
  }, []);

  const addCatalog = useCallback((profileId: string, catalog: Catalog) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== profileId) return p;
        if (p.existingCatalogs.some((c) => c.id === catalog.id)) return p;
        return { ...p, existingCatalogs: [...p.existingCatalogs, catalog] };
      })
    );
  }, []);

  const addPrompts = useCallback((profileId: string, prompts: string[]) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== profileId) return p;
        return {
          ...p,
          raw_ui_state: {
            ...p.raw_ui_state,
            newPrompts: [...(p.raw_ui_state?.newPrompts ?? []), ...prompts],
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
    addPrompts,
  };
}
