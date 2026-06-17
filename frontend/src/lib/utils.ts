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
  id?: string;
  _id?: string | { $oid: string };
  name?: unknown;
  catalogs?: BackendCatalog[];
  settings?: {
    fastPresetRefresh?: boolean;
    tmdbKey?: string;
    kidsMode?: boolean;
    manualDNA?: unknown[];
    suggestedDNA?: unknown[];
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
  source?: string;
  emoji?: string;
  queries?: import('@/types').QueryBlock[];
  presentation_strategy?: 'popularity' | 'interleave';
}

export function profilesToApiPayload(profiles: Profile[]) {
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    selectedPresets: p.raw_ui_state.selectedPresets,
    presetOverrides: p.raw_ui_state.presetOverrides,
    catalogOrder: p.raw_ui_state.catalogOrder,
    heroPresetsInitialized: p.raw_ui_state.heroPresetsInitialized ?? true,
    existingCatalogs: p.existingCatalogs,
    newPrompts: p.raw_ui_state.newPrompts,
    settings: {
      fastPresetRefresh: p.settings?.fastRefresh ?? false,
      tmdbKey: p.settings?.tmdbKey,
      kidsMode: p.settings?.kidsMode ?? false,
      manualDNA: p.settings?.manualDNA ?? [],
      suggestedDNA: p.settings?.suggestedDNA ?? [],
    },
  }));
}

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
      source: c.source,
      emoji: c.emoji,
      queries: c.queries,
      presentation_strategy: c.presentation_strategy,
    }));

  const targetId = backendProfile.id || 
                   (typeof backendProfile._id === 'string' ? backendProfile._id : 
                    (backendProfile._id as Record<string, unknown>)?.$oid) || 
                   generateId();

  let selectedPresets = Array.isArray(rawUi.selectedPresets) ? rawUi.selectedPresets : [];
  const catalogOrder = Array.isArray(rawUi.catalogOrder) ? rawUi.catalogOrder : [];
  const heroPresetsInitialized = (rawUi as Record<string, unknown>).heroPresetsInitialized ?? false;

  const HERO_PRESET_IDS = [
    'yaca_true_blend_movies', 'yaca_true_blend_series',
    'yaca_seed_network_movies', 'yaca_seed_network_series',
    'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
  ];

  if (!heroPresetsInitialized) {
    selectedPresets = Array.from(new Set([...selectedPresets, ...HERO_PRESET_IDS]));
    HERO_PRESET_IDS.forEach(id => {
      if (!catalogOrder.includes(id)) {
        catalogOrder.push(id);
      }
    });
  }

  return {
    id: String(targetId),
    name: String(backendProfile.name ?? 'Profilo'),
    raw_ui_state: {
      selectedPresets,
      newPrompts: [],
      presetOverrides: rawUi.presetOverrides ?? {},
      catalogOrder,
      heroPresetsInitialized: true,
    },
    existingCatalogs,
    settings: {
      fastRefresh: Boolean(bSettings.fastPresetRefresh),
      tmdbKey: bSettings.tmdbKey ?? '',
      kidsMode: Boolean(bSettings.kidsMode),
      manualDNA: Array.isArray(bSettings.manualDNA) ? bSettings.manualDNA as import('@/types').DNAItem[] : [],
      suggestedDNA: Array.isArray(bSettings.suggestedDNA) ? bSettings.suggestedDNA as import('@/types').DNAItem[] : [],
    },
  };
}
