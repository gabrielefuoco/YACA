import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Profile } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().split('-')[0];
  }
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Transforms a frontend Profile array to the format the backend configure API expects.
 */
export function profilesToApiPayload(profiles: Profile[]) {
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    selectedPresets: p.raw_ui_state.selectedPresets,
    presetOverrides: p.raw_ui_state.presetOverrides,
    catalogOrder: p.raw_ui_state.catalogOrder,
    existingCatalogs: p.existingCatalogs,
    newPrompts: p.raw_ui_state.newPrompts,
    settings: {
      minVoteAverage: p.settings?.voteAverageMin ?? 0,
      minVoteCount: p.settings?.voteCountMin ?? 0,
      fastPresetRefresh: p.settings?.fastRefresh ?? false,
    },
  }));
}

/**
 * Maps a backend-stored profile (from UserConfig) to the frontend Profile type.
 * The backend stores processed `catalogs` and uses different settings field names.
 */
export function mapBackendProfile(backendProfile: Record<string, unknown>): Profile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bCatalogs: any[] = Array.isArray(backendProfile.catalogs) ? (backendProfile.catalogs as any[]) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawUi: any = (typeof backendProfile.raw_ui_state === 'object' && backendProfile.raw_ui_state !== null)
    ? backendProfile.raw_ui_state : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bSettings: any = (typeof backendProfile.settings === 'object' && backendProfile.settings !== null)
    ? backendProfile.settings : {};

  // Non-preset catalogs are the "existing" custom/AI/merged catalogs
  const existingCatalogs = bCatalogs.filter(
    (c) => !String(c.id || '').startsWith('yaca_preset_')
  );

  return {
    id: String(backendProfile.id ?? generateId()),
    name: String(backendProfile.name ?? 'Profilo'),
    raw_ui_state: {
      selectedPresets: Array.isArray(rawUi.selectedPresets) ? rawUi.selectedPresets : [],
      newPrompts: [],
      presetOverrides: (typeof rawUi.presetOverrides === 'object' && rawUi.presetOverrides !== null)
        ? rawUi.presetOverrides : {},
      catalogOrder: Array.isArray(rawUi.catalogOrder) ? rawUi.catalogOrder : [],
    },
    existingCatalogs,
    settings: {
      voteAverageMin: typeof bSettings.minVoteAverage === 'number' ? bSettings.minVoteAverage : 0,
      voteCountMin: typeof bSettings.minVoteCount === 'number' ? bSettings.minVoteCount : 0,
      fastRefresh: Boolean(bSettings.fastPresetRefresh),
      tmdbKey: typeof bSettings.tmdbKey === 'string' ? bSettings.tmdbKey : '',
    },
  };
}

