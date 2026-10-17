/**
 * REGOLA ARCHITETTURALE (Ticket 11): Il client nomina solo il dominio.
 *
 * Nessun componente del client deve mai nominare l'infrastruttura del server:
 * - NO /api/tmdb/* (sostituito da /api/ricerca?tipo=...)
 * - NO /api/sync/* (sostituito da /api/profilo/sincronizzazione)
 * - NO /api/validate-* (sostituito da /api/configurazione/verifica)
 * - NO /api/clear-cache (sostituito da /api/profilo/aggiorna)
 * - NO /api/profiles/:id/* (sostituito da /api/profilo/*)
 * - NO userId in query o body (l'identità è stabilita dal cookie di sessione HttpOnly)
 *
 * Il client esprime intenzioni di dominio; il server orchestra i dati e le dipendenze.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function getCsrfTokenFromCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)yaca_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    let errorCode: string | undefined;
    try {
      const errData = await res.json();
      if (errData && typeof errData === 'object') {
        if (errData.error && typeof errData.error === 'object') {
          errorMsg = errData.error.message || errorMsg;
          errorCode = errData.error.code;
        } else if (typeof errData.error === 'string') {
          errorMsg = errData.error;
        } else if (errData.message) {
          errorMsg = errData.message;
        } else {
          errorMsg = JSON.stringify(errData);
        }
      }
    } catch {
      // Risposta di errore non-JSON
    }
    const error = new Error(errorMsg);
    (error as any).status = res.status;
    (error as any).code = errorCode;
    (error as any).response = res;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
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
  return handleResponse(res);
}

async function get(url: string) {
  const res = await fetch(url, { credentials: 'include' });
  return handleResponse(res);
}

async function put(url: string, body?: object) {
  const csrfToken = getCsrfTokenFromCookie();
  const headers = csrfToken
    ? { ...JSON_HEADERS, 'X-CSRF-Token': csrfToken }
    : JSON_HEADERS;
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res);
}

async function del(url: string) {
  const csrfToken = getCsrfTokenFromCookie();
  const headers = csrfToken
    ? { ...JSON_HEADERS, 'X-CSRF-Token': csrfToken }
    : JSON_HEADERS;
  const res = await fetch(url, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  return handleResponse(res);
}

export const api = {
  // --- AUTENTICAZIONE ---
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
  stremioAuth: (email: string, password: string) =>
    post('/api/auth/stremio', { email, password }),
  traktDeviceCode: () =>
    post('/api/auth/trakt/code'),
  traktDeviceToken: (device_code: string) =>
    post('/api/auth/trakt/token', { device_code }),
  disconnectTrakt: (_userId?: string) =>
    del('/api/auth/trakt'),

  // --- CONFIGURAZIONE ---
  getPresets: () =>
    get('/api/configurazione/preset'),
  previewCatalog: (body: any) => {
    const { userId: _unused, ...clean } = body || {};
    return post('/api/configurazione/anteprima', clean);
  },
  configure: (body: any) => {
    const { userId: _unused, ...clean } = body || {};
    return post('/api/configurazione', clean);
  },
  stremioAddonUpdate: (authKey?: string, manifestUrl?: string) =>
    post('/api/configurazione', { stremioAuthKey: authKey, manifestUrl }),
  validateTmdbKey: (tmdbKey: string) =>
    post('/api/configurazione/verifica', { tmdbKey }),
  validateMistralKey: (mistralKey: string) =>
    post('/api/configurazione/verifica', { mistralKey }),
  generateMergedName: (nameA: string, nameB: string) =>
    post('/api/configurazione/nome', { nameA, nameB }),

  // --- PROFILO & LIBRERIA ---
  getProfile: () =>
    get('/api/profilo'),
  checkUser: (_authKey?: string, _email?: string) =>
    get('/api/profilo'),
  getProfileAnalytics: (_profileId?: string, _userId?: string) =>
    get('/api/profilo'),
  getSyncStatus: (profileId: string = 'global', _userId?: string) =>
    get(`/api/profilo/sincronizzazione?profileId=${encodeURIComponent(profileId)}`),
  refreshSync: (profileId: string = 'global', _userId?: string) =>
    post('/api/profilo/sincronizzazione', { profileId }),
  confirmDNA: (profileId: string = 'global', _userId?: string) =>
    post('/api/profilo/dna/conferma', { profileId }),
  clearCache: () =>
    post('/api/profilo/aggiorna'),

  getLibrary: (_profileId?: string, _userId?: string) =>
    get('/api/profilo/libreria'),
  addToLibrary: (arg1: any, arg2?: any, arg3?: any) => {
    // Gestisce sia (item) che legacy (profileId, userId, item)
    const item = arg3 !== undefined ? arg3 : (arg2 && arg2.id ? arg2 : (arg1 && arg1.id ? arg1 : arg2));
    return post('/api/profilo/libreria', { item });
  },
  removeFromLibrary: (arg1: string, _arg2?: string, arg3?: string) => {
    // Gestisce sia (itemId) che legacy (profileId, userId, itemId)
    const itemId = arg3 || arg1;
    return del(`/api/profilo/libreria/${encodeURIComponent(itemId)}`);
  },
  reorderLibrary: (arg1: any, arg2?: any, arg3?: any) => {
    // Gestisce sia (itemIds, profileId) che legacy (profileId, userId, itemIds)
    const itemIds = Array.isArray(arg1) ? arg1 : (Array.isArray(arg3) ? arg3 : (Array.isArray(arg2) ? arg2 : []));
    const profileId = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : 'global');
    return put('/api/profilo/libreria/ordine', { itemIds, profileId });
  },
  getWatchedLibraryPreview: (_profileId?: string, _userId?: string) =>
    get('/api/profilo/libreria/visti'),
  removeWatchedLibrary: (_profileId?: string, _userId?: string) =>
    post('/api/profilo/libreria/visti'),
  convertLibrary: (profileId: string = 'global', _userId?: string) =>
    post('/api/profilo/sincronizzazione', { profileId }),

  // --- RICERCA UNIFICATA ---
  searchTmdbKeywords: (query: string) =>
    get(`/api/ricerca?tipo=keyword&q=${encodeURIComponent(query)}`),
  searchTmdbGenres: (query: string) =>
    get(`/api/ricerca?tipo=genere&q=${encodeURIComponent(query)}`),
  searchTmdbPeople: (query: string) =>
    get(`/api/ricerca?tipo=persona&q=${encodeURIComponent(query)}`),
  searchTmdbMulti: (query: string) =>
    get(`/api/ricerca?tipo=titolo&q=${encodeURIComponent(query)}`),

  // --- MONDI DEL GRAFO ---
  getMondi: (profileId: string = 'global', quante: number = 4) =>
    post('/api/mondi', { profileId, quante }),
};
