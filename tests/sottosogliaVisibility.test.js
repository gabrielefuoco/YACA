const { getPresets } = require('../src/data/presets');
const { buildCatalogQuery } = require('../src/db/queryBuilder');
const duckDbStore = require('../src/db/duckDbStore');
const { buildPresetFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { F } = require('../src/data/filters');
const {
    passesQualityFloor,
    isQualityFloorItemRecent
} = require('../src/engines/hybrid/catalogStrategies');

describe('Ticket 35: Pavimenti di visibilità dei sottosoglia', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    }, 30000);

    const now = new Date();
    const tenDaysAgoStr = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const threeMonthsAgoStr = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const twoYearsAgoStr = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    describe('1. passesQualityFloor (Hero Pool / True Blend / Seed Network)', () => {
        test('Un titolo vecchio (< 300 voti) NON deve passare il quality floor', () => {
            const oldMovieUnderFloor = {
                id: 999001,
                title: 'Old Movie Low Votes',
                release_date: twoYearsAgoStr,
                vote_count: 120,
                vote_average: 7.5
            };
            expect(isQualityFloorItemRecent(oldMovieUnderFloor, 'movie')).toBe(false);
            expect(passesQualityFloor(oldMovieUnderFloor, 'movie', false)).toBe(false);

            const oldTvUnderFloor = {
                id: 999002,
                name: 'Old TV Low Votes',
                first_air_date: twoYearsAgoStr,
                vote_count: 180,
                vote_average: 8.0
            };
            expect(isQualityFloorItemRecent(oldTvUnderFloor, 'series')).toBe(false);
            expect(passesQualityFloor(oldTvUnderFloor, 'series', false)).toBe(false);
        });

        test('Un titolo vecchio consolidato (>= 300 voti, >= 6.5) passa il quality floor', () => {
            const oldClassic = {
                id: 999003,
                title: 'Old Classic Masterpiece',
                release_date: twoYearsAgoStr,
                vote_count: 450,
                vote_average: 7.8
            };
            expect(passesQualityFloor(oldClassic, 'movie', false)).toBe(true);
        });

        test('Un titolo recente con pochi voti (< 50) non passa l\'Hero Pool (garanzia qualità)', () => {
            const freshLowVotes = {
                id: 999004,
                title: 'Fresh Movie Very Few Votes',
                release_date: tenDaysAgoStr,
                vote_count: 15,
                vote_average: 8.0
            };
            expect(isQualityFloorItemRecent(freshLowVotes, 'movie')).toBe(true);
            expect(passesQualityFloor(freshLowVotes, 'movie', false)).toBe(false);
        });

        test('Un titolo recente con qualità (>= 50 voti, >= 6.5) PASSA il quality floor (discovery permissiva)', () => {
            const freshHighQuality = {
                id: 999005,
                title: 'Fresh Movie High Quality',
                release_date: tenDaysAgoStr,
                vote_count: 85,
                vote_average: 7.4
            };
            expect(isQualityFloorItemRecent(freshHighQuality, 'movie')).toBe(true);
            expect(passesQualityFloor(freshHighQuality, 'movie', false)).toBe(true);
        });

        test('Invecchiamento: quando il titolo recente invecchia oltre la finestra, 85 voti non bastano più ed esce dall\'Hero Pool', () => {
            const agedMovie = {
                id: 999006,
                title: 'Aged Movie Once Fresh',
                release_date: threeMonthsAgoStr, // 90 giorni fa (> 60 giorni finestra film)
                vote_count: 85,
                vote_average: 7.4
            };
            expect(isQualityFloorItemRecent(agedMovie, 'movie')).toBe(false);
            expect(passesQualityFloor(agedMovie, 'movie', false)).toBe(false);
        });
    });

    describe('2. Vetrine Novità (preset_new_movies, preset_new_series)', () => {
        const presets = getPresets();
        const newMoviesPreset = presets.find(p => p.id === 'preset_new_movies');
        const newSeriesPreset = presets.find(p => p.id === 'preset_new_series');

        test('preset_new_movies non ha vote_count.gte e usa la finestra temporale', () => {
            expect(newMoviesPreset).toBeDefined();
            const query = newMoviesPreset.queries[0];
            expect(query['vote_count.gte']).toBeUndefined();
            expect(query['primary_release_date.gte']).toBeDefined();
            expect(query['primary_release_date.lte']).toBeDefined();

            // Nella clausola where non deve esserci vote_count >= ...
            const hasVoteFilter = newMoviesPreset.where.some(w => typeof w === 'string' && w.includes('"vote_count" >='));
            expect(hasVoteFilter).toBe(false);

            // Ma deve contenere il filtro sulla data di uscita
            const hasDateFilter = newMoviesPreset.where.some(w => typeof w === 'string' && w.includes('"release_date" >='));
            expect(hasDateFilter).toBe(true);
        });

        test('preset_new_series non ha vote_count.gte e usa la finestra temporale', () => {
            expect(newSeriesPreset).toBeDefined();
            const query = newSeriesPreset.queries[0];
            expect(query['vote_count.gte']).toBeUndefined();
            expect(query['first_air_date.gte']).toBeDefined();
            expect(query['first_air_date.lte']).toBeDefined();

            const hasVoteFilter = newSeriesPreset.where.some(w => typeof w === 'string' && w.includes('"vote_count" >='));
            expect(hasVoteFilter).toBe(false);

            const hasDateFilter = newSeriesPreset.where.some(w => typeof w === 'string' && w.includes('"first_air_date" >='));
            expect(hasDateFilter).toBe(true);
        });
    });

    describe('3. I 4 Preset Anime Tematici (shonen, shoujo, mecha, isekai)', () => {
        const presets = getPresets();
        const animeThemeIds = ['preset_anime_shonen', 'preset_anime_shoujo', 'preset_anime_mecha', 'preset_anime_isekai'];

        test.each(animeThemeIds)('%s definisce vote_count.gte 50 con permissive_recent', (id) => {
            const preset = presets.find(p => p.id === id);
            expect(preset).toBeDefined();
            const q = preset.queries[0];
            expect(q['vote_count.gte']).toBe(50);
            expect(q.permissive_recent).toBe(true);
            // recent_since è deliberatamente assente: il provider ricalcola
            // la stessa soglia (-6 mesi) e la definizione resta stabile nel tempo.
            expect(q.recent_since).toBeUndefined();

            // La clausola where deve usare il pavimento permissivo OR
            const permissiveWhere = preset.where.find(w => typeof w === 'string' && w.includes('"vote_count" >= 50 OR'));
            expect(permissiveWhere).toBeDefined();
            expect(permissiveWhere).toContain('"first_air_date" >=');
        });

        test('Logica di valutazione: sottosoglia recente sì, sottosoglia vecchio no', async () => {
            // Eseguiamo una query simulata su DuckDB per verificare la logica booleana
            const testSql = `
                SELECT 
                    CASE 
                        -- Titolo recente sottosoglia (5 voti, uscito 10 giorni fa)
                        WHEN (5 >= 50 OR ('${tenDaysAgoStr}' IS NOT NULL AND '${tenDaysAgoStr}' >= '${threeMonthsAgoStr}')) 
                        THEN true ELSE false 
                    END as recent_sottosoglia,
                    CASE 
                        -- Titolo vecchio sottosoglia (5 voti, uscito 2 anni fa)
                        WHEN (5 >= 50 OR ('${twoYearsAgoStr}' IS NOT NULL AND '${twoYearsAgoStr}' >= '${threeMonthsAgoStr}')) 
                        THEN true ELSE false 
                    END as old_sottosoglia,
                    CASE 
                        -- Titolo vecchio consolidato (200 voti, uscito 2 anni fa)
                        WHEN (200 >= 50 OR ('${twoYearsAgoStr}' IS NOT NULL AND '${twoYearsAgoStr}' >= '${threeMonthsAgoStr}')) 
                        THEN true ELSE false 
                    END as old_classic
            `;
            const result = await duckDbStore.query(testSql);
            expect(result[0].recent_sottosoglia).toBe(true); // RECENTE SOTTOSOGLIA: AMMESSO
            expect(result[0].old_sottosoglia).toBe(false);   // VECCHIO SOTTOSOGLIA: BLOCCATO
            expect(result[0].old_classic).toBe(true);       // VECCHIO CLASSICO: AMMESSO
        });
    });

    describe('3b. Equivalenza: recent_since esplicito vs ricalcolato dal provider', () => {
        const presets = getPresets();
        const animeThemeIds = ['preset_anime_shonen', 'preset_anime_shoujo', 'preset_anime_mecha', 'preset_anime_isekai'];

        // Stessa formula di `src/data/presets.js` (identica a quella del provider).
        const dSeries = new Date();
        dSeries.setMonth(dSeries.getMonth() - 6);
        const sixMonthsAgoStr = dSeries.toISOString().split('T')[0];

        test.each(animeThemeIds)('%s: senza recent_since la where è IDENTICA a quella con recent_since', (id) => {
            const preset = presets.find(p => p.id === id);
            expect(preset).toBeDefined();
            const q = preset.queries[0];

            // Con data esplicita nella definizione (come era prima)
            const conDataEsplicita = buildPresetFromFilters(
                { ...q, recent_since: sixMonthsAgoStr },
                preset.type
            );
            // Senza: il provider ricalcola la soglia da solo (DuckDbProvider.js:72-84)
            const conDataRicalcolata = buildPresetFromFilters({ ...q }, preset.type);

            // Le due where devono coincidere stringa per stringa: togliere
            // recent_since non deve cambiare la query eseguita.
            expect(conDataRicalcolata.where).toEqual(conDataEsplicita.where);
            // E devono coincidere anche con la where già compilata nel preset.
            expect(conDataRicalcolata.where).toEqual(preset.where);
        });

        test('Il pavimento permissivo resta ancorato alla finestra di -6 mesi', () => {
            const preset = presets.find(p => p.id === 'preset_anime_shonen');
            const where = buildPresetFromFilters({ ...preset.queries[0] }, preset.type).where
                .find(w => typeof w === 'string' && w.includes('"vote_count" >= 50 OR'));
            expect(where).toBe(
                `("vote_count" >= 50 OR ("first_air_date" IS NOT NULL AND "first_air_date" >= '${sixMonthsAgoStr}'))`
            );
        });
    });

    describe('4. Sottosoglia vecchio escluso dai cataloghi non ammessi', () => {
        const presets = getPresets();

        test('Cataloghi di libreria/storici (es. preset_anime_classic, preset_top_rated_movies) mantengono pavimenti rigidi', () => {
            const classicAnime = presets.find(p => p.id === 'preset_anime_classic');
            const voteClause = classicAnime.where.find(w => typeof w === 'string' && w.includes('"vote_count"'));
            expect(voteClause).toBe('"vote_count" >= 50');
            expect(voteClause.includes('OR')).toBe(false);

            const topRated = presets.find(p => p.id === 'preset_top_rated_movies');
            expect(topRated.where.some(w => typeof w === 'string' && w.includes('"vote_count" >= 1000'))).toBe(true);
        });
    });

    describe('5. Validità SQL ed esecuzione DuckDB per tutti i preset modificati', () => {
        const presets = getPresets();
        const modifiedIds = [
            'preset_new_movies',
            'preset_new_series',
            'preset_anime_shonen',
            'preset_anime_shoujo',
            'preset_anime_mecha',
            'preset_anime_isekai'
        ];

        test.each(modifiedIds)('%s genera SQL valido ed eseguibile in DuckDB', async (presetId) => {
            const preset = presets.find(p => p.id === presetId);
            expect(preset).toBeDefined();

            const sql = await buildCatalogQuery({
                type: preset.type || 'series',
                where: preset.where,
                orderBy: preset.orderBy
            }, 0, 10);

            expect(sql).toContain('SELECT * FROM');
            const rows = await duckDbStore.query(sql);
            expect(Array.isArray(rows)).toBe(true);
        });
    });
});
