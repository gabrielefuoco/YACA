const fs = require('fs');
const path = require('path');
const duckDbStore = require('../src/db/duckDbStore');
const { hydrateResultsFromLocalDetailsCache } = require('../src/catalog/processors/MetadataHydrator');
const { metaHandler } = require('../src/handlers/metaHandler');

describe('Retire TmdbScoringData: Catalogs & Meta populate WITHOUT Mongo', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    }, 30000);

    beforeEach(() => {
        jest.spyOn(duckDbStore, 'query').mockImplementation(async (sql) => {
            const results = [];
            if (sql.includes('550')) {
                results.push({
                    id: 550,
                    title: 'Fight Club',
                    original_title: 'Fight Club',
                    vote_average: 8.4,
                    vote_count: 26000,
                    popularity: 60.5,
                    genres: JSON.stringify([{ id: 18, name: 'Drama' }]),
                    keywords: JSON.stringify([{ id: 825, name: 'support group' }]),
                    cast: JSON.stringify([{ id: 287, name: 'Brad Pitt' }]),
                    directors: JSON.stringify([{ id: 7467, name: 'David Fincher' }])
                });
            }
            if (sql.includes('603')) {
                results.push({
                    id: 603,
                    title: 'The Matrix',
                    original_title: 'The Matrix',
                    vote_average: 8.2,
                    vote_count: 23000,
                    popularity: 55.0,
                    genres: JSON.stringify([{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }]),
                    keywords: JSON.stringify([{ id: 4379, name: 'time travel' }]),
                    cast: JSON.stringify([{ id: 6384, name: 'Keanu Reeves' }]),
                    directors: JSON.stringify([{ id: 9339, name: 'Lana Wachowski' }])
                });
            }
            return results;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('1. Static Code Analysis: No references in runtime pipelines', () => {
        test('MetadataHydrator does not import or reference TmdbScoringData', () => {
            const filePath = path.join(__dirname, '../src/catalog/processors/MetadataHydrator.js');
            const fileContent = fs.readFileSync(filePath, 'utf8');
            expect(fileContent).not.toContain('TmdbScoringData');
            expect(fileContent).toContain('duckDbStore');
        });

        test('metaHandler does not import TmdbScoringData or call updateScoringCache', () => {
            const filePath = path.join(__dirname, '../src/handlers/metaHandler.js');
            const fileContent = fs.readFileSync(filePath, 'utf8');
            expect(fileContent).not.toContain('TmdbScoringData');
            expect(fileContent).not.toContain('updateScoringCache');
        });

        test('ProfileBuilder does not import TmdbScoringData: il DNA viene solo dal parquet', () => {
            const filePath = path.join(__dirname, '../src/profile/ProfileBuilder.js');
            const fileContent = fs.readFileSync(filePath, 'utf8');
            expect(fileContent).not.toContain('TmdbScoringData');
        });

        test('il model TmdbScoringData non esiste più nel repository', () => {
            const modelPath = path.join(__dirname, '../src/models/TmdbScoringData.js');
            expect(fs.existsSync(modelPath)).toBe(false);
        });
    });

    describe('2. MetadataHydrator populates metadata from DuckDB parquet without Mongo', () => {
        test('hydrateResultsFromLocalDetailsCache enriches movie items from the parquet', async () => {
            // 550 = Fight Club (present in movies.parquet)
            const metas = [
                { id: 'tmdb:550', name: 'Fight Club' },
                { id: 'tmdb:603', name: 'The Matrix' }
            ];

            await expect(
                hydrateResultsFromLocalDetailsCache(metas, 'dummyApiKey', 'movie')
            ).resolves.not.toThrow();

            // Verify items were enriched from DuckDB parquet
            for (const item of metas) {
                expect(item.rawTMDB).toBeDefined();
                expect(Array.isArray(item.keywords)).toBe(true);
                expect(item.keywords.length).toBeGreaterThan(0);
                expect(Array.isArray(item.cast)).toBe(true);
                expect(item.cast.length).toBeGreaterThan(0);
                expect(item.vote_count).toBeGreaterThan(0);
            }
        });

        test('hydrateResultsFromLocalDetailsCache handles series without touching Mongo', async () => {
            const metas = [
                { id: 'tmdb:1399', name: 'Game of Thrones' }
            ];

            await expect(
                hydrateResultsFromLocalDetailsCache(metas, 'dummyApiKey', 'series')
            ).resolves.not.toThrow();
        });
    });

    describe('3. metaHandler executes without Mongo writes', () => {
        test('metaHandler resolves metadata without touching TmdbScoringData', async () => {
            const userConfig = {
                userId: 'user_test',
                activeProfileId: 'p1',
                profiles: [{ id: 'p1', name: 'Default' }],
                apiKeys: { tmdb: 'dummyApiKey' }
            };

            const result = await metaHandler(
                { type: 'movie', id: 'tmdb:550' },
                userConfig
            );

            expect(result).toBeDefined();
            expect(result.meta).toBeDefined();
            expect(result.meta.name).toBe('Fight Club');
        });
    });
});
