/**
 * tests/animeModule.test.js
 *
 * Test di unità per il modulo src/anime/ (Ticket 32).
 * Verifica le decisioni 1, 2, 3, 5, 6, 7:
 *  - Porta unica del modulo
 *  - Lettura da artefatto atomico invece del download Anibridge/Fribb
 *  - Nessun require a services/
 *  - Tre stati dello store: 'si' | 'non-lo-so' | 'no'
 *  - Exclude vince su certify con warning
 *  - L'euristica decide solo su 'non-lo-so' ed è fermata da 'no'
 *  - Candidati certify visibili nel log aggregato al refresh
 *  - Meccanismo snapshotDaArtefatto (keepLastKnown e emptyAndRetry)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const anime = require('../src/anime');
const { snapshotDaArtefatto } = require('../src/infra/snapshotDaArtefatto');

describe('Modulo Anime (Ticket 32)', () => {
    describe('Porta unica ed esposizione verbi', () => {
        test('la porta espone tutti i verbi attesi per identità, policy, mapping e airing', () => {
            expect(typeof anime.isAnimeContent).toBe('function');
            expect(typeof anime.isItemAnime).toBe('function');
            expect(typeof anime.isAnimeTmdbId).toBe('function');
            expect(typeof anime.statoAnime).toBe('function');
            expect(typeof anime.normalizeAnimeMarker).toBe('function');
            expect(typeof anime.normalizeTipoAnime).toBe('function');
            expect(typeof anime.resolveAnimePolicy).toBe('function');
            expect(typeof anime.getEffectiveTypeSelectors).toBe('function');
            expect(typeof anime.computeAnimeScoreMultiplier).toBe('function');
            expect(typeof anime.getMappingSnapshot).toBe('function');
            expect(typeof anime.getAiringSnapshot).toBe('function');
            expect(typeof anime.resolveKitsu).toBe('function');
            expect(typeof anime.resolveKitsuMovie).toBe('function');
            expect(typeof anime.resolveTmdbFromKitsu).toBe('function');
            expect(typeof anime.resolveKitsuDaTmdbId).toBe('function');
            expect(anime.ANIME_POLICY_MODES).toBeDefined();
            expect(anime.MOTIVI_RESOLVE_KITSU).toBeDefined();
        });
    });

    describe('I tre stati: si | non-lo-so | no (Decisione 6)', () => {
        beforeEach(() => {
            anime.animeMappingStore.loadOverrides({
                version: 1,
                certify: [{ tmdbId: 1001, title: 'Certificato' }, { tmdbId: 2002, title: 'Conflitto' }],
                exclude: [{ tmdbId: 3003, title: 'Escluso' }, { tmdbId: 2002, title: 'Conflitto' }]
            });
        });

        test('restituisce "si" per un id certificato', () => {
            expect(anime.statoAnime(1001)).toBe('si');
            expect(anime.isAnimeTmdbId(1001)).toBe(true);
        });

        test('restituisce "no" per un id in exclude e blocca isAnimeTmdbId', () => {
            expect(anime.statoAnime(3003)).toBe('no');
            expect(anime.isAnimeTmdbId(3003)).toBe(false);
        });

        test('exclude vince quando un id è sia in certify/indici che in exclude, ed emette warning', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            expect(anime.statoAnime(2002)).toBe('no');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('exclude vince')
            );
            expect(anime.isAnimeTmdbId(2002)).toBe(false);
            warnSpy.mockRestore();
        });

        test('restituisce "non-lo-so" per un id assente dagli indici', () => {
            expect(anime.statoAnime(999999)).toBe('non-lo-so');
            expect(anime.isAnimeTmdbId(999999)).toBe(false);
        });

        test('isAnimeContent valuta euristica SOLO su non-lo-so; no ferma l\'euristica', () => {
            // Caso A: id escluso ('no') -> anche se ha genere 16 e lingua 'ja', deve dare false!
            const resNo = anime.isAnimeContent({
                tmdbId: 3003,
                genreIds: [16],
                originalLanguage: 'ja'
            });
            expect(resNo).toBe(false);

            // Caso B: id assente ('non-lo-so') con genere 16 e lingua 'ja' -> euristica accetta!
            const resNonLoSo = anime.isAnimeContent({
                tmdbId: 88888,
                title: 'Nuovo Anime JA',
                genreIds: [16],
                originalLanguage: 'ja'
            });
            expect(resNonLoSo).toBe(true);
        });
    });

    describe('Visibilità verdetto euristica (Decisione 7)', () => {
        test('quando l\'euristica dice sì su un non-lo-so, lo registra per il log aggregato al refresh', () => {
            anime.resetCandidatiCertifyForTests();
            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            anime.isAnimeContent({
                tmdbId: 77701,
                title: 'Candidato 1',
                genreIds: [16],
                originalLanguage: 'ja'
            });

            anime.isAnimeContent({
                tmdbId: 77702,
                title: 'Candidato 2',
                genreIds: [16],
                keywords: [{ name: 'anime' }]
            });

            const candidati = anime.getCandidatiCertify();
            expect(candidati.length).toBe(2);
            expect(candidati.map(c => c.id)).toEqual(['77701', '77702']);

            const flushed = anime.flusheLogCandidatiCertify();
            expect(flushed.length).toBe(2);
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Verdetto euristica su \'non-lo-so\': 2 candidati per certify')
            );

            // Il buffer viene svuotato dopo il flush
            expect(anime.getCandidatiCertify().length).toBe(0);
            logSpy.mockRestore();
        });
    });

    describe('Lettura da artefatto atomico (Decisione 2 e 3)', () => {
        let tmpDir;
        let artifactPath;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-art-'));
            artifactPath = path.join(tmpDir, 'anime_mapping.json');
            process.env.ANIME_MAPPING_PATH = artifactPath;
        });

        afterEach(() => {
            delete process.env.ANIME_MAPPING_PATH;
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
        });

        test('applica correttamente i dati dall\'artefatto JSON', async () => {
            const artifactPayload = {
                schemaVersion: 1,
                generatedAt: '2026-10-17T12:00:00Z',
                movie: [5001, 5002],
                tv: [6001, 6002],
                certify: [{ tmdbId: 7001, title: 'Certificato Artefatto' }],
                exclude: [{ tmdbId: 8001, title: 'Escluso Artefatto' }],
                tmdbToKitsuMovie: { '5001': '101' },
                tmdbToKitsu: { '6001': '201' },
                kitsuToTmdb: { '101': '5001', '201': '6001' },
                kitsuToTmdbType: { '101': 'movie', '201': 'tv' }
            };
            fs.writeFileSync(artifactPath, JSON.stringify(artifactPayload), 'utf8');

            await anime.animeMappingStore.sync();

            expect(anime.isAnimeTmdbId(5001, 'movie')).toBe(true);
            expect(anime.isAnimeTmdbId(6001, 'tv')).toBe(true);
            expect(anime.statoAnime(7001)).toBe('si');
            expect(anime.statoAnime(8001)).toBe('no');
            expect(anime.resolveKitsuMovie(5001)).toBe('101');
            expect(anime.resolveTmdbFromKitsu('201')).toBe('6001');
        });

        test('se il file artefatto è assente, emette warning e mantiene l\'ultimo stato noto (keepLastKnown)', async () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Assicuriamoci che il file non esista
            if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);

            await anime.animeMappingStore.sync();

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('File artefatto assente')
            );
            warnSpy.mockRestore();
        });
    });

    describe('Meccanismo snapshotDaArtefatto (Decisione 5)', () => {
        test('keepLastKnown conserva l\'ultimo snapshot valido in caso di errore successivo', async () => {
            let count = 0;
            let deveFallire = false;
            const reader = snapshotDaArtefatto({
                leggi: async () => {
                    count++;
                    if (deveFallire) throw new Error('DB offline');
                    return { data: `valido_${count}` };
                },
                ttlMs: 50,
                suErrore: 'keepLastKnown',
                vuoto: () => ({ data: 'vuoto' })
            });

            const primo = await reader.getSnapshot();
            expect(primo.data).toBe('valido_1');

            // Simula errore dopo scadenza TTL
            await new Promise(r => setTimeout(r, 60));
            deveFallire = true;

            const secondo = await reader.getSnapshot();
            expect(secondo.data).toBe('valido_1'); // conservato lastKnown
            expect(secondo.degraded).toBe(true);
            expect(secondo.lastError).toBe('DB offline');
        });

        test('emptyAndRetry non memorizza l\'errore e riprova alla chiamata successiva', async () => {
            let count = 0;
            let deveFallire = true;
            const reader = snapshotDaArtefatto({
                leggi: async () => {
                    count++;
                    if (deveFallire) throw new Error('File IO error');
                    return { data: `valido_${count}` };
                },
                ttlMs: 5000,
                suErrore: 'emptyAndRetry',
                vuoto: (err) => ({ data: 'vuoto', error: err.message })
            });

            const fallito = await reader.getSnapshot();
            expect(fallito.data).toBe('vuoto');
            expect(fallito.error).toBe('File IO error');
            expect(count).toBe(1);

            // Guarigione immediata senza attendere il TTL
            deveFallire = false;
            const guarito = await reader.getSnapshot();
            expect(guarito.data).toBe('valido_2');
            expect(count).toBe(2);
        });
    });
});
