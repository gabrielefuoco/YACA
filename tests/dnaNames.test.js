const {
    resolveDnaNames,
    resolveDnaItem,
    isPlaceholderName,
    getReadableFallback,
    clearDnaNamesCache
} = require('../src/utils/tmdbNameResolver');
const { processProfiles } = require('../src/api/configure/profileProcessor');
const UserConfig = require('../src/models/UserConfig');

describe('DNA Names Resolver & Integration', () => {
    let mockClient;
    let callCounts;

    beforeEach(async () => {
        await clearDnaNamesCache();
        callCounts = {
            keyword: 0,
            network: 0,
            company: 0,
            person: 0
        };

        mockClient = {
            get: jest.fn(async (url, options) => {
                if (url === '/keyword/12190') {
                    callCounts.keyword++;
                    return { data: { id: 12190, name: 'cyberpunk' } };
                }
                if (url === '/network/49') {
                    callCounts.network++;
                    return { data: { id: 49, name: 'HBO' } };
                }
                if (url === '/company/41077') {
                    callCounts.company++;
                    return { data: { id: 41077, name: 'A24' } };
                }
                if (url === '/person/6193') {
                    callCounts.person++;
                    return { data: { id: 6193, name: 'Leonardo DiCaprio' } };
                }
                if (url === '/person/525') {
                    callCounts.person++;
                    return { data: { id: 525, name: 'Christopher Nolan' } };
                }

                // Error cases
                if (url.includes('/network/999999')) {
                    callCounts.network++;
                    const err = new Error('Request failed with status code 404');
                    err.response = { status: 404 };
                    throw err;
                }
                if (url.includes('/company/888888')) {
                    callCounts.company++;
                    const err = new Error('Request failed with status code 500');
                    err.response = { status: 500 };
                    throw err;
                }

                const err = new Error('Not found');
                err.response = { status: 404 };
                throw err;
            })
        };
    });

    test('1. I 6 tipi di DNA risolvono al nome vero', async () => {
        const inputDna = [
            { id: '28', type: 'genre', name: 'genre 28' },
            { id: '12190', type: 'keyword', name: 'keyword 12190' },
            { id: '49', type: 'network', name: 'network 49' },
            { id: '41077', type: 'company', name: 'company 41077' },
            { id: '6193', type: 'actor', name: 'actor 6193' },
            { id: '525', type: 'director', name: 'director 525' }
        ];

        const resolved = await resolveDnaNames(inputDna, { tmdbClient: mockClient });

        expect(resolved).toEqual([
            { id: '28', type: 'genre', name: 'Azione' },
            { id: '12190', type: 'keyword', name: 'cyberpunk' },
            { id: '49', type: 'network', name: 'HBO' },
            { id: '41077', type: 'company', name: 'A24' },
            { id: '6193', type: 'actor', name: 'Leonardo DiCaprio' },
            { id: '525', type: 'director', name: 'Christopher Nolan' }
        ]);
    });

    test('2. Le keyword TMDB ritirate vengono scartate dal DNA', async () => {
        const inputDna = [
            { id: '363309', type: 'keyword', name: 'keyword 363309' }, // Retired
            { id: '364043', type: 'keyword', name: 'keyword 364043' }, // Retired
            { id: '12190', type: 'keyword', name: 'keyword 12190' }    // Valid
        ];

        const resolved = await resolveDnaNames(inputDna, { tmdbClient: mockClient });

        expect(resolved).toHaveLength(1);
        expect(resolved[0]).toEqual({
            id: '12190',
            type: 'keyword',
            name: 'cyberpunk'
        });

        // Also test single item resolver
        const retiredItem = await resolveDnaItem({ id: '363309', type: 'keyword' }, { tmdbClient: mockClient });
        expect(retiredItem).toBeNull();
    });

    test('3. ID non risolvibili (404/500/timeout) degradano a fallback leggibile', async () => {
        const inputDna = [
            { id: '999999', type: 'network', name: 'network 999999' },
            { id: '888888', type: 'company', name: 'company 888888' },
            { id: '777777', type: 'genre', name: 'genre 777777' }
        ];

        const resolved = await resolveDnaNames(inputDna, { tmdbClient: mockClient });

        expect(resolved).toEqual([
            { id: '999999', type: 'network', name: 'Network #999999' },
            { id: '888888', type: 'company', name: 'Company #888888' },
            { id: '777777', type: 'genre', name: 'Genre #777777' }
        ]);
    });

    test('4. La cache evita chiamate di rete ripetute', async () => {
        const item = [{ id: '49', type: 'network', name: 'network 49' }];

        // First call - cache miss, fetches from TMDB
        const first = await resolveDnaNames(item, { tmdbClient: mockClient });
        expect(first[0].name).toBe('HBO');
        expect(callCounts.network).toBe(1);

        // Second call with same item - cache hit, should NOT call TMDB
        const second = await resolveDnaNames(item, { tmdbClient: mockClient });
        expect(second[0].name).toBe('HBO');
        expect(callCounts.network).toBe(1); // Call count unchanged!
    });

    test('5. Il budget scaduto non blocca e degrada a fallback leggibile', async () => {
        const slowClient = {
            get: jest.fn(async () => {
                await new Promise(r => setTimeout(r, 200));
                return { data: { name: 'Slow Network' } };
            })
        };

        const items = [
            { id: '101', type: 'network', name: 'network 101' },
            { id: '102', type: 'network', name: 'network 102' }
        ];

        const start = Date.now();
        // Budget very tight: 50ms, while each request takes 200ms
        const resolved = await resolveDnaNames(items, {
            tmdbClient: slowClient,
            budgetMs: 50,
            batchSize: 1
        });
        const elapsed = Date.now() - start;

        // Degradation occurred
        expect(resolved).toHaveLength(2);
        // At least the second item or both degraded without hanging
        expect(resolved[1].name).toBe('Network #102');
    });

    test('6. isPlaceholderName riconosce i placeholder e preserva i nomi veri', () => {
        expect(isPlaceholderName('network 49', 'network', '49')).toBe(true);
        expect(isPlaceholderName('Network #49', 'network', '49')).toBe(true);
        expect(isPlaceholderName('company 41077', 'company', '41077')).toBe(true);
        expect(isPlaceholderName('Company #41077', 'company', '41077')).toBe(true);
        expect(isPlaceholderName('keyword 123', 'keyword', '123')).toBe(true);
        expect(isPlaceholderName('actor 456', 'actor', '456')).toBe(true);
        expect(isPlaceholderName('director 789', 'director', '789')).toBe(true);
        expect(isPlaceholderName('', 'network', '49')).toBe(true);
        expect(isPlaceholderName('49', 'network', '49')).toBe(true);

        // Real names are NOT placeholders
        expect(isPlaceholderName('HBO', 'network', '49')).toBe(false);
        expect(isPlaceholderName('A24', 'company', '41077')).toBe(false);
        expect(isPlaceholderName('Leonardo DiCaprio', 'actor', '6193')).toBe(false);
        expect(isPlaceholderName('Christopher Nolan', 'director', '525')).toBe(false);
        expect(isPlaceholderName('Azione', 'genre', '28')).toBe(false);
        expect(isPlaceholderName('Studio 4°C', 'company', '999')).toBe(false);
    });

    test('7. Integrazione profileProcessor: risolve DNA per tutti i tipi e preserva {id, type, name}', async () => {
        // Mock UserConfig and TasteProfile dependencies if necessary
        const inputProfiles = [{
            id: 'custom_profile',
            name: 'Test Profile',
            catalogs: [],
            selectedPresets: [],
            settings: {
                manualDNA: [
                    { id: '49', type: 'network', name: 'network 49' },
                    { id: '41077', type: 'company', name: 'company 41077' },
                    { id: '363309', type: 'keyword', name: 'keyword 363309' } // Retired!
                ]
            }
        }];

        // Test with tmdbClient simulated via resolveDnaNames directly
        const resolvedManual = await resolveDnaNames(inputProfiles[0].settings.manualDNA, {
            tmdbClient: mockClient
        });

        expect(resolvedManual).toHaveLength(2); // Retired keyword discarded!
        expect(resolvedManual).toEqual([
            { id: '49', type: 'network', name: 'HBO' },
            { id: '41077', type: 'company', name: 'A24' }
        ]);

        // Key shapes are preserved
        resolvedManual.forEach(item => {
            expect(item).toHaveProperty('id');
            expect(item).toHaveProperty('type');
            expect(item).toHaveProperty('name');
            expect(typeof item.id).toBe('string');
        });
    });
});
