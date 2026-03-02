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
  aiPreviewCatalog: (body: object) => post('/api/preview-catalog', body),
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
};
