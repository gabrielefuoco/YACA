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
    BADGE_CATALOG_VERSION
} = require('../src/handlers/catalogHandler');

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