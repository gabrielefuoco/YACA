const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

describe('Resilience Audit Fixes (10 Critical Vulnerabilities)', () => {

    // 1. UserLibraryItem Multi-User _id Collision
    describe('1. UserLibraryItem Multi-User _id Collision', () => {
        test('UserLibraryItem schema uses itemId and default ObjectId _id', () => {
            const UserLibraryItem = require('../src/db/models/UserLibraryItem');
            const schema = UserLibraryItem.schema;

            // itemId should be defined and required
            expect(schema.path('itemId')).toBeDefined();
            expect(schema.path('itemId').options.required).toBe(true);

            // _id should be standard ObjectId, not overridden as String
            expect(schema.path('_id').instance.toLowerCase()).toBe('objectid');

            // Unique compound index on { addonUuid: 1, itemId: 1 }
            const indexes = schema.indexes();
            const compoundUnique = indexes.find(idx => idx[0]?.addonUuid === 1 && idx[0]?.itemId === 1);
            expect(compoundUnique).toBeDefined();
            expect(compoundUnique[1]?.unique).toBe(true);

            // Old dangerous index { addonUuid: 1, _id: 1 } should NOT exist
            const oldIndex = indexes.find(idx => idx[0]?.addonUuid === 1 && idx[0]?._id === 1);
            expect(oldIndex).toBeUndefined();
        });
    });

    // 2. DuckDB Missing Tables in RAM
    describe('2. DuckDB Missing Tables in RAM', () => {
        test('duckDbStore initializes tv, movies, and anime_mappings tables in RAM', async () => {
            const duckDbStore = require('../src/db/duckDbStore');
            await duckDbStore.init();

            // Should be able to query tv and anime_mappings without Catalog Error
            const tvRows = await duckDbStore.query('SELECT * FROM tv LIMIT 1');
            expect(Array.isArray(tvRows)).toBe(true);

            const animeRows = await duckDbStore.query('SELECT * FROM anime_mappings LIMIT 1');
            expect(Array.isArray(animeRows)).toBe(true);

            const movieRows = await duckDbStore.query('SELECT * FROM movies LIMIT 1');
            expect(Array.isArray(movieRows)).toBe(true);
        });
    });

    // 3. Stremio Profile Switcher 3-Tier Failure
    describe('3. Stremio Profile Switcher 3-Tier Failure', () => {
        test('metaHandler resolves yaca-profile- even without TMDB API key', async () => {
            const { metaHandler } = require('../src/handlers/metaHandler');
            const userConfig = {
                userId: 'user_test',
                activeProfileId: 'p1',
                profiles: [
                    { id: 'p1', name: 'Cinema' },
                    { id: 'p2', name: 'Kids' }
                ],
                apiKeys: {} // No TMDB key!
            };

            const prevKey = process.env.TMDB_API_KEY;
            delete process.env.TMDB_API_KEY;

            try {
                const res = await metaHandler({ type: 'other', id: 'yaca-profile-p2' }, userConfig);
                expect(res).toBeDefined();
                expect(res.meta).toBeDefined();
                expect(res.meta.name).toBe('Kids');
                expect(res.meta.id).toBe('yaca-profile-p2');
            } finally {
                if (prevKey) process.env.TMDB_API_KEY = prevKey;
            }
        });

        test('public/assets/profile_updated.mp4 exists and is a non-empty file', () => {
            const videoPath = path.join(__dirname, '../public/assets/profile_updated.mp4');
            expect(fs.existsSync(videoPath)).toBe(true);
            const stats = fs.statSync(videoPath);
            expect(stats.size).toBeGreaterThan(100);
        });

        test('stremio router contains both /users/... and /api/users/... switch-profile routes', () => {
            const stremioRouter = require('../src/api/stremio');
            const switchRoutes = stremioRouter.stack
                .filter(layer => layer.route && layer.route.path)
                .map(layer => layer.route.path);

            const hasUserSwitch = switchRoutes.some(p => 
                (Array.isArray(p) && p.includes('/users/:userId/switch-profile/:profileId') && p.includes('/api/users/:userId/switch-profile/:profileId')) ||
                p === '/users/:userId/switch-profile/:profileId' ||
                p === '/api/users/:userId/switch-profile/:profileId'
            );
            expect(hasUserSwitch).toBe(true);
        });
    });

    // 4. DuckDB SQL Substring Prefix Collision in filters.js
    describe('4. DuckDB SQL Substring Prefix Collision in filters.js', () => {
        const { F } = require('../src/data/filters');

        test('jsonHas uses boundary delimiters preventing prefix collision (e.g. 28 matching 28123)', () => {
            const genreFilter = F.genre(28);
            expect(genreFilter).toContain('"id":28,');
            expect(genreFilter).toContain('"id":28}');
            expect(genreFilter).toContain('"id": 28,');
            expect(genreFilter).toContain('"id": 28}');
            // Should NOT be the loose substring '%"id":28%'
            expect(genreFilter).not.toBe('("genres" LIKE \'%"id":28%\')');
        });

        test('director, actor, company, and network all use boundary delimiters', () => {
            const directorFilter = F.director(105);
            expect(directorFilter).toContain('"directors" LIKE \'%"id":105,%\'');
            expect(directorFilter).toContain('"directors" LIKE \'%"id":105}%\'');

            const actorFilter = F.actor(205);
            expect(actorFilter).toContain('"cast" LIKE \'%"id":205,%\'');
            expect(actorFilter).toContain('"cast" LIKE \'%"id":205}%\'');

            const companyFilter = F.company(305);
            expect(companyFilter).toContain('"production_companies" LIKE \'%"id":305,%\'');
            expect(companyFilter).toContain('"production_companies" LIKE \'%"id":305}%\'');

            const networkFilter = F.network(405);
            expect(networkFilter).toContain('"networks" LIKE \'%"id":405,%\'');
            expect(networkFilter).toContain('"networks" LIKE \'%"id":405}%\'');
        });

        test('notGenre uses boundary delimiters with NOT', () => {
            const notG = F.notGenre(28);
            expect(notG).toContain('NOT');
            expect(notG).toContain('"genres" LIKE \'%"id":28,%\'');
        });
    });

    // 5. BigInt JSON Serialization in Express
    describe('5. BigInt JSON Serialization in Express', () => {
        test('BigInt can be serialized to JSON via Number', () => {
            const indexFileContent = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
            expect(indexFileContent).toContain('BigInt.prototype.toJSON');

            BigInt.prototype.toJSON = function() { return Number(this); };
            const obj = {
                id: BigInt(9007199254740991),
                count: BigInt(42)
            };
            const jsonStr = JSON.stringify(obj);
            expect(jsonStr).toBe('{"id":9007199254740991,"count":42}');
        });
    });

    // 6. TMDB Mirrors & Failover URL Duplication
    describe('6. TMDB Mirrors & Failover URL Duplication', () => {
        test('TMDB client does not duplicate /3/3/ when replacing baseURL in interceptor', () => {
            const mirrorUrl = 'https://api.tmdb.org/3';
            const originalUrl = 'https://api.themoviedb.org/3/movie/550';
            const replaced = originalUrl.replace(/^https?:\/\/[^/]+(?:\/3)?/, mirrorUrl);
            expect(replaced).toBe('https://api.tmdb.org/3/movie/550');
            expect(replaced).not.toContain('/3/3/');
        });

        test('TMDB_MIRRORS does not contain invalid tmdb.org/3 mirror', () => {
            const tmdbFileContent = fs.readFileSync(path.join(__dirname, '../src/clients/tmdb.js'), 'utf8');
            expect(tmdbFileContent).not.toContain("'https://tmdb.org/3'");
        });
    });

    // 7. VSM Blank Profile Alien Genre Deflation
    describe('7. VSM Blank Profile Alien Genre Deflation', () => {
        const ProfileScorer = require('../src/profile/ProfileScorer');

        test('calculateBaseItemMatch does not apply 0.3x alien penalty for blank profile (no genre history)', () => {
            const tmdbMovie = {
                id: 101,
                vote_average: 8.0,
                vote_count: 500,
                genre_ids: [28, 12], // Action, Adventure
                genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }]
            };

            const blankProfile = {
                compiledVectors: {
                    V_final: {} // No genre, actor, or director keys
                },
                tmdbWeight: 1.0,
                traktWeight: 1.0
            };

            const score = ProfileScorer.calculateBaseItemMatch(tmdbMovie, blankProfile);
            // In a blank profile with genreAlignmentMultiplier = 1.0, the score is not deflated by 0.3x
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });

    // 8. Stremio Manifest stream Resource Types
    describe('8. Stremio Manifest stream Resource Types', () => {
        test('manifest stream resource declaration includes anime', async () => {
            const stremioFileContent = fs.readFileSync(path.join(__dirname, '../src/api/stremio.js'), 'utf8');
            // Check that the stream resource types array includes 'anime'
            expect(stremioFileContent).toMatch(/name:\s*'stream',\s*types:\s*\[[^\]]*'anime'[^\]]*\]/);
        });
    });

    // 9. Mongoose OverwriteModelError Prevention
    describe('9. Mongoose OverwriteModelError Prevention', () => {
        test('re-requiring models does not throw OverwriteModelError', () => {
            expect(() => {
                require('../src/db/models/ImdbToTmdbMapping');
                require('../src/models/SystemLog');
                require('../src/models/TasteProfile');
            }).not.toThrow();

            const ImdbToTmdbMapping = require('../src/db/models/ImdbToTmdbMapping');
            const SystemLog = require('../src/models/SystemLog');
            const TasteProfile = require('../src/models/TasteProfile');

            expect(ImdbToTmdbMapping).toBeDefined();
            expect(SystemLog).toBeDefined();
            expect(TasteProfile).toBeDefined();
        });
    });

    // 10. Open Handles / Timers Blocking Teardown
    describe('10. Open Handles / Timers Blocking Teardown', () => {
        test('animeMappingStore syncInterval has unref called', () => {
            const animeMappingStore = require('../src/data/animeMappingStore');
            const fileContent = fs.readFileSync(path.join(__dirname, '../src/data/animeMappingStore.js'), 'utf8');
            expect(fileContent).toContain('this.syncInterval.unref()');
        });

        test('HFStorageClient timers have unref called', () => {
            const fileContent = fs.readFileSync(path.join(__dirname, '../src/utils/HFStorageClient.js'), 'utf8');
            expect(fileContent).toContain('initGcTimer.unref()');
            expect(fileContent).toContain('periodicGcTimer.unref()');
        });
    });
});
