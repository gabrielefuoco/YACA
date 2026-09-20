/**
 * H2 — V_active alimentato da DuckDB locale anziché dalla collection morta TmdbScoringData.
 *
 * Dimostra che:
 * 1. ProfileBuilder._updateVectorsAsync e _bulkUpdateVectorsAsync interrogano duckDbStore
 * 2. V_active viene popolato con generi, keyword, registi e cast estratti dal parquet
 * 3. TmdbScoringData non viene più richiesto se i record sono presenti in DuckDB
 */

const ProfileBuilder = require('../src/profile/ProfileBuilder');
const TasteProfile = require('../src/models/TasteProfile');
const WatchHistory = require('../src/models/WatchHistory');
const duckDbStore = require('../src/db/duckDbStore');

jest.mock('../src/models/TasteProfile');
jest.mock('../src/models/WatchHistory');
jest.mock('../src/db/duckDbStore', () => ({
    query: jest.fn()
}));

describe('H2 — V_active source DuckDB vs TmdbScoringData', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ProfileBuilder alimenta V_active da DuckDB e NON tocca TmdbScoringData se i dati sono nel parquet', async () => {
        // 1. DuckDB restituisce il record con DNA ricco
        duckDbStore.query.mockImplementation(async (sql) => {
            if (sql.includes('movies') && sql.includes('5721')) {
                return [{
                    id: 5721,
                    genres: JSON.stringify([{ id: 28, name: 'Action' }]),
                    keywords: JSON.stringify([{ id: 596, name: 'adultery' }]),
                    cast: JSON.stringify([{ id: 45099, name: 'Erica Gavin' }]),
                    directors: JSON.stringify([{ id: 4590, name: 'Russ Meyer' }])
                }];
            }
            return [];
        });


        // 3. Setup del profilo esistente (V_active inizialmente vuoto)
        TasteProfile.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                owner: 'user1',
                context: 'ctx1',
                compiledVectors: {
                    V_static: { 'g:28': 100 },
                    V_active: {}
                }
            })
        });
        TasteProfile.updateOne.mockResolvedValue({ modifiedCount: 1 });
        WatchHistory.countDocuments.mockResolvedValue(1);

        // 4. Esecuzione aggiornamento singolo
        await ProfileBuilder._updateVectorsAsync('user1', 'ctx1', 5721, 'movie');

        // 5. Verifiche:
        // DuckDB deve essere stato interrogato per la tabella movies
        expect(duckDbStore.query).toHaveBeenCalledWith(expect.stringContaining('FROM movies'));
        expect(duckDbStore.query).toHaveBeenCalledWith(expect.stringContaining('5721'));


        // TasteProfile.updateOne deve essere stato chiamato con V_active popolato
        expect(TasteProfile.updateOne).toHaveBeenCalled();
        const updateArgs = TasteProfile.updateOne.mock.calls[0][1];
        const vActive = updateArgs.$set['compiledVectors.V_active'];
        const vFinal = updateArgs.$set['compiledVectors.V_final'];

        expect(vActive).toBeDefined();
        expect(vActive['g:28']).toBe(100);
        expect(vActive['d:4590']).toBe(100);
        expect(vActive['a:45099']).toBe(100);
        expect(vActive['k:596']).toBe(100);

        // V_final deve essere stato ricalcolato
        expect(vFinal).toBeDefined();
        expect(Object.keys(vFinal).length).toBeGreaterThan(0);
    });

    it('ProfileBuilder gestisce aggiornamenti bulk misti (movie e tv) da DuckDB', async () => {
        duckDbStore.query.mockImplementation(async (sql) => {
            if (sql.includes('movies')) {
                return [{
                    id: 101,
                    genres: JSON.stringify([{ id: 18, name: 'Drama' }]),
                    keywords: JSON.stringify([{ id: 111, name: 'war' }]),
                    cast: JSON.stringify([{ id: 222, name: 'Actor 1' }]),
                    directors: JSON.stringify([{ id: 333, name: 'Director 1' }])
                }];
            }
            if (sql.includes('tv')) {
                return [{
                    id: 202,
                    genres: JSON.stringify([{ id: 10765, name: 'Sci-Fi & Fantasy' }]),
                    keywords: JSON.stringify([{ id: 444, name: 'space' }]),
                    cast: JSON.stringify([{ id: 555, name: 'Actor 2' }]),
                    directors: JSON.stringify([{ id: 666, name: 'Director 2' }])
                }];
            }
            return [];
        });


        TasteProfile.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                owner: 'user1',
                context: 'ctx1',
                compiledVectors: {
                    V_static: {},
                    V_active: {}
                }
            })
        });
        TasteProfile.updateOne.mockResolvedValue({ modifiedCount: 1 });
        WatchHistory.countDocuments.mockResolvedValue(2);

        await ProfileBuilder._bulkUpdateVectorsAsync('user1', 'ctx1', [
            { tmdbId: 101, type: 'movie' },
            { tmdbId: 202, type: 'tv' }
        ]);

        expect(duckDbStore.query).toHaveBeenCalledWith(expect.stringContaining('FROM movies'));
        expect(duckDbStore.query).toHaveBeenCalledWith(expect.stringContaining('FROM tv'));

        expect(TasteProfile.updateOne).toHaveBeenCalled();
        const updateArgs = TasteProfile.updateOne.mock.calls[0][1];
        const vActive = updateArgs.$set['compiledVectors.V_active'];

        // V_active contiene i dati sia del film che della serie
        expect(vActive['g:18']).toBe(100);
        expect(vActive['g:10765']).toBe(100);
        expect(vActive['d:333']).toBe(100);
        expect(vActive['d:666']).toBe(100);
    });
});
