const fs = require('fs');
const path = require('path');
const duckDbStore = require('../src/db/duckDbStore');
const TmdbScoringData = require('../src/models/TmdbScoringData');
const { hydrateResultsFromLocalDetailsCache } = require('../src/catalog/processors/MetadataHydrator');
const { metaHandler } = require('../src/handlers/metaHandler');

describe('Retire TmdbScoringData: Catalogs & Meta populate WITHOUT Mongo', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    }, 30000);

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
    });

    describe('2. MetadataHydrator populates metadata from DuckDB parquet without Mongo', () => {
        test('hydrateResultsFromLocalDetailsCache enriches movie items even if Mongo throws', async () => {
            // Mock Mongo model methods to throw if ever invoked
            const findSpy = jest.spyOn(TmdbScoringData, 'find').mockImplementation(() => {
                throw new Error('FAIL: TmdbScoringData.find must not be called!');
            });

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

            // Assert Mongo was NEVER touched
            expect(findSpy).not.toHaveBeenCalled();
            findSpy.mockRestore();
        });

        test('hydrateResultsFromLocalDetailsCache handles series without querying Mongo', async () => {
            const findSpy = jest.spyOn(TmdbScoringData, 'find').mockImplementation(() => {
                throw new Error('FAIL: TmdbScoringData.find must not be called!');
            });

            const metas = [
                { id: 'tmdb:1399', name: 'Game of Thrones' }
            ];

            await expect(
                hydrateResultsFromLocalDetailsCache(metas, 'dummyApiKey', 'series')
            ).resolves.not.toThrow();

            // Even on cache miss / empty tv table, Mongo must never be queried
            expect(findSpy).not.toHaveBeenCalled();
            findSpy.mockRestore();
        });
    });

    describe('3. metaHandler executes without Mongo writes', () => {
        test('metaHandler resolves metadata without updating TmdbScoringData', async () => {
            const updateOneSpy = jest.spyOn(TmdbScoringData, 'updateOne').mockImplementation(() => {
                throw new Error('FAIL: TmdbScoringData.updateOne must not be called!');
            });

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
            expect(updateOneSpy).not.toHaveBeenCalled();

            updateOneSpy.mockRestore();
        });
    });
});
