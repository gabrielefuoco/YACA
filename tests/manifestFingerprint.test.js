const { buildManifestFingerprint } = require('../src/utils/manifestFingerprint');

function makeConfig() {
    return {
        activeProfileId: 'profile-a',
        profiles: [
            {
                id: 'global',
                name: 'Generale',
                catalogs: [],
                raw_ui_state: { selectedPresets: [], catalogOrder: [] },
                settings: {
                    typeSelectors: { film: false, serie: false, anime: null },
                    kidsMode: false
                }
            },
            {
                id: 'profile-a',
                name: 'Profilo A',
                catalogs: [
                    { id: 'movie-one', name: 'Film uno', type: 'movie', isAnime: false },
                    { id: 'series-one', name: 'Serie uno', type: 'series', isAnime: false }
                ],
                raw_ui_state: {
                    selectedPresets: ['yaca_true_blend_movies'],
                    catalogOrder: ['movie-one', 'series-one']
                },
                settings: {
                    typeSelectors: { film: true, serie: true, anime: null },
                    kidsMode: false
                },
                dna: { genres: { drama: 10 } }
            },
            {
                id: 'profile-b',
                name: 'Profilo B',
                catalogs: [{ id: 'anime-one', name: 'Anime uno', type: 'anime', isAnime: true }],
                raw_ui_state: { selectedPresets: [], catalogOrder: ['anime-one'] },
                settings: {
                    typeSelectors: { film: false, serie: false, anime: 'only' },
                    kidsMode: true
                }
            }
        ],
        customCatalogs: [
            { id: 'custom-one', name: 'Custom uno', type: 'movie' }
        ]
    };
}

describe('buildManifestFingerprint', () => {
    it('is stable for identical configurations and independent of object key order', () => {
        const first = makeConfig();
        const second = makeConfig();
        second.profiles[1].settings.typeSelectors = {
            anime: null,
            serie: true,
            film: true
        };

        expect(buildManifestFingerprint(first)).toBe(buildManifestFingerprint(second));
        expect(buildManifestFingerprint(first)).toMatch(/^[a-f0-9]{64}$/);
    });

    it('ignores secrets, versions, DNA, weights, prompts and catalog query filters', () => {
        const base = makeConfig();
        const changed = makeConfig();
        changed.configVersion = 'another-url-version';
        changed.apiKeys = { tmdb: 'new-key', stremio: 'new-auth-key' };
        changed.profiles[1].dna = { genres: { comedy: 99 } };
        changed.profiles[1].settings.weights = { relevance: 999 };
        changed.profiles[1].raw_ui_state.newPrompts = ['un prompt nuovo'];
        changed.profiles[1].catalogs[0].filters = { genres: [99] };
        changed.profiles[1].catalogs[0].queries = [{ with_genres: '18' }];

        expect(buildManifestFingerprint(changed)).toBe(buildManifestFingerprint(base));
    });

    test.each([
        ['catalog selection', config => config.profiles[1].catalogs.push({
            id: 'movie-two', name: 'Film due', type: 'movie'
        })],
        ['catalog ordering', config => { config.profiles[1].catalogs.reverse(); }],
        ['type selectors', config => {
            config.profiles[1].settings.typeSelectors.anime = 'exclude';
        }],
        ['kidsMode', config => { config.profiles[1].settings.kidsMode = true; }],
        ['active profile', config => { config.activeProfileId = 'profile-b'; }],
        ['custom catalogs', config => config.customCatalogs.push({
            id: 'custom-two', name: 'Custom due', type: 'series'
        })]
    ])('changes when the manifest input changes: %s', (_label, mutate) => {
        const base = makeConfig();
        const changed = makeConfig();
        mutate(changed);

        expect(buildManifestFingerprint(changed)).not.toBe(buildManifestFingerprint(base));
    });
});
