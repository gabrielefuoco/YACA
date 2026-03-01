export interface ProfileSettings {
  voteAverageMin?: number;
  voteCountMin?: number;
  fastRefresh?: boolean;
  tmdbKey?: string;
}

export interface Catalog {
  id: string;
  name: string;
  raw_prompt?: string;
  type: 'movie' | 'series';
  source?: string;
  filters?: Record<string, unknown>;
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
  filters: Record<string, unknown>;
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
}

export interface MyList {
  id: string;
  name: string;
  type: 'movie' | 'series';
  prompt?: string;
  filters?: Record<string, unknown>;
  createdAt: number;
}
