/**
 * Chiave di cache dei cataloghi: al posto del contatore globale `configVersion`
 * (rigenerato a ogni salvataggio, e quindi causa di cache orfane ovunque) c'è
 * l'impronta canonica della definizione del singolo catalogo.
 *
 * Copre le quattro proprietà che contano:
 *   1. definizione invariata -> chiave invariata, anche se `configVersion` cambia;
 *   2. definizione cambiata (es. il `where`) -> chiave diversa;
 *   3. catalogo vicino cambiato -> la chiave di questo non si muove;
 *   4. `badgeV` diverso -> chiave diversa (l'invalidazione globale dei badge resta).
 */

const {
    buildCatalogCacheKey,
    resolveCatalogDefinition,
    BADGE_CATALOG_VERSION,
    catalogHandler
} = require('../src/handlers/catalogHandler');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const { catalogRequestCache } = require('../src/cache/cacheInstances');

// Il router è l'unica parte costosa: lo sostituiamo per pilotare i risultati
// senza toccare provider e rete. Gli altri test del file sono funzioni pure e
// non lo usano.
jest.mock('../src/catalog/CatalogRouter', () => ({
    routeCatalogRequest: jest.fn()
}));

const CATALOG_ID = 'yaca_custom_drama';

function makeUserConfig(overrides = {}) {
    return {
        userId: 'user-1',
        configVersion: 'aaaaaaaa',
        activeProfileId: 'profile-1',
        profiles: [
            {
                id: 'profile-1',
                catalogs: [
                    {
                        id: CATALOG_ID,
                        name: 'Drama',
                        type: 'series',
                        where: ['adult = false'],
                        orderBy: '"popularity" DESC NULLS LAST',
                        queries: [{ strategy: 'discovery', with_genres: '18' }],
                        isAnime: false
                    }
                ],
                settings: { kidsMode: false, typeSelectors: { film: true, serie: true, anime: null } }
            }
        ],
        customCatalogs: [],
        ...overrides
    };
}

/** Chiave della pagina 0 del catalogo, con la definizione risolta dalla configurazione. */
function keyFor(userConfig, { badgeVersion = BADGE_CATALOG_VERSION } = {}) {
    return buildCatalogCacheKey({
        id: CATALOG_ID,
        type: 'series',
        extra: { skip: 0 },
        directFilters: undefined,
        skip: 0,
        catalogMeta: resolveCatalogDefinition(CATALOG_ID, userConfig, CATALOG_ID),
        userConfig,
        activeProfileSettings: userConfig.profiles[0].settings,
        badgeVersion
    });
}

