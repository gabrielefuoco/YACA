const {
    applyKitsuMappingToMeta,
    getKitsuMappingStats,
    resetKitsuMappingStats
} = require('../src/handlers/metaHandler');
const animeMappingStore = require('../src/data/animeMappingStore');

describe('Kitsu Mapping Stats & Resilience', () => {
    beforeEach(() => {
        resetKitsuMappingStats();
        jest.restoreAllMocks();
    });

    afterEach(() => {
        resetKitsuMappingStats();
        jest.restoreAllMocks();
    });

    test('(a) Un miss NON cambia l\'ID nativo dell\'episodio e (b) incrementa i contatori di miss', async () => {
        // Mock resolveKitsu per simulare l'assenza di regole Kitsu
        jest.spyOn(animeMappingStore, 'resolveKitsu').mockReturnValue({
            error: 'Episodio non coperto dai mapping per tmdb:99999'
        });

        const initialId1 = 'tmdb:99999:1:1';
        const initialId2 = 'tmdb:99999:1:2';
        const meta = {
            type: 'series',
            _isAnime: true,
            videos: [
                { id: initialId1, season: 1, episode: 1, title: 'Episodio 1' },
                { id: initialId2, season: 1, episode: 2, title: 'Episodio 2' }
            ]
        };

        await applyKitsuMappingToMeta(meta, 99999);

        // (a) L'ID nativo deve rimanere inalterato
        expect(meta.videos[0].id).toBe(initialId1);
        expect(meta.videos[1].id).toBe(initialId2);

        // (b) Il contatore di miss deve essere scattato e aggregato per tmdbId:season
        const stats = getKitsuMappingStats();
        expect(stats.totalMisses).toBe(2);
        expect(stats.misses.get('99999:1')).toBe(2);
        expect(stats.totalCollisions).toBe(0);
    });

    test('Una collisione Kitsu mantiene l\'ID nativo per il duplicato e incrementa il contatore di collisioni', async () => {
        // Due episodi che mappano erroneamente sullo stesso target Kitsu
        jest.spyOn(animeMappingStore, 'resolveKitsu').mockReturnValue({
            success: true,
            kitsuId: 5555,
            kitsuEpisode: 1
        });

        const nativeId1 = 'tmdb:88888:1:1';
        const nativeId2 = 'tmdb:88888:1:2';
        const meta = {
            type: 'series',
            _isAnime: true,
            videos: [
                { id: nativeId1, season: 1, episode: 1 },
                { id: nativeId2, season: 1, episode: 2 }
            ]
        };

        await applyKitsuMappingToMeta(meta, 88888);

        // Il primo episodio riceve l'ID Kitsu normalizzato
        expect(meta.videos[0].id).toBe('kitsu:5555:1');
        // Il secondo episodio subisce collisione e deve preservare l'ID nativo TMDB
        expect(meta.videos[1].id).toBe(nativeId2);

        // Verifica tracciamento collisione
        const stats = getKitsuMappingStats();
        expect(stats.totalCollisions).toBe(1);
        expect(stats.collisions.get('kitsu:5555:1')).toBe(1);
        expect(stats.totalMisses).toBe(0);
    });

    test('Non traccia miss se il contenuto non è un anime (_isAnime === false)', async () => {
        jest.spyOn(animeMappingStore, 'resolveKitsu').mockReturnValue({
            error: 'No rule'
        });

        const meta = {
            type: 'series',
            _isAnime: false,
            videos: [
                { id: 'tmdb:1396:1:1', season: 1, episode: 1 }
            ]
        };

        await applyKitsuMappingToMeta(meta, 1396);

        expect(meta.videos[0].id).toBe('tmdb:1396:1:1');
        const stats = getKitsuMappingStats();
        expect(stats.totalMisses).toBe(0);
        expect(stats.missesCount).toBe(0);
    });

    test('Rispetta il tetto di memoria di 200 chiavi massime (bounded map)', async () => {
        jest.spyOn(animeMappingStore, 'resolveKitsu').mockReturnValue({ error: 'No rule' });

        // Genera 250 stagioni diverse per verificare che la mappa non superi 200 chiavi
        for (let s = 1; s <= 250; s++) {
            const meta = {
                type: 'series',
                _isAnime: true,
                videos: [{ id: `tmdb:77777:${s}:1`, season: s, episode: 1 }]
            };
            await applyKitsuMappingToMeta(meta, 77777);
        }

        const stats = getKitsuMappingStats();
        // Il conteggio totale di miss traccia tutti i 250 eventi
        expect(stats.totalMisses).toBe(250);
        // La dimensione della Map non deve superare il tetto di 200 chiavi
        expect(stats.missesCount).toBeLessThanOrEqual(200);
        expect(stats.misses.size).toBeLessThanOrEqual(200);
    });

    test('Aggregazione miss per stagioni diverse della stessa serie', async () => {
        jest.spyOn(animeMappingStore, 'resolveKitsu').mockReturnValue({ error: 'No rule' });

        const meta = {
            type: 'series',
            _isAnime: true,
            videos: [
                { id: 'tmdb:1111:1:1', season: 1, episode: 1 },
                { id: 'tmdb:1111:1:2', season: 1, episode: 2 },
                { id: 'tmdb:1111:2:1', season: 2, episode: 1 }
            ]
        };

        await applyKitsuMappingToMeta(meta, 1111);

        const stats = getKitsuMappingStats();
        expect(stats.totalMisses).toBe(3);
        expect(stats.misses.get('1111:1')).toBe(2);
        expect(stats.misses.get('1111:2')).toBe(1);
    });

    test('Trigger del log aggregato al raggiungimento della soglia senza eccezioni', async () => {
        jest.spyOn(animeMappingStore, 'resolveKitsu').mockReturnValue({ error: 'No rule' });
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const videos = [];
        for (let i = 1; i <= 50; i++) {
            videos.push({ id: `tmdb:2222:1:${i}`, season: 1, episode: i });
        }

        const meta = {
            type: 'series',
            _isAnime: true,
            videos
        };

        await applyKitsuMappingToMeta(meta, 2222);

        // A 50 miss deve essere invocato il log di riepilogo aggregato
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[KitsuMapping Stats]')
        );

        warnSpy.mockRestore();
    });
});
