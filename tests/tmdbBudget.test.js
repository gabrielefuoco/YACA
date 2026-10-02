const {
    tmdbBudget,
    TMDB_CATEGORIES,
    DECLARED_TTLS,
    determineCategory,
    TmdbBudgetTracker
} = require('../src/utils/tmdbBudget');
const { createTmdbClient } = require('../src/clients/tmdb');

describe('TMDB Budget & Spesa (Ticket #38)', () => {
    beforeEach(() => {
        tmdbBudget.resetMetrics();
        tmdbBudget.configureCap({
            enabled: false,
            limit: null,
            windowMs: 60000,
            categoryLimits: {},
            softDegradation: true
        });
    });

    describe('1. Categorie Ammesse e TTL Dichiarati', () => {
        test('definisce le 4 categorie autorizzate (a, b, c, d) più categoria tecnica general', () => {
            expect(TMDB_CATEGORIES.BACKFILL).toBe('backfill');
            expect(TMDB_CATEGORIES.META_CLICK).toBe('meta_click');
            expect(TMDB_CATEGORIES.SEARCH_LIVE).toBe('search_live');
            expect(TMDB_CATEGORIES.EPISODES).toBe('episodes');
            expect(TMDB_CATEGORIES.GENERAL).toBe('general');
        });

        test('tabella DECLARED_TTLS contiene i valori attesi per ogni via', () => {
            expect(DECLARED_TTLS.META_DETAILS_RAM).toBe(24 * 60 * 60 * 1000);
            expect(DECLARED_TTLS.META_DETAILS_DB_MOVIE).toBe(30 * 24 * 60 * 60 * 1000);
            expect(DECLARED_TTLS.META_DETAILS_DB_SERIES_ONGOING).toBe(7 * 24 * 60 * 60 * 1000);
            expect(DECLARED_TTLS.META_DETAILS_DB_SERIES_FINISHED).toBe(60 * 24 * 60 * 60 * 1000);
            expect(DECLARED_TTLS.EPISODES_RAM).toBe(6 * 60 * 60 * 1000); // 6 ore da config.SERIES_META_CACHE_TTL_MS
            expect(DECLARED_TTLS.SEARCH_ID_NAME).toBe(60 * 60 * 1000);
            expect(DECLARED_TTLS.SEARCH_NORMALIZER_RAM).toBe(6 * 60 * 60 * 1000);
            expect(DECLARED_TTLS.NEGATIVE_CACHE_404).toBe(24 * 60 * 60 * 1000);
        });

        test('determineCategory classifica correttamente gli endpoint nelle 4 categorie', () => {
            // (b) Meta al click
            expect(determineCategory('/movie/550')).toBe(TMDB_CATEGORIES.META_CLICK);
            expect(determineCategory('https://api.themoviedb.org/3/tv/1399')).toBe(TMDB_CATEGORIES.META_CLICK);

            // (d) Episodi
            expect(determineCategory('/tv/1399/season/1')).toBe(TMDB_CATEGORIES.EPISODES);
            expect(determineCategory('/tv/1399', { params: { append_to_response: 'season/1,season/2' } })).toBe(TMDB_CATEGORIES.EPISODES);

            // (c) Ricerca live non soddisfatta / autocomplete / normalizzazione
            expect(determineCategory('/search/multi')).toBe(TMDB_CATEGORIES.SEARCH_LIVE);
            expect(determineCategory('/search/person')).toBe(TMDB_CATEGORIES.SEARCH_LIVE);
            expect(determineCategory('/search/keyword')).toBe(TMDB_CATEGORIES.SEARCH_LIVE);
            expect(determineCategory('/find/tt0111161')).toBe(TMDB_CATEGORIES.SEARCH_LIVE);
            expect(determineCategory('/keyword/1234')).toBe(TMDB_CATEGORIES.SEARCH_LIVE);
            expect(determineCategory('/person/287')).toBe(TMDB_CATEGORIES.SEARCH_LIVE);

            // (a) Backfill espliciti
            expect(determineCategory('/movie/changes')).toBe(TMDB_CATEGORIES.BACKFILL);
            expect(determineCategory('/tv/changes')).toBe(TMDB_CATEGORIES.BACKFILL);
            expect(determineCategory('http://files.tmdb.org/p/exports/movie_ids.json.gz')).toBe(TMDB_CATEGORIES.BACKFILL);

            // Generale / validazione
            expect(determineCategory('/configuration')).toBe(TMDB_CATEGORIES.GENERAL);
            expect(determineCategory('')).toBe(TMDB_CATEGORIES.GENERAL);
        });
    });

    describe('2. Contatori e Metriche', () => {
        test('traccia le chiamate per categoria ed endpoint normalizzato', () => {
            tmdbBudget.recordCall(TMDB_CATEGORIES.META_CLICK, '/movie/550');
            tmdbBudget.recordCall(TMDB_CATEGORIES.META_CLICK, '/movie/600');
            tmdbBudget.recordCall(TMDB_CATEGORIES.SEARCH_LIVE, '/search/multi?query=inception');
            tmdbBudget.recordCall(TMDB_CATEGORIES.EPISODES, '/tv/1399/season/1');

            const metrics = tmdbBudget.getMetrics();
            expect(metrics.totalCalls).toBe(4);
            expect(metrics.byCategory[TMDB_CATEGORIES.META_CLICK]).toBe(2);
            expect(metrics.byCategory[TMDB_CATEGORIES.SEARCH_LIVE]).toBe(1);
            expect(metrics.byCategory[TMDB_CATEGORIES.EPISODES]).toBe(1);
            expect(metrics.byCategory[TMDB_CATEGORIES.BACKFILL]).toBe(0);

            // Endpoint normalizzati (sostituzione ID)
            expect(metrics.topEndpoints['/movie/:id']).toBe(2);
            expect(metrics.topEndpoints['/search/multi']).toBe(1);
        });

        test('resetMetrics azzera tutti i contatori', () => {
            tmdbBudget.recordCall(TMDB_CATEGORIES.META_CLICK, '/movie/100');
            expect(tmdbBudget.getMetrics().totalCalls).toBe(1);

            tmdbBudget.resetMetrics();
            const resetMetrics = tmdbBudget.getMetrics();
            expect(resetMetrics.totalCalls).toBe(0);
            expect(resetMetrics.byCategory[TMDB_CATEGORIES.META_CLICK]).toBe(0);
            expect(resetMetrics.callsInCurrentWindow).toBe(0);
        });
    });

    describe('3. Cap Configurabile e Degrado Morbido', () => {
        test('di default il cap è disabilitato (chiamate illimitate)', () => {
            const check = tmdbBudget.checkBudget(TMDB_CATEGORIES.META_CLICK, '/movie/1');
            expect(check.allowed).toBe(true);
            expect(check.limit).toBeNull();
        });

        test('cap globale: consente chiamate fino al limite, poi degrada con soft skip (allowed: false, MAI eccezioni)', () => {
            const tracker = new TmdbBudgetTracker({
                enabled: true,
                limit: 3,
                windowMs: 10000,
                softDegradation: true
            });

            // Chiamate 1, 2, 3 consentite
            expect(tracker.checkBudget(TMDB_CATEGORIES.META_CLICK, '/movie/1').allowed).toBe(true);
            tracker.recordCall(TMDB_CATEGORIES.META_CLICK, '/movie/1');

            expect(tracker.checkBudget(TMDB_CATEGORIES.META_CLICK, '/movie/2').allowed).toBe(true);
            tracker.recordCall(TMDB_CATEGORIES.META_CLICK, '/movie/2');

            expect(tracker.checkBudget(TMDB_CATEGORIES.META_CLICK, '/movie/3').allowed).toBe(true);
            tracker.recordCall(TMDB_CATEGORIES.META_CLICK, '/movie/3');

            // Chiamata 4: limite raggiunto -> allowed: false, MA nessuna eccezione sollevata!
            const fourthCheck = tracker.checkBudget(TMDB_CATEGORIES.META_CLICK, '/movie/4');
            expect(fourthCheck.allowed).toBe(false);
            expect(fourthCheck.reason).toContain('Cap globale raggiunto');

            const metrics = tracker.getMetrics();
            expect(metrics.totalCalls).toBe(3);
            expect(metrics.totalSkippedByCap).toBe(1);
            expect(metrics.skippedByCategory[TMDB_CATEGORIES.META_CLICK]).toBe(1);
        });

        test('cap per-categoria: limita solo la categoria specificata, lasciando le altre libere', () => {
            const tracker = new TmdbBudgetTracker({
                enabled: true,
                limit: 10,
                windowMs: 10000,
                categoryLimits: {
                    [TMDB_CATEGORIES.SEARCH_LIVE]: 2
                }
            });

            // 2 chiamate search_live
            expect(tracker.checkBudget(TMDB_CATEGORIES.SEARCH_LIVE, '/search/multi').allowed).toBe(true);
            tracker.recordCall(TMDB_CATEGORIES.SEARCH_LIVE, '/search/multi');

            expect(tracker.checkBudget(TMDB_CATEGORIES.SEARCH_LIVE, '/search/multi').allowed).toBe(true);
            tracker.recordCall(TMDB_CATEGORIES.SEARCH_LIVE, '/search/multi');

            // 3a search_live bloccata
            const blockedSearch = tracker.checkBudget(TMDB_CATEGORIES.SEARCH_LIVE, '/search/multi');
            expect(blockedSearch.allowed).toBe(false);
            expect(blockedSearch.reason).toContain('Cap categoria "search_live" raggiunto');

            // Ma meta_click è ancora consentita!
            const allowedMeta = tracker.checkBudget(TMDB_CATEGORIES.META_CLICK, '/movie/500');
            expect(allowedMeta.allowed).toBe(true);
        });

        test('executeWithBudget degrada restituendo fallbackValue senza lanciare eccezioni', async () => {
            const tracker = new TmdbBudgetTracker({
                enabled: true,
                limit: 1,
                windowMs: 10000
            });

            const mockFetcher = jest.fn().mockResolvedValue({ id: 100, title: 'Test Movie' });

            // Prima chiamata: autorizzata
            const res1 = await tracker.executeWithBudget(
                TMDB_CATEGORIES.META_CLICK,
                '/movie/100',
                mockFetcher,
                null
            );
            expect(res1).toEqual({ id: 100, title: 'Test Movie' });
            expect(mockFetcher).toHaveBeenCalledTimes(1);

            // Seconda chiamata: supera il cap -> restituisce fallbackValue (null) e non chiama mockFetcher
            const res2 = await tracker.executeWithBudget(
                TMDB_CATEGORIES.META_CLICK,
                '/movie/101',
                mockFetcher,
                null
            );
            expect(res2).toBeNull();
            expect(mockFetcher).toHaveBeenCalledTimes(1); // Non invocata una seconda volta
            expect(tracker.getMetrics().totalSkippedByCap).toBe(1);
        });
    });

    describe('4. Integrazione con createTmdbClient (Hook Interceptor & Soft Skip)', () => {
        test('il client TMDB intercetta le chiamate quando il cap è superato e restituisce null senza eccezioni di rete', async () => {
            // Abilita cap = 1 chiamata
            tmdbBudget.configureCap({
                enabled: true,
                limit: 1,
                windowMs: 60000
            });

            const client = createTmdbClient('dummy_key');

            // Mock adapter per la prima chiamata che ha budget
            const mockAdapter = jest.fn().mockResolvedValue({
                data: { id: 42, title: 'First Allowed Movie' },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {}
            });
            client.defaults.adapter = mockAdapter;

            // 1. Prima chiamata: passa attraverso l'interceptor ed esegue il fetch
            const res1 = await client.get('/movie/42');
            expect(res1.data).toEqual({ id: 42, title: 'First Allowed Movie' });
            expect(mockAdapter).toHaveBeenCalledTimes(1);
            expect(tmdbBudget.getMetrics().totalCalls).toBe(1);

            // 2. Seconda chiamata: cap superato! L'interceptor sovrascrive l'adapter con soft skip
            const res2 = await client.get('/movie/43');
            expect(res2.data).toBeNull();
            expect(res2.isBudgetSkipped).toBe(true);
            expect(res2.status).toBe(200);

            // L'adapter originale di rete NON è stato chiamato per la seconda volta
            expect(mockAdapter).toHaveBeenCalledTimes(1);
            // Il contatore dei salti per cap è incrementato
            expect(tmdbBudget.getMetrics().totalSkippedByCap).toBe(1);
        });

        test('TmdbDumpClient.fetchWithRetry registra le chiamate BACKFILL e rispetta il cap con degrado morbido', async () => {
            const TmdbDumpClient = require('../src/utils/tmdbDumpClient');
            const axios = require('axios');
            const dumpClient = new TmdbDumpClient('dummy_dump_key');

            const axiosSpy = jest.spyOn(axios, 'get').mockResolvedValue({ data: { id: 999, name: 'Dump Tv' } });

            // Configura cap = 1
            tmdbBudget.configureCap({
                enabled: true,
                limit: 1,
                windowMs: 60000
            });

            // 1. Prima chiamata: autorizzata
            const res1 = await dumpClient.fetchWithRetry('https://api.themoviedb.org/3/tv/999');
            expect(res1).toEqual({ id: 999, name: 'Dump Tv' });
            expect(axiosSpy).toHaveBeenCalledTimes(1);
            expect(tmdbBudget.getMetrics().byCategory[TMDB_CATEGORIES.BACKFILL]).toBe(1);

            // 2. Seconda chiamata: cap superato -> restituisce null con soft degradation
            const res2 = await dumpClient.fetchWithRetry('https://api.themoviedb.org/3/tv/1000');
            expect(res2).toBeNull();
            expect(axiosSpy).toHaveBeenCalledTimes(1); // non invocato
            expect(tmdbBudget.getMetrics().totalSkippedByCap).toBe(1);

            axiosSpy.mockRestore();
        });
    });
});

