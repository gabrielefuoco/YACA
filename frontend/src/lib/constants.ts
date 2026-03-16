export const GENRE_NAMES: Record<string, string> = {
  // Movie Genres
  '28': 'Azione',
  '12': 'Avventura',
  '16': 'Animazione',
  '35': 'Commedia',
  '80': 'Crimine',
  '99': 'Documentario',
  '18': 'Dramma',
  '10751': 'Famiglia',
  '14': 'Fantasy',
  '36': 'Storia',
  '27': 'Horror',
  '10402': 'Musica',
  '9648': 'Mistero',
  '10749': 'Romance',
  '878': 'Fantascienza',
  '10770': 'Film TV',
  '53': 'Thriller',
  '10752': 'Guerra',
  '37': 'Western',
  // TV-Specific Genres
  '10759': 'Action & Adventure',
  '10762': 'Kids',
  '10763': 'News',
  '10764': 'Reality',
  '10765': 'Sci-Fi & Fantasy',
  '10766': 'Soap',
  '10767': 'Talk',
  '10768': 'War & Politics'
};
export const KEYWORD_NAMES: Record<string, string> = {
  '210024': 'Anime',
  '158436': 'Marvel',
  '9715': 'Supereroi',
  '4344': 'Spazio',
  '10683': 'Sopravvivenza',
  '256735': 'Graphic Novel',
};

export const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popolarità ↓' },
  { value: 'popularity.asc', label: 'Popolarità ↑' },
  { value: 'vote_average.desc', label: 'Voto ↓' },
  { value: 'vote_average.asc', label: 'Voto ↑' },
  { value: 'release_date.desc', label: 'Data ↓' },
  { value: 'release_date.asc', label: 'Data ↑' },
  { value: 'revenue.desc', label: 'Incassi ↓' },
];

export const LANGUAGES = [
  { value: '', label: 'Qualsiasi' },
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'Inglese' },
  { value: 'fr', label: 'Francese' },
  { value: 'de', label: 'Tedesco' },
  { value: 'es', label: 'Spagnolo' },
  { value: 'ja', label: 'Giapponese' },
  { value: 'ko', label: 'Coreano' },
];

export const LOCAL_STORAGE_KEYS = {
  CONFIG: 'yaca_config',
  MY_LISTS: 'yaca_my_lists',
  STREMIO_AUTH: 'yaca_stremio_auth',
  TRAKT_TOKEN: 'yaca_trakt_token',
  TRAKT_REFRESH_TOKEN: 'yaca_trakt_refresh_token',
  USER_ID: 'yaca_user_id',
  EDITING_PROFILE_ID: 'yaca_editing_profile_id',
} as const;

export const SESSION_STORAGE_KEYS = {
  PENDING_ACTIVE_PROFILE_ID: 'yaca_pending_active_profile_id',
} as const;

/** Default preset IDs shown in the "Generale" quick-start profile for new users. */
export const DEFAULT_PRESET_IDS = [
  'preset_pop_movies',
  'preset_pop_series',
  'preset_new_movies',
  'preset_new_series',
  'preset_top_rated_movies',
  'preset_top_rated_series',
  'preset_pop_anime',
] as const;
