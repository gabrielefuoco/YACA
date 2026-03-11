const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function post(url: string, body?: object) {
  const res = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function get(url: string) {
  const res = await fetch(url, { credentials: 'include' });
  return res.json();
}

export const api = {
  // Auth endpoints (session-based, HttpOnly cookie)
  authLogin: (email: string, password: string) =>
    post('/api/auth/login', { email, password }),
  authLogout: () => post('/api/auth/logout'),
  authSession: () => get('/api/auth/session'),

  getPresets: () => get('/api/presets'),
  previewCatalog: (body: object) => post('/api/preview-catalog', body),
  configure: (body: object) => post('/api/configure', body),
  stremioAuth: (email: string, password: string) =>
    post('/api/stremio-auth', { email, password }),
  stremioAddonUpdate: (authKey: string, manifestUrl: string) =>
    post('/api/stremio-addon-update', { authKey, manifestUrl }),
  validateTmdbKey: (tmdbKey: string) =>
    post('/api/validate-tmdb-key', { tmdbKey }),
  traktDeviceCode: () => post('/api/trakt/device/code'),
  traktDeviceToken: (device_code: string) =>
    post('/api/trakt/device/token', { device_code }),
  clearCache: () => post('/api/clear-cache'),
  searchTmdbKeywords: (query: string) =>
    get(`/api/tmdb/search/keyword?query=${encodeURIComponent(query)}`),
  searchTmdbGenres: (query: string) =>
    get(`/api/tmdb/search/genre?query=${encodeURIComponent(query)}`),
  searchTmdbPeople: (query: string) =>
    get(`/api/tmdb/search/person?query=${encodeURIComponent(query)}`),
  generateMergedName: (nameA: string, nameB: string) =>
    post('/api/ai/generate-merged-name', { nameA, nameB }),
  checkUser: (authKey: string, email?: string) =>
    post('/api/check-user', { authKey, email }),
  getProfileAnalytics: (profileId: string, userId: string) =>
    get(`/api/profiles/${encodeURIComponent(profileId)}/analytics?userId=${encodeURIComponent(userId)}`),
  getGlobalSyncQueue: (limit = 20) => 
    get(`/api/sync/global-queue?limit=${limit}`),
  enrichSyncItem: (body: { tmdbId: string, type: string, rawTMDB: any, userId?: string }) => 
    post('/api/sync/enrich', body),
};