describe('Chiave di cache dei cataloghi', () => {
    it('1. definizione invariata: la chiave non cambia anche se configVersion è nuovo', () => {
        const before = keyFor(makeUserConfig({ configVersion: 'aaaaaaaa' }));
        const after = keyFor(makeUserConfig({ configVersion: 'zzzzzzzz' }));
        const yetAnother = keyFor(makeUserConfig({ config: { configVersion: 'bbbbbbbb' } }));

        expect(before).toBe(after);
        expect(before).toBe(yetAnother);
    });

    it('2. definizione cambiata: se cambia il where la chiave cambia', () => {
        const base = keyFor(makeUserConfig());

        const changedWhere = makeUserConfig();
        changedWhere.profiles[0].catalogs[0].where = ['adult = false', 'vote_count > 100'];
        expect(keyFor(changedWhere)).not.toBe(base);

        const changedOrderBy = makeUserConfig();
        changedOrderBy.profiles[0].catalogs[0].orderBy = '"vote_average" DESC NULLS LAST';
        expect(keyFor(changedOrderBy)).not.toBe(base);

        const changedQueries = makeUserConfig();
        changedQueries.profiles[0].catalogs[0].queries = [{ strategy: 'discovery', with_genres: '28' }];
        expect(keyFor(changedQueries)).not.toBe(base);
    });

    it('3. catalogo vicino cambiato: la chiave di questo catalogo non si muove', () => {
        const base = keyFor(makeUserConfig());

        const withOtherCatalog = makeUserConfig();
        withOtherCatalog.profiles[0].catalogs.push({
            id: 'yaca_custom_comedy',
            name: 'Comedy',
            type: 'movie',
            where: ['adult = false']
        });
        withOtherCatalog.configVersion = 'zzzzzzzz';

        expect(keyFor(withOtherCatalog)).toBe(base);
    });

    it('4. badgeV diverso: la chiave cambia, l\'invalidazione globale dei badge resta', () => {
        const base = keyFor(makeUserConfig(), { badgeVersion: 18 });

        expect(keyFor(makeUserConfig(), { badgeVersion: 17 })).not.toBe(base);
        expect(keyFor(makeUserConfig(), { badgeVersion: 19 })).not.toBe(base);
        expect(keyFor(makeUserConfig(), { badgeVersion: BADGE_CATALOG_VERSION })).toBe(base);
    });

    it('l\'ordine delle chiavi nella definizione non cambia la chiave', () => {
        const base = makeUserConfig();
        const shuffled = makeUserConfig();
        shuffled.profiles[0].catalogs[0] = {
            isAnime: false,
            queries: [{ strategy: 'discovery', with_genres: '18' }],
            orderBy: '"popularity" DESC NULLS LAST',
            where: ['adult = false'],
            type: 'series',
            name: 'Drama',
            id: CATALOG_ID
        };

        expect(keyFor(shuffled)).toBe(keyFor(base));
    });

    it('i selettori del profilo restano in chiave: kidsMode e typeSelectors cambiano la chiave', () => {
        const base = keyFor(makeUserConfig());

        const kids = makeUserConfig();
        kids.profiles[0].settings.kidsMode = true;
        expect(keyFor(kids)).not.toBe(base);

        const animeOff = makeUserConfig();
        animeOff.profiles[0].settings.typeSelectors = { film: true, serie: true, anime: 'exclude' };
        expect(keyFor(animeOff)).not.toBe(base);
    });

    it('un catalogo senza definizione (standard) ha una chiave stabile', () => {
        const userConfig = makeUserConfig({ profiles: [{ id: 'profile-1', catalogs: [], settings: {} }] });

        const key = buildCatalogCacheKey({
            id: 'yaca_watchlist_movies',
            type: 'movie',
            extra: { skip: 0 },
            skip: 0,
            catalogMeta: resolveCatalogDefinition('yaca_watchlist_movies', userConfig, 'yaca_watchlist_movies'),
            userConfig,
            activeProfileSettings: {}
        });

        expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
});

/**
 * Il costo di una costruzione era invisibile: nessun tempo scritto da nessuna
 * parte, quindi "la cache dei cataloghi vale la pena?" si decideva alla cieca.
 * Una riga sola lo rende misurabile: `[CatalogTiming] id=… catalog=… cache=hit|build ms=… titles=…`.
 */
describe('Tempo di costruzione di un catalogo ([CatalogTiming])', () => {
    const ITEMS = [
        { id: 'tmdb:101', type: 'series', name: 'Alpha' },
        { id: 'tmdb:102', type: 'series', name: 'Beta' }
    ];

    const userConfig = {
        userId: 'user-timing',
        activeProfileId: 'p-timing',
        apiKeys: { tmdb: 'fake_tmdb_key' },
        profiles: [
            {
                id: 'p-timing',
                name: 'Timing',
                settings: { kidsMode: false, typeSelectors: { film: true, serie: true, anime: null } }
            }
        ]
    };

    const args = { id: 'preset_pop_series', type: 'series', extra: { skip: 0 } };

    /** Esegue `fn` e restituisce solo le righe `[CatalogTiming]` emesse. */
    async function timingLinesOf(fn) {
        const lines = [];
        const spy = jest.spyOn(console, 'log').mockImplementation((...logged) => {
            const line = logged.map(String).join(' ');
            if (line.includes('[CatalogTiming]')) lines.push(line);
        });
        try {
            await fn();
        } finally {
            spy.mockRestore();
        }
        return lines;
    }

    beforeEach(async () => {
        jest.clearAllMocks();
        await catalogRequestCache.clear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('1. costruzione: una riga con id del catalogo, durata, titoli prodotti e cache=build', async () => {
        routeCatalogRequest.mockResolvedValueOnce(ITEMS);

        const lines = await timingLinesOf(() => catalogHandler(args, userConfig, 'http://localhost:7000'));

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('id=preset_pop_series');
        expect(lines[0]).toContain('catalog=preset_pop_series');
        expect(lines[0]).toContain('cache=build');
        expect(lines[0]).toMatch(/\bms=\d+\b/);   // la durata è un numero di millisecondi
        expect(lines[0]).toContain('titles=2');    // quanti titoli ha prodotto
    });

    it('2. costruzione vuota: la riga c\'è lo stesso, con titles=0', async () => {
        routeCatalogRequest.mockResolvedValueOnce([]);

        const lines = await timingLinesOf(() => catalogHandler(args, userConfig, 'http://localhost:7000'));

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('cache=build');
        expect(lines[0]).toContain('titles=0');
        expect(lines[0]).toMatch(/\bms=\d+\b/);
    });

    it('3. cache hit: la riga dice cache=hit, il catalogo NON viene ricostruito e la risposta non cambia', async () => {
        // La cache dei cataloghi sta solo su Redis (L1 disabilitata, ramMax: 0):
        // in test non c'è Redis, quindi simuliamo l'hit al punto in cui l'handler
        // parla con la cache. Ciò che conta è che `fetchCatalog` non venga chiamata.
        const cached = { metas: [{ id: 'tmdb:900', name: 'Dalla cache' }] };
        const getOrFetch = jest.spyOn(catalogRequestCache, 'getOrFetch')
            .mockResolvedValue(cached);
        routeCatalogRequest.mockResolvedValue(ITEMS);

        const response = await catalogHandler(args, userConfig, 'http://localhost:7000');

        const lines = await timingLinesOf(() => catalogHandler(args, userConfig, 'http://localhost:7000'));

        expect(getOrFetch).toHaveBeenCalledTimes(2);
        expect(routeCatalogRequest).not.toHaveBeenCalled();  // nessuna ricostruzione
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('id=preset_pop_series');
        expect(lines[0]).toContain('cache=hit');
        expect(lines[0]).not.toContain('cache=build');
        expect(lines[0]).toMatch(/\bms=\d+\b/);
        expect(lines[0]).toContain('titles=1');
        expect(response).toHaveProperty('metas'); // l'hit non rompe la risposta
    });

    it('4. warmup: la cache fresca logga un hit, la cache scaduta una build', async () => {
        const cached = { metas: [{ id: 'tmdb:901', name: 'Gia caldo' }] };
        jest.spyOn(catalogRequestCache, 'getWithStatus')
            .mockResolvedValueOnce({ value: cached, status: 'fresh' });

        const warmArgs = { ...args, extra: { ...args.extra, warmupMode: true } };
        const freshLines = await timingLinesOf(() => catalogHandler(warmArgs, userConfig, 'http://localhost:7000'));

        expect(freshLines).toHaveLength(1);
        expect(freshLines[0]).toContain('cache=hit');
        expect(freshLines[0]).toContain('titles=1');
        expect(routeCatalogRequest).not.toHaveBeenCalled();

        // Stessa chiave, ma la cache non ha più niente di fresco: il riscaldamento
        // deve costruire, e la riga deve dirlo.
        jest.spyOn(catalogRequestCache, 'getWithStatus')
            .mockResolvedValueOnce({ value: undefined, status: 'miss' });
        routeCatalogRequest.mockResolvedValueOnce(ITEMS);

        const staleLines = await timingLinesOf(() => catalogHandler(warmArgs, userConfig, 'http://localhost:7000'));

        expect(staleLines).toHaveLength(1);
        expect(staleLines[0]).toContain('cache=build');
        expect(staleLines[0]).toContain('titles=2');
        expect(routeCatalogRequest).toHaveBeenCalledTimes(1);
    });
});

/**
 * Sette preset hanno una definizione che cambia da sola ogni giorno:
 *  - i tre "nuove uscite", dove la data È il filtro della query;
 *  - i quattro anime tematici, dove la data è un valore derivato
 *    (`permissive_recent` finisce dentro `where`) e non il filtro.
 * In entrambi i casi la definizione finisce nell'impronta della chiave di cache,
 * quindi la chiave ruota: la voce di ieri non verrà più riletta ma (con il TTL
 * standard di 14 giorni) resterebbe in Redis fino a domani. Per questi sette il
 * TTL è accorciato a 36 ore; per tutti gli altri resta quello standard.
 *
 * Il TTL applicato è osservabile: l'handler lo passa a `catalogRequestCache`
 * come terzo argomento di `getOrFetch`/`set`.
 */
describe('TTL della cache cataloghi per i cataloghi a finestra giornaliera', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const STANDARD_TTL_MS = 14 * DAY_MS;
    const DAILY_WINDOW_TTL_MS = 36 * 60 * 60 * 1000;

    const userConfig = {
        userId: 'user-ttl',
        configVersion: 'ttl-v1',
        activeProfileId: 'p-ttl',
        apiKeys: { tmdb: 'fake_tmdb_key' },
        profiles: [
            {
                id: 'p-ttl',
                name: 'TTL',
                settings: { kidsMode: false, typeSelectors: { film: true, serie: true, anime: null } }
            }
        ],
        customCatalogs: []
    };

    /** Esegue l'handler con la cache già colpita e restituisce il TTL applicato. */
    async function ttlAppliedTo(catalogId, type) {
        // `jest.spyOn` su un metodo già spionato restituisce la stessa mock:
        // `mockClear` azzera le chiamate di un test precedente.
        const getOrFetch = jest.spyOn(catalogRequestCache, 'getOrFetch')
            .mockResolvedValue({ metas: [] })
            .mockClear();

        await catalogHandler({ id: catalogId, type, extra: { skip: 0 } }, userConfig, 'http://localhost:7000');

        expect(getOrFetch).toHaveBeenCalledTimes(1);
        return getOrFetch.mock.calls[0][2];
    }

    beforeEach(async () => {
        jest.clearAllMocks();
        await catalogRequestCache.clear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('1. Film: Nuove Uscite ha il TTL corto (36 ore), non quello standard', async () => {
        await expect(ttlAppliedTo('preset_new_movies', 'movie')).resolves.toBe(DAILY_WINDOW_TTL_MS);
    });

    it('2. anche gli altri due della finestra giornaliera', async () => {
        await expect(ttlAppliedTo('preset_new_series', 'series')).resolves.toBe(DAILY_WINDOW_TTL_MS);
        await expect(ttlAppliedTo('preset_new_series_eps', 'series')).resolves.toBe(DAILY_WINDOW_TTL_MS);
    });

    it('3. un preset normale resta con il TTL standard di 14 giorni', async () => {
        await expect(ttlAppliedTo('preset_pop_series', 'series')).resolves.toBe(STANDARD_TTL_MS);
        await expect(ttlAppliedTo('preset_top_rated_movies', 'movie')).resolves.toBe(STANDARD_TTL_MS);
    });

    it('4. i quattro anime tematici hanno il TTL corto (data derivata dentro `where`)', async () => {
        await expect(ttlAppliedTo('preset_anime_shonen', 'series')).resolves.toBe(DAILY_WINDOW_TTL_MS);
        await expect(ttlAppliedTo('preset_anime_shoujo', 'series')).resolves.toBe(DAILY_WINDOW_TTL_MS);
        await expect(ttlAppliedTo('preset_anime_mecha', 'series')).resolves.toBe(DAILY_WINDOW_TTL_MS);
        await expect(ttlAppliedTo('preset_anime_isekai', 'series')).resolves.toBe(DAILY_WINDOW_TTL_MS);
    });

    it('5. gli altri preset anime (nessuna data dentro) restano al TTL standard', async () => {
        await expect(ttlAppliedTo('preset_anime_seinen', 'series')).resolves.toBe(STANDARD_TTL_MS);
        await expect(ttlAppliedTo('preset_anime_action', 'series')).resolves.toBe(STANDARD_TTL_MS);
    });

    it('6. il TTL corto è circa 36 ore: supera il giorno (la chiave resta valida tutta la giornata) ma non i due', async () => {
        const ttl = await ttlAppliedTo('preset_new_movies', 'movie');

        expect(ttl).toBeGreaterThan(DAY_MS);
        expect(ttl).toBeLessThan(2 * DAY_MS);
    });
});
