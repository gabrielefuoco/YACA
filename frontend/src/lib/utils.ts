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
 * Shape of a profile as stored in the backend config (UserConfig).
 * Different from the frontend Profile type - uses `catalogs` instead of
 * `existingCatalogs`, and different settings field names.
 */
export interface BackendProfile {
  id?: unknown;
  name?: unknown;
  catalogs?: BackendCatalog[];
  settings?: {
    minVoteAverage?: number;
    minVoteCount?: number;
    fastPresetRefresh?: boolean;
    tmdbKey?: string;
    manualPillars?: unknown[];
    suggestedPillars?: unknown[];
  };
  raw_ui_state?: {
    selectedPresets?: string[];
    presetOverrides?: Record<string, unknown>;
    catalogOrder?: string[];
  };
}

interface BackendCatalog {
  id: string;
  name: string;
  type: string;
  filters?: Record<string, unknown>;
  raw_prompt?: string;
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
      tmdbKey: p.settings?.tmdbKey,
      manualPillars: p.settings?.manualPillars ?? [],
      suggestedPillars: p.settings?.suggestedPillars ?? [],
    },
  }));
}

/**
 * Maps a backend-stored profile (from UserConfig) to the frontend Profile type.
 * The backend stores processed `catalogs` and uses different settings field names.
 */
export function mapBackendProfile(backendProfile: BackendProfile): Profile {
  const bCatalogs: BackendCatalog[] = backendProfile.catalogs ?? [];
  const rawUi = backendProfile.raw_ui_state ?? {};
  const bSettings = backendProfile.settings ?? {};

  // Non-preset catalogs are the "existing" custom/AI/merged catalogs
  const existingCatalogs: Profile['existingCatalogs'] = bCatalogs
    .filter((c) => !c.id.startsWith('yaca_preset_'))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type === 'series' ? 'series' : 'movie',
      filters: c.filters,
      raw_prompt: c.raw_prompt,
    }));

  return {
    id: String(backendProfile.id ?? generateId()),
    name: String(backendProfile.name ?? 'Profilo'),
    raw_ui_state: {
      selectedPresets: Array.isArray(rawUi.selectedPresets) ? rawUi.selectedPresets : [],
      newPrompts: [],
      presetOverrides: rawUi.presetOverrides ?? {},
      catalogOrder: Array.isArray(rawUi.catalogOrder) ? rawUi.catalogOrder : [],
    },
    existingCatalogs,
    settings: {
      voteAverageMin: typeof bSettings.minVoteAverage === 'number' ? bSettings.minVoteAverage : 0,
      voteCountMin: typeof bSettings.minVoteCount === 'number' ? bSettings.minVoteCount : 0,
      fastRefresh: Boolean(bSettings.fastPresetRefresh),
      tmdbKey: bSettings.tmdbKey ?? '',
      manualPillars: Array.isArray(bSettings.manualPillars) ? bSettings.manualPillars as import('@/types').Pillar[] : [],
      suggestedPillars: Array.isArray(bSettings.suggestedPillars) ? bSettings.suggestedPillars as import('@/types').Pillar[] : [],
    },
  };
}

