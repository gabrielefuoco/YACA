const JSON_HEADERS = { 'Content-Type': 'application/json' };

function getCsrfTokenFromCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)yaca_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function post(url: string, body?: object) {
  const csrfToken = getCsrfTokenFromCookie();
  const headers = csrfToken
    ? { ...JSON_HEADERS, 'X-CSRF-Token': csrfToken }
    : JSON_HEADERS;
  const res = await fetch(url, {
    method: 'POST',
    headers,
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
  // Auth endpoints (JWT HttpOnly Cookie)
  authLogin: (email: string, password: string) =>
    post('/api/auth/login', { email, password }),
  authGuest: () =>
    post('/api/auth/guest'),
  authMe: () =>
    fetch('/api/auth/me', { credentials: 'include' }).then(async (r) => {
      if (!r.ok) return { authenticated: false };
      return r.json();
    }),
  authLogout: () => post('/api/auth/logout'),

  getPresets: () => get('/api/presets'),
  previewCatalog: (body: object) => post('/api/preview-catalog', body),
  configure: (body: object) => post('/api/configure', body),
  stremioAuth: (email: string, password: string) =>
    post('/api/stremio-auth', { email, password }),
  stremioAddonUpdate: (authKey: string, manifestUrl: string) =>
    post('/api/stremio-addon-update', { authKey, manifestUrl }),
  validateTmdbKey: (tmdbKey: string) =>
    post('/api/validate-tmdb-key', { tmdbKey }),
  validateMistralKey: (mistralKey: string) =>
    post('/api/validate-mistral-key', { mistralKey }),
  traktDeviceCode: () => post('/trakt/device/code'),
  traktDeviceToken: (device_code: string) =>
    post('/trakt/device/token', { device_code }),
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
  getSyncStatus: (profileId: string, userId: string) =>
    get(`/api/profiles/${encodeURIComponent(profileId)}/sync-status?userId=${encodeURIComponent(userId)}`),
  confirmDNA: (profileId: string, userId: string) =>
    post(`/api/profiles/${encodeURIComponent(profileId)}/dna/confirm`, { userId }),
  refreshSync: (profileId: string, userId: string) =>
    post(`/api/profiles/${encodeURIComponent(profileId)}/sync/refresh`, { userId }),
  getGlobalSyncQueue: (limit = 20) => 
    get(`/api/sync/global-queue?limit=${limit}`),
  enrichSyncItem: (body: { tmdbId: string, type: string, rawTMDB: any, userId?: string }) => 
    post('/api/sync/enrich', body),
  
  // VSM Sync Endpoints
  getRawProfileData: (profileId: string, userId: string) =>
    get(`/api/profiles/${encodeURIComponent(profileId)}/raw-data?userId=${encodeURIComponent(userId)}`),
  syncVectors: (profileId: string, userId: string, vectors: any) =>
    post(`/api/profiles/${encodeURIComponent(profileId)}/sync-vectors`, { userId, ...vectors }),
  batchTmdbDetails: (tmdbIds: number[], type: 'movie' | 'tv') =>
    post('/api/tmdb/batch-details', { tmdbIds, type }),
};
