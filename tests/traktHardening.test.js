const { validateKeys } = require('../src/api/configure/validators');
const {
    smartTraktRefresh,
    checkTraktHeartbeat,
    traktClient,
    classifyRefreshError
} = require('../src/clients/trakt');
const { safeTraktFetchDetailed, fetchProfileContext } = require('../src/engines/hybrid/dataFetchers');
const { buildTraktFilteredCatalogWithMeta } = require('../src/engines/hybrid/catalogStrategies');
const jwt = require('jsonwebtoken');
const { traktHealthHandler, getJwtSecret } = require('../src/api/auth/index.js');
const UserAccount = require('../src/db/models/UserAccount');
const TasteProfile = require('../src/models/TasteProfile');

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
            userId: 'user_catalog_deg',
            addonUuid: 'uuid_cat',
            settings: {}
        })
    })
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
    }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));

jest.mock('../src/models/RecommendationImpression', () => ({
    bulkWrite: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn(),
        getDuckDbMetaDetails: jest.fn()
    };
});

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn().mockResolvedValue({ id: 101, title: 'Fallback Movie', vote_average: 7.5 }),
    createTmdbClient: jest.fn()
}));

describe('Trakt Hardening (Ticket 06 - Irrobustimento Trakt)', () => {
    let mockTraktPost;
    let mockTraktGet;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TRAKT_CLIENT_ID = 'test_client_id';
        process.env.TRAKT_CLIENT_SECRET = 'test_client_secret';
        process.env.TMDB_API_KEY = 'test_tmdb_key';

        mockTraktPost = jest.spyOn(traktClient, 'post');
        mockTraktGet = jest.spyOn(traktClient, 'get');
    });

    afterEach(() => {
        mockTraktPost.mockRestore();
        mockTraktGet.mockRestore();
    });

    describe('1. traktExpiresAt nei validatori configure (retrocompatibile & sanificazione)', () => {
        it('calcola traktExpiresAt se fornito come stringa ISO valida', () => {
            const result = validateKeys({
                tmdbKey: 'valid_tmdb_key',
                traktToken: 'valid_trakt_token_12345678',
                traktRefreshToken: 'valid_refresh_token_12345678',
                traktExpiresAt: '2026-12-31T12:00:00.000Z'
            }, null, []);

            expect(result.traktExpiresAt).toBeInstanceOf(Date);
            expect(result.traktExpiresAt.toISOString()).toBe('2026-12-31T12:00:00.000Z');
        });

        it('calcola traktExpiresAt se fornito in secondi epoch (created_at + expires_in)', () => {
            const epochSec = 1770000000;
            const result = validateKeys({
                tmdbKey: 'valid_tmdb_key',
                traktToken: 'valid_trakt_token_12345678',
                traktExpiresAt: epochSec
            }, null, []);

            expect(result.traktExpiresAt).toBeInstanceOf(Date);
            expect(result.traktExpiresAt.getTime()).toBe(epochSec * 1000);
        });

        it('retrocompatibile: imposta traktExpiresAt a null se assente (nessun errore)', () => {
            const result = validateKeys({
                tmdbKey: 'valid_tmdb_key',
                traktToken: 'valid_trakt_token_12345678'
            }, null, []);

            expect(result.traktExpiresAt).toBeNull();
        });

        it('sanifica a null se traktExpiresAt contiene una stringa non valida (nessun errore)', () => {
            const result = validateKeys({
                tmdbKey: 'valid_tmdb_key',
                traktToken: 'valid_trakt_token_12345678',
                traktExpiresAt: 'not-a-valid-date'
            }, null, []);

            expect(result.traktExpiresAt).toBeNull();
        });

        it('preserva traktExpiresAt da existingUser se il token non è cambiato e body non invia scadenza', () => {
            const existingDate = new Date('2027-01-01T00:00:00.000Z');
            const existingUser = {
                apiKeys: {
                    trakt: 'existing_trakt_token_12345678',
                    traktRefreshToken: 'existing_refresh_12345678',
                    traktExpiresAt: existingDate
                }
            };

            const result = validateKeys({
                tmdbKey: 'valid_tmdb_key',
                traktToken: 'existing_trakt_token_12345678'
            }, existingUser, []);

            expect(result.traktExpiresAt).toBeInstanceOf(Date);
            expect(result.traktExpiresAt.toISOString()).toBe(existingDate.toISOString());
        });
    });

    describe('2. Refresh proattivo (scadenza <= 1h vs token valido)', () => {
        it('scadenza entro 1h → attiva refresh proattivo prima della chiamata API', async () => {
            const expiringIn30m = new Date(Date.now() + 30 * 60 * 1000);
            const userObj = {
                userId: 'user_proactive',
                apiKeys: {
                    trakt: 'old_access_token',
                    traktRefreshToken: 'refresh_candidate',
                    traktExpiresAt: expiringIn30m
                }
            };

            // Trakt refresh risponde con nuovi token
            mockTraktPost.mockResolvedValueOnce({
                data: {
                    access_token: 'fresh_access_token',
                    refresh_token: 'fresh_refresh_token',
                    expires_in: 7200,
                    created_at: Math.floor(Date.now() / 1000)
                }
            });

            // Trakt endpoint dati risponde 200
            mockTraktGet.mockResolvedValueOnce({
                data: [{ id: 1, title: 'Item 1' }]
            });

            UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'user_proactive' });

            const result = await safeTraktFetchDetailed('/recommendations/movies', 'old_access_token', 10, userObj);

            // Verifica che il refresh sia stato chiamato
            expect(mockTraktPost).toHaveBeenCalledWith(
                '/oauth/token',
                expect.objectContaining({ refresh_token: 'refresh_candidate' }),
                expect.any(Object)
            );

            // Verifica che la chiamata dati abbia usato il NUOVO token aggiornato
            expect(mockTraktGet).toHaveBeenCalledWith(
                '/recommendations/movies',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer fresh_access_token'
                    })
                })
            );

            // Verifica che lo userObj in memoria sia stato aggiornato
            expect(userObj.apiKeys.trakt).toBe('fresh_access_token');
            expect(userObj.apiKeys.traktRefreshToken).toBe('fresh_refresh_token');
            expect(result.items.length).toBe(1);
        });

        it('token valido (> 1h) → nessun refresh proattivo', async () => {
            const expiringIn5h = new Date(Date.now() + 5 * 60 * 60 * 1000);
            const userObj = {
                userId: 'user_valid',
                apiKeys: {
                    trakt: 'still_valid_access_token',
                    traktRefreshToken: 'refresh_candidate',
                    traktExpiresAt: expiringIn5h
                }
            };

            mockTraktGet.mockResolvedValueOnce({
                data: [{ id: 2, title: 'Item 2' }]
            });

            const result = await safeTraktFetchDetailed('/recommendations/movies', 'still_valid_access_token', 10, userObj);

            // Nessun refresh deve essere partito
            expect(mockTraktPost).not.toHaveBeenCalled();

            // Chiamata dati eseguita direttamente con il token corrente
            expect(mockTraktGet).toHaveBeenCalledWith(
                '/recommendations/movies',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer still_valid_access_token'
                    })
                })
            );

            expect(userObj.apiKeys.trakt).toBe('still_valid_access_token');
            expect(result.items.length).toBe(1);
        });
    });

    describe('3. Guardia anti-riuso del refresh token (single-use)', () => {
        it('refresh fallito o timeout → nessun retry + stato richiede ri-autorizzazione persistito', async () => {
            // Simuliamo fallimento Trakt (es. timeout o invalid_grant)
            mockTraktPost.mockRejectedValueOnce(new Error('Network timeout on token refresh'));

            UserAccount.findOne.mockResolvedValueOnce({
                userId: 'user_burn',
                traktStatus: { status: 'ok', refreshInProgress: false }
            });

            const refreshResult = await smartTraktRefresh('user_burn', 'burned_refresh_token');

            expect(refreshResult).toBeNull();

            // Verifica che sia stato persistito lo stato 'requires_reauth'
            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_burn' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'traktStatus.status': 'requires_reauth',
                        'traktStatus.refreshInProgress': false,
                        'traktStatus.lastError': expect.stringContaining('Refresh fallito')
                    })
                })
            );

            // SECONDO TENTATIVO: non deve assolutamente chiamare Trakt (guardia single-use)
            UserAccount.findOne.mockResolvedValueOnce({
                userId: 'user_burn',
                traktStatus: { status: 'requires_reauth' }
            });

            const secondAttempt = await smartTraktRefresh('user_burn', 'burned_refresh_token');

            expect(secondAttempt).toBeNull();
            // mockTraktPost è stato chiamato 1 sola volta in tutto (nel primo test), mai nel secondo
            expect(mockTraktPost).toHaveBeenCalledTimes(1);
        });

        it('richiesta mai partita (ECONNREFUSED) → imposta status degraded e resta ritentabile al turno successivo', async () => {
            const connErr = new Error('connect ECONNREFUSED 127.0.0.1:443');
            connErr.code = 'ECONNREFUSED';
            connErr.request = {};
            mockTraktPost.mockRejectedValueOnce(connErr);

            UserAccount.findOne.mockResolvedValueOnce({
                userId: 'user_conn_err',
                traktStatus: { status: 'ok', refreshInProgress: false }
            });

            const result = await smartTraktRefresh('user_conn_err', 'unburned_refresh_token');

            expect(result).toBeNull();

            // Verifica che lo stato sia 'degraded' e NON 'requires_reauth'
            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_conn_err' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'traktStatus.status': 'degraded',
                        'traktStatus.refreshInProgress': false,
                        'traktStatus.lastError': expect.stringContaining('ECONNREFUSED')
                    })
                })
            );

            // SECONDO TENTATIVO: non è bloccato (degraded è ritentabile!), esegue la chiamata
            mockTraktPost.mockResolvedValueOnce({
                data: {
                    access_token: 'new_recovered_token',
                    refresh_token: 'new_recovered_refresh',
                    expires_in: 7200
                }
            });

            UserAccount.findOne.mockResolvedValueOnce({
                userId: 'user_conn_err',
                traktStatus: { status: 'degraded' }
            });

            const secondResult = await smartTraktRefresh('user_conn_err', 'unburned_refresh_token');

            expect(secondResult).not.toBeNull();
            expect(secondResult.access_token).toBe('new_recovered_token');
            // Entrambe le chiamate HTTP a mockTraktPost sono state effettuate (la seconda non è stata bloccata)
            expect(mockTraktPost).toHaveBeenCalledTimes(2);
        });

        it('richiesta mai partita (ENOTFOUND o nessun err.request) → imposta status degraded', async () => {
            const dnsErr = new Error('getaddrinfo ENOTFOUND api.trakt.tv');
            dnsErr.code = 'ENOTFOUND';
            mockTraktPost.mockRejectedValueOnce(dnsErr);

            UserAccount.findOne.mockResolvedValueOnce({
                userId: 'user_dns_err',
                traktStatus: { status: 'ok', refreshInProgress: false }
            });

            const result = await smartTraktRefresh('user_dns_err', 'token_dns');

            expect(result).toBeNull();
            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_dns_err' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'traktStatus.status': 'degraded',
                        'traktStatus.refreshInProgress': false
                    })
                })
            );
        });

        it('classifyRefreshError distingue timeout da errori di mancata connessione e risposte server', () => {
            // Timeout -> requires_reauth
            expect(classifyRefreshError(new Error('Network timeout')).status).toBe('requires_reauth');
            expect(classifyRefreshError({ code: 'ECONNABORTED', message: 'timeout', request: {} }).status).toBe('requires_reauth');
            expect(classifyRefreshError({ code: 'ETIMEDOUT', message: 'timed out', request: {} }).status).toBe('requires_reauth');

            // Richiesta mai inviata -> degraded
            expect(classifyRefreshError({ code: 'ECONNREFUSED', request: {} }).status).toBe('degraded');
            expect(classifyRefreshError({ code: 'ENOTFOUND', request: {} }).status).toBe('degraded');
            expect(classifyRefreshError({ code: 'ENETUNREACH', request: {} }).status).toBe('degraded');
            expect(classifyRefreshError(new Error('no request sent')).status).toBe('degraded'); // nessun err.request né err.response

            // Risposta server (es. invalid_grant o 400) -> requires_reauth
            expect(classifyRefreshError({ response: { status: 400, data: { error: 'invalid_grant' } }, request: {} }).status).toBe('requires_reauth');
        });
    });

    describe('4. Heartbeat diagnostico & degrado dichiarato', () => {
        it('heartbeat su GET /sync/last_activities con esito 200 persiste status ok', async () => {
            mockTraktGet.mockResolvedValueOnce({
                data: {
                    movies: { watched_at: '2026-09-30T10:00:00.000Z' },
                    episodes: { watched_at: '2026-09-30T10:00:00.000Z' }
                }
            });

            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_hb_ok',
                apiKeys: { trakt: 'test_token_hb' },
                lean: jest.fn().mockResolvedValue({
                    userId: 'user_hb_ok',
                    apiKeys: { trakt: 'test_token_hb' }
                })
            });

            const hbResult = await checkTraktHeartbeat('user_hb_ok');

            expect(hbResult.status).toBe('ok');
            expect(hbResult.connected).toBe(true);
            expect(mockTraktGet).toHaveBeenCalledWith(
                '/sync/last_activities',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test_token_hb'
                    })
                })
            );

            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_hb_ok' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'traktStatus.status': 'ok',
                        'traktStatus.lastSuccess': expect.any(Date),
                        'traktStatus.lastError': null
                    })
                })
            );
        });

        it('heartbeat degradato con errore 401/403 persiste status requires_reauth', async () => {
            const err = new Error('Forbidden');
            err.response = { status: 403, data: { error: 'invalid_token' } };
            mockTraktGet.mockRejectedValueOnce(err);

            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_hb_err',
                apiKeys: { trakt: 'expired_token' },
                lean: jest.fn().mockResolvedValue({
                    userId: 'user_hb_err',
                    apiKeys: { trakt: 'expired_token' }
                })
            });

            const hbResult = await checkTraktHeartbeat('user_hb_err');

            expect(hbResult.status).toBe('requires_reauth');
            expect(UserAccount.updateOne).toHaveBeenCalledWith(
                { userId: 'user_hb_err' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'traktStatus.status': 'requires_reauth',
                        'traktStatus.lastError': 'invalid_token'
                    })
                })
            );
        });

        it('endpoint GET /api/trakt/health restituisce lo stato aggiornato', async () => {
            mockTraktGet.mockResolvedValueOnce({
                data: { movies: {} }
            });

            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_endpoint',
                apiKeys: { trakt: 'tok_endpoint' },
                lean: jest.fn().mockResolvedValue({
                    userId: 'user_endpoint',
                    apiKeys: { trakt: 'tok_endpoint' }
                })
            });

            const req = { cookies: { yaca_session: jwt.sign({ userId: 'user_endpoint' }, getJwtSecret()) } };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await traktHealthHandler(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                userId: 'user_endpoint',
                status: 'ok',
                connected: true
            }));
        });

        it('endpoint health senza sessione → 401 e nessuna chiamata a Trakt', async () => {
            mockTraktGet.mockClear();
            const req = { query: { userId: 'user_endpoint' }, cookies: {} };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await traktHealthHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
            expect(mockTraktGet).not.toHaveBeenCalled();
        });

        it('degrado nei cataloghi: buildTraktFilteredCatalogWithMeta rende visibile fallbackUsed e traktAvailable', async () => {
            const { getDuckDbCatalogFromFilters, getDuckDbCatalogFromPreset } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromPreset.mockResolvedValue([
                { _tmdbId: 101, id: 'movie:101', title: 'Fallback Movie 1', score: 8.0 }
            ]);
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { _tmdbId: 101, id: 'movie:101', title: 'Fallback Movie 1', score: 8.0 }
            ]);

            // Simuliamo il caso di degrado (Trakt non disponibile)
            const degradedTraktResult = { items: [], available: false, fallbackUsed: true, reason: 'unauthorized' };

            UserAccount.findOne.mockReturnValue({
                userId: 'user_catalog_deg',
                addonUuid: 'uuid_cat',
                lean: jest.fn().mockResolvedValue({ userId: 'user_catalog_deg', addonUuid: 'uuid_cat' })
            });

            const result = await buildTraktFilteredCatalogWithMeta(
                'user_catalog_deg',
                'global',
                'bad_trakt_token',
                'tmdb_key',
                'movie',
                false,
                degradedTraktResult
            );

            expect(result.fallbackUsed).toBe(true);
            expect(result.traktAvailable).toBe(false);
            expect(result.ids.length).toBeGreaterThan(0);
            expect(result.ids[0]).toHaveProperty('fallbackUsed', true);
            expect(result.ids[0]).toHaveProperty('traktAvailable', false);
        });
    });

    describe('5. Guardia inerte e propagazione traktStatus (Ticket 19)', () => {
        it('fetchProfileContext arricchisce l\'oggetto user con traktStatus da UserAccount', async () => {
            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_with_status',
                addonUuid: 'uuid_cat',
                apiKeys: { trakt: 'some_tok' },
                traktStatus: { status: 'requires_reauth', lastError: 'Session expired' },
                lean: jest.fn().mockResolvedValue({
                    userId: 'user_with_status',
                    addonUuid: 'uuid_cat',
                    apiKeys: { trakt: 'some_tok' },
                    traktStatus: { status: 'requires_reauth', lastError: 'Session expired' }
                })
            });

            const { user } = await fetchProfileContext('user_with_status', 'global');

            expect(user).toBeDefined();
            expect(user.traktStatus).toEqual({
                status: 'requires_reauth',
                lastError: 'Session expired'
            });
        });

        it('safeTraktFetchDetailed corto-circuita su userObj con status requires_reauth senza chiamare Trakt', async () => {
            const userObj = {
                userId: 'user_shortcut',
                apiKeys: { trakt: 'invalid_token' },
                traktStatus: { status: 'requires_reauth' }
            };

            const result = await safeTraktFetchDetailed('/recommendations/movies', 'invalid_token', 10, userObj);

            expect(result).toEqual({
                items: [],
                available: false,
                reason: 'unauthorized'
            });
            // Nessuna chiamata di rete effettuata né GET né POST
            expect(mockTraktGet).not.toHaveBeenCalled();
            expect(mockTraktPost).not.toHaveBeenCalled();
        });
    });

    describe('6. Prevenzione TDZ e robustezza builder Trakt (Ticket 16)', () => {
        it('non solleva ReferenceError TDZ se profile è assente (scenario freddo/nuovo utente) con anime: only', async () => {
            const { getDuckDbCatalogFromPreset } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromPreset.mockResolvedValueOnce([
                { _tmdbId: 501, id: 'movie:501', title: 'Anime Fallback 1', vote_average: 8.0, vote_count: 500, genres: [{ id: 16, name: 'Animation' }], original_language: 'ja' }
            ]);

            TasteProfile.findOne.mockReturnValueOnce(null);
            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_cold_otaku',
                addonUuid: 'uuid_cat',
                lean: jest.fn().mockResolvedValue({ userId: 'user_cold_otaku', addonUuid: 'uuid_cat' })
            });

            // Con profile null e selettore anime 'only', il builder chiama buildFallback(false)
            // che a sua volta invoca fetchAnimeFallbackItems prima delle dichiarazioni di types/dnaFilters.
            const result = await buildTraktFilteredCatalogWithMeta(
                'user_cold_otaku',
                'cold_context',
                null,
                'tmdb_key',
                'movie',
                false,
                null,
                { anime: 'only' }
            );

            expect(result).toBeDefined();
            expect(result.fallbackUsed).toBe(true);
            expect(result.traktAvailable).toBe(false);
            expect(result.ids.length).toBeGreaterThan(0);
        });

        it('ritorna senza sollevare quando traktToken è assente (fallback pulito senza token)', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { _tmdbId: 101, id: 'movie:101', title: 'Community Fallback 1', vote_average: 7.5, vote_count: 500 }
            ]);

            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_no_token',
                addonUuid: 'uuid_cat',
                lean: jest.fn().mockResolvedValue({ userId: 'user_no_token', addonUuid: 'uuid_cat' })
            });

            const result = await buildTraktFilteredCatalogWithMeta(
                'user_no_token',
                'global',
                null,
                'tmdb_key',
                'movie',
                false,
                null
            );

            expect(result.fallbackUsed).toBe(true);
            expect(result.traktAvailable).toBe(false);
            expect(result.ids.length).toBeGreaterThan(0);
        });

        it('ritorna senza sollevare quando Trakt restituisce dati vuoti', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { _tmdbId: 101, id: 'movie:101', title: 'Community Fallback 1', vote_average: 7.5, vote_count: 500 }
            ]);

            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_empty_trakt',
                addonUuid: 'uuid_cat',
                lean: jest.fn().mockResolvedValue({ userId: 'user_empty_trakt', addonUuid: 'uuid_cat' })
            });

            const emptyTraktResult = { items: [], available: true, fallbackUsed: false };

            const result = await buildTraktFilteredCatalogWithMeta(
                'user_empty_trakt',
                'global',
                'valid_token',
                'tmdb_key',
                'movie',
                false,
                emptyTraktResult
            );

            expect(result.fallbackUsed).toBe(true);
            expect(result.traktAvailable).toBe(false);
            expect(result.ids.length).toBeGreaterThan(0);
        });

        it('ritorna senza sollevare con token e dati Trakt disponibili', async () => {
            UserAccount.findOne.mockReturnValueOnce({
                userId: 'user_with_trakt',
                addonUuid: 'uuid_cat',
                lean: jest.fn().mockResolvedValue({ userId: 'user_with_trakt', addonUuid: 'uuid_cat' })
            });

            const validTraktResult = {
                items: [
                    { movie: { ids: { tmdb: 101 } } },
                    { movie: { ids: { tmdb: 102 } } }
                ],
                available: true,
                fallbackUsed: false
            };

            const result = await buildTraktFilteredCatalogWithMeta(
                'user_with_trakt',
                'global',
                'valid_token',
                'tmdb_key',
                'movie',
                false,
                validTraktResult
            );

            expect(result.fallbackUsed).toBe(false);
            expect(result.traktAvailable).toBe(true);
            expect(result.ids.length).toBe(2);
            expect(result.ids[0].id).toBe('101');
        });
    });
});

