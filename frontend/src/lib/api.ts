const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function post(url: string, body?: object) {
  const res = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export const api = {
  getPresets: () => fetch('/api/presets').then((r) => r.json()),
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
    fetch(`/api/tmdb/search/keyword?query=${encodeURIComponent(query)}`).then(r => r.json()),
  searchTmdbGenres: (query: string) =>
    fetch(`/api/tmdb/search/genre?query=${encodeURIComponent(query)}`).then(r => r.json()),
  searchTmdbPeople: (query: string) =>
    fetch(`/api/tmdb/search/person?query=${encodeURIComponent(query)}`).then(r => r.json()),
  generateMergedName: (nameA: string, nameB: string) =>
    post('/api/ai/generate-merged-name', { nameA, nameB }),
  checkUser: (authKey: string, email?: string) =>
    post('/api/check-user', { authKey, email }),
  getProfileAnalytics: (profileId: string, userId: string) =>
    fetch(`/api/profiles/${encodeURIComponent(profileId)}/analytics?userId=${encodeURIComponent(userId)}`).then(r => r.json()),
  getGlobalSyncQueue: (limit = 20) => 
    fetch(`/api/sync/global-queue?limit=${limit}`).then(r => r.json()),
  enrichSyncItem: (body: { tmdbId: string, type: string, rawTMDB: any, userId?: string }) => 
    post('/api/sync/enrich', body),
};
