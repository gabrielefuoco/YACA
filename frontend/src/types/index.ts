export interface DNAItem {
  type: 'genre' | 'keyword' | 'country';
  id: string;
  name: string;
}

export interface ProfileSettings {
  fastRefresh?: boolean;
  tmdbKey?: string;
  manualDNA?: DNAItem[];
  suggestedDNA?: DNAItem[];
}

export interface QueryBlock {
  strategy?: 'discovery' | 'multi_search' | 'similar';
  similar_to?: string;
  text_search?: string;
  genre_ids?: number[];
  people_list?: string[];
  keyword?: string;
  company_name?: string;
  watch_provider?: string;
  original_language?: string;
  language?: string;
  year_from?: string;
  year_to?: string;
  runtime_lte?: number;
  sort_by?: string;
  with_genres?: string;
  with_keywords?: string;
  with_cast?: string;
  with_crew?: string;
  'vote_average.gte'?: number;
  'vote_count.gte'?: number;
  [key: string]: unknown;
}

export interface Catalog {
  id: string;
  name: string;
  raw_prompt?: string;
  type: 'movie' | 'series';
  source?: string;
  filters?: Record<string, unknown>;
  queries?: QueryBlock[];
  presentation_strategy?: 'popularity' | 'interleave';
  emoji?: string;
}

export interface Profile {
  id: string;
  name: string;
  raw_ui_state: {
    selectedPresets: string[];
    newPrompts: string[];
    presetOverrides: Record<string, unknown>;
    catalogOrder: string[];
  };
  existingCatalogs: Catalog[];
  settings?: ProfileSettings;
}

export interface Preset {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'both';
  category: string;
  emoji?: string;
  filters?: Record<string, unknown>;
  queries?: QueryBlock[];
  presentation_strategy?: 'popularity' | 'interleave';
  description?: string;
}

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  presets: string[];
}

export interface PosterItem {
  id: string;
  title: string;
  poster?: string;
  vote?: number;
  year?: number;
}

export interface AppConfig {
  profiles: Profile[];
  activeProfileId: string;
  stremioAuthKey?: string;
  traktToken?: string;
  traktRefreshToken?: string;
  configVersion?: string;
}

export interface StremioAuth {
  authKey: string;
  email: string;
  password?: string;
}

export interface MyList {
  id: string;
  name: string;
  type: 'movie' | 'series';
  prompt?: string;
  filters?: Record<string, unknown>;
  createdAt: number;
}

export interface AnalyticsData {
  compiledVectors?: {
    V_final: Record<string, number>;
    V_active?: Record<string, number>;
    V_static?: Record<string, number>;
  };
  aiLogs: Record<string, unknown[]>;
  baseDnaParams?: Record<string, string>;
}

export interface WatchHistoryItem {
  tmdbId: number;
  type: 'movie' | 'tv';
  episodesWatched: number;
  lastWatchedAt: string;
}

export interface RawProfileData {
  history: WatchHistoryItem[];
  manualDNA: DNAItem[];
  activeCatalogs: Catalog[];
  globalVectors: CompiledVector | null;
  subProfileVectors: Array<{ profileId: string; vectors: CompiledVector }>;
  excludedProfileIds: string[];
}

export interface SyncStatus {
  isSyncing: boolean;
  total: number;
  current: number;
  phase: string;
  compiledVectors?: CompiledVector;
}

export interface TmdbMetadata {
  id?: number;
  genres?: Array<{ id: number; name: string }>;
  keywords?: { 
    keywords?: Array<{ id: number; name: string }>; 
    results?: Array<{ id: number; name: string }>;
  };
  credits?: { 
    crew?: Array<{ job: string; id: number; name: string }>;
    cast?: Array<{ id: number; name: string }>;
  };
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

export type TmdbMetadataMap = Record<number, TmdbMetadata>;

export interface CompiledVector {
  V_final: Record<string, number>;
  V_active?: Record<string, number>;
  V_static?: Record<string, number>;
}
