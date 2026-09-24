const ProfileScorer = require('../src/profile/ProfileScorer');
const {
    RETIRED_TMDB_KEYWORD_IDS,
    filterRetiredTmdbKeywords,
    sanitizeDnaVector
} = require('../src/data/keywordIds');
const { extractStaticDNAFromQueries, extractActiveDNAFromTmdbData } = require('../src/utils/dnaExtractor');
const { getProfileDnaFilters } = require('../src/utils/helpers');
const { computeTopKeywords } = require('../src/engines/hybrid/scoringEngine');
const { getPresets } = require('../src/data/presets');

const RETIRED_IDS = [363309, 364043, 210086, 208035];

function sumVector(vector) {
    return Object.values(vector).reduce((sum, value) => sum + Number(value), 0);
}

describe('Ticket 24: keyword TMDB ritirate', () => {
    test('i quattro ID irrisolibili sono centralizzati e rimossi dai metadata', () => {
        expect(RETIRED_TMDB_KEYWORD_IDS).toEqual(RETIRED_IDS);
        const keywords = [
            ...RETIRED_IDS.map(id => ({ id, name: `removed-${id}` })),
            { id: 12190, name: 'cyberpunk' }
        ];
        expect(filterRetiredTmdbKeywords(keywords)).toEqual([
            { id: 12190, name: 'cyberpunk' }
        ]);
    });

    test('sanitizeDnaVector elimina i pesi legacy e rinormalizza gli altri', () => {
        const sanitized = sanitizeDnaVector({
            'g:53': 2.941176470588235,
            'k:363309': 2.941176470588235,
            'k:12190': 5
        });

        expect(sanitized['k:363309']).toBeUndefined();
        expect(sanitized['g:53']).toBeGreaterThan(2.941176470588235);
        expect(sanitized['k:12190']).toBeGreaterThan(5);
        expect(sumVector(sanitized)).toBeCloseTo(100, 6);
    });

    test('estrazione static e attiva non ricrea le keyword ritirate', () => {
        const staticDna = extractStaticDNAFromQueries([
            { with_keywords: RETIRED_IDS.concat(12190).join('|') }
        ]);
        expect(staticDna['k:363309']).toBeUndefined();
        expect(staticDna['k:364043']).toBeUndefined();
        expect(staticDna['k:210086']).toBeUndefined();
        expect(staticDna['k:208035']).toBeUndefined();
        expect(staticDna['k:12190']).toBeDefined();

        const activeDna = extractActiveDNAFromTmdbData({
            keyword_ids: [...RETIRED_IDS, 12190]
        });
        RETIRED_IDS.forEach(id => expect(activeDna[`k:${id}`]).toBeUndefined());
        expect(activeDna['k:12190']).toBeDefined();
    });

    test('ProfileScorer ignora keyword ritirate anche nei vettori legacy', () => {
        expect(ProfileScorer.getVectorScore({ 'k:363309': 10 }, 'k', 363309)).toBe(0);
        expect(ProfileScorer.computeDnaMultiplier(
            { genre_ids: [99], keywords: [{ id: 363309 }] },
            [{ type: 'keyword', id: 363309 }]
        )).toBe(0.1);

        const item = {
            genre_ids: [35],
            keywords: [{ id: 364043 }],
            vote_average: 7,
            vote_count: 1000
        };
        const legacyProfile = {
            compiledVectors: { V_final: { 'g:35': 88.235, 'k:364043': 11.765 } },
            tmdbWeight: 1,
            traktWeight: 1
        };
        const cleanProfile = {
            compiledVectors: { V_final: { 'g:35': 100 } },
            tmdbWeight: 1,
            traktWeight: 1
        };

        expect(ProfileScorer.calculateBaseItemMatch(item, legacyProfile))
            .toBeCloseTo(ProfileScorer.calculateBaseItemMatch(item, cleanProfile), 8);
        expect(ProfileScorer.calculateLightScore(item, legacyProfile))
            .toBeCloseTo(ProfileScorer.calculateLightScore(item, cleanProfile), 8);
    });

    test('query e selettori DNA non usano più gli ID ritirati', () => {
        const profile = {
            compiledVectors: { V_final: { 'k:12190': 90, 'k:210086': 10 } }
        };
        expect(computeTopKeywords(profile, 2)).toEqual(['12190']);

        const filters = getProfileDnaFilters({
            profiles: [{
                id: 'cinefilo',
                settings: {
                    manualDNA: [
                        { type: 'keyword', id: 363309 },
                        { type: 'keyword', id: 12190 }
                    ],
                    suggestedDNA: [{ type: 'keyword', id: 208035 }]
                }
            }]
        }, 'cinefilo');
        expect(filters).toEqual([{ type: 'keyword', id: 12190 }]);

        const presetKeywordStrings = getPresets()
            .flatMap(preset => preset.queries || [])
            .map(query => query.with_keywords)
            .filter(Boolean)
            .join('|');
        RETIRED_IDS.forEach(id => expect(presetKeywordStrings).not.toContain(String(id)));
    });
});
