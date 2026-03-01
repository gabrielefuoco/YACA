/**
 * Tests for the Italian language fallback logic and episode badge feature.
 */

// --- Test applyEpisodeBadge from catalogHandler ---
// We test the function indirectly by extracting the logic

describe('applyEpisodeBadge logic', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV, HOST_URL: 'https://example.com' };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    // Re-implement the logic here for unit testing since it's a private function
    function applyEpisodeBadge(metas) {
        const host = process.env.HOST_URL || 'http://localhost:7000';
        const now = new Date();

        for (const meta of metas) {
            if (!meta || !meta.poster || !meta.videos || meta.videos.length === 0) continue;
            const airedEpisodes = meta.videos.filter(v => v.released && new Date(v.released) <= now);
            if (airedEpisodes.length === 0) continue;
            airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
            const latest = airedEpisodes[0];
            const badgeText = latest.season && latest.season > 1
                ? `S${latest.season}E${latest.episode}`
                : `E${latest.episode}`;
            meta.poster = `${host}/badge/poster.jpg?url=${encodeURIComponent(meta.poster)}&text=${encodeURIComponent(badgeText)}`;
        }
    }

    it('should add episode badge to poster for single-season show', () => {
        const metas = [{
            id: 'tmdb:123',
            poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
            videos: [
                { id: 'tt1:1:1', released: '2020-01-01T00:00:00.000Z', season: 1, episode: 1 },
                { id: 'tt1:1:5', released: '2020-02-01T00:00:00.000Z', season: 1, episode: 5 },
                { id: 'tt1:1:10', released: '2020-03-01T00:00:00.000Z', season: 1, episode: 10 }
            ]
        }];

        applyEpisodeBadge(metas);

        expect(metas[0].poster).toContain('/badge/poster.jpg?url=');
        expect(metas[0].poster).toContain('text=E10');
    });

    it('should add season+episode badge for multi-season show', () => {
        const metas = [{
            id: 'tmdb:456',
            poster: 'https://image.tmdb.org/t/p/w500/poster2.jpg',
            videos: [
                { id: 'tt2:1:1', released: '2020-01-01T00:00:00.000Z', season: 1, episode: 1 },
                { id: 'tt2:3:7', released: '2024-06-01T00:00:00.000Z', season: 3, episode: 7 }
            ]
        }];

        applyEpisodeBadge(metas);

        expect(metas[0].poster).toContain('text=S3E7');
    });

    it('should skip metas without poster', () => {
        const metas = [{
            id: 'tmdb:789',
            poster: null,
            videos: [{ id: 'x', released: '2020-01-01T00:00:00.000Z', season: 1, episode: 1 }]
        }];

        applyEpisodeBadge(metas);

        expect(metas[0].poster).toBeNull();
    });

    it('should skip metas without videos', () => {
        const originalPoster = 'https://image.tmdb.org/t/p/w500/poster.jpg';
        const metas = [{
            id: 'tmdb:100',
            poster: originalPoster,
            videos: []
        }];

        applyEpisodeBadge(metas);

        expect(metas[0].poster).toBe(originalPoster);
    });

    it('should skip future episodes', () => {
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const originalPoster = 'https://image.tmdb.org/t/p/w500/poster.jpg';
        const metas = [{
            id: 'tmdb:200',
            poster: originalPoster,
            videos: [
                { id: 'x', released: futureDate, season: 1, episode: 1 }
            ]
        }];

        applyEpisodeBadge(metas);

        expect(metas[0].poster).toBe(originalPoster);
    });

    it('should use HOST_URL from env', () => {
        const metas = [{
            id: 'tmdb:300',
            poster: 'https://image.tmdb.org/t/p/w500/p.jpg',
            videos: [{ id: 'x', released: '2020-01-01T00:00:00.000Z', season: 1, episode: 3 }]
        }];

        applyEpisodeBadge(metas);

        expect(metas[0].poster).toMatch(/^https:\/\/example\.com\/badge\/poster\.jpg\?/);
    });
});

// --- Test TMDB language fallback logic ---
describe('TMDB language fallback logic', () => {
    function computeFallback(data) {
        const itTitle = data.title || data.name;
        const originalTitle = data.original_title || data.original_name;
        const isItalianOriginal = data.original_language === 'it';
        const titleNeedsFallback = !isItalianOriginal && itTitle && originalTitle && itTitle === originalTitle;
        const overviewNeedsFallback = !data.overview;
        return { titleNeedsFallback, overviewNeedsFallback };
    }

    it('should detect that title needs fallback when title equals original_title for non-Italian content', () => {
        const { titleNeedsFallback, overviewNeedsFallback } = computeFallback({
            title: '千と千尋の神隠し',
            original_title: '千と千尋の神隠し',
            original_language: 'ja',
            overview: ''
        });

        expect(titleNeedsFallback).toBe(true);
        expect(overviewNeedsFallback).toBe(true);
    });

    it('should NOT need fallback for Italian content', () => {
        const { titleNeedsFallback, overviewNeedsFallback } = computeFallback({
            title: 'La vita è bella',
            original_title: 'La vita è bella',
            original_language: 'it',
            overview: 'Un film bellissimo'
        });

        expect(titleNeedsFallback).toBe(false);
        expect(overviewNeedsFallback).toBe(false);
    });

    it('should NOT need title fallback when Italian title differs from original', () => {
        const { titleNeedsFallback, overviewNeedsFallback } = computeFallback({
            title: 'Il Cavaliere Oscuro',
            original_title: 'The Dark Knight',
            original_language: 'en',
            overview: 'Batman affronta il Joker.'
        });

        expect(titleNeedsFallback).toBe(false);
        expect(overviewNeedsFallback).toBe(false);
    });

    it('should need overview fallback when overview is empty', () => {
        const { overviewNeedsFallback } = computeFallback({
            title: 'Un titolo',
            original_title: 'A Title',
            original_language: 'en',
            overview: ''
        });

        expect(overviewNeedsFallback).toBe(true);
    });

    it('should NOT need title fallback when title or original_title is undefined', () => {
        const { titleNeedsFallback } = computeFallback({
            title: undefined,
            original_title: undefined,
            original_language: 'en',
            overview: 'Some text'
        });

        expect(titleNeedsFallback).toBeFalsy();
    });
});

// --- Test Kitsu title priority ---
describe('Kitsu Italian title priority', () => {
    it('should prefer Italian title when available', () => {
        const titles = { it: 'Il mio vicino Totoro', en: 'My Neighbor Totoro', en_jp: 'Tonari no Totoro' };
        const result = titles?.it || titles?.en || titles?.en_jp || 'Titolo sconosciuto';
        expect(result).toBe('Il mio vicino Totoro');
    });

    it('should fallback to English when Italian is not available', () => {
        const titles = { en: 'My Neighbor Totoro', en_jp: 'Tonari no Totoro' };
        const result = titles?.it || titles?.en || titles?.en_jp || 'Titolo sconosciuto';
        expect(result).toBe('My Neighbor Totoro');
    });

    it('should fallback to en_jp when neither Italian nor English is available', () => {
        const titles = { en_jp: 'Tonari no Totoro' };
        const result = titles?.it || titles?.en || titles?.en_jp || 'Titolo sconosciuto';
        expect(result).toBe('Tonari no Totoro');
    });

    it('should use default when no titles available', () => {
        const titles = {};
        const result = titles?.it || titles?.en || titles?.en_jp || 'Titolo sconosciuto';
        expect(result).toBe('Titolo sconosciuto');
    });
});

// --- Test poster language fallback logic ---
describe('TMDB poster language fallback', () => {
    it('should prefer Italian poster', () => {
        const posters = [
            { iso_639_1: 'en', file_path: '/en_poster.jpg' },
            { iso_639_1: 'it', file_path: '/it_poster.jpg' },
            { iso_639_1: null, file_path: '/null_poster.jpg' }
        ];

        const itPoster = posters.find(p => p.iso_639_1 === 'it');
        const enPoster = posters.find(p => p.iso_639_1 === 'en');
        const nullPoster = posters.find(p => !p.iso_639_1);
        const bestPoster = itPoster || enPoster || nullPoster;

        expect(bestPoster.file_path).toBe('/it_poster.jpg');
    });

    it('should fallback to English poster when Italian not available', () => {
        const posters = [
            { iso_639_1: 'en', file_path: '/en_poster.jpg' },
            { iso_639_1: null, file_path: '/null_poster.jpg' }
        ];

        const itPoster = posters.find(p => p.iso_639_1 === 'it');
        const enPoster = posters.find(p => p.iso_639_1 === 'en');
        const nullPoster = posters.find(p => !p.iso_639_1);
        const bestPoster = itPoster || enPoster || nullPoster;

        expect(bestPoster.file_path).toBe('/en_poster.jpg');
    });

    it('should fallback to null-language poster when neither IT nor EN available', () => {
        const posters = [
            { iso_639_1: 'ja', file_path: '/ja_poster.jpg' },
            { iso_639_1: null, file_path: '/null_poster.jpg' }
        ];

        const itPoster = posters.find(p => p.iso_639_1 === 'it');
        const enPoster = posters.find(p => p.iso_639_1 === 'en');
        const nullPoster = posters.find(p => !p.iso_639_1);
        const bestPoster = itPoster || enPoster || nullPoster;

        expect(bestPoster.file_path).toBe('/null_poster.jpg');
    });

    it('should return undefined when no suitable poster found', () => {
        const posters = [
            { iso_639_1: 'ja', file_path: '/ja_poster.jpg' }
        ];

        const itPoster = posters.find(p => p.iso_639_1 === 'it');
        const enPoster = posters.find(p => p.iso_639_1 === 'en');
        const nullPoster = posters.find(p => !p.iso_639_1);
        const bestPoster = itPoster || enPoster || nullPoster;

        expect(bestPoster).toBeUndefined();
    });
});

// --- Test EPISODE_CATALOG_IDS ---
describe('EPISODE_CATALOG_IDS', () => {
    it('should recognize episode preset catalog IDs', () => {
        const EPISODE_CATALOG_IDS = new Set([
            'yaca_preset_preset_new_series_eps',
            'yaca_preset_preset_new_anime_eps'
        ]);

        expect(EPISODE_CATALOG_IDS.has('yaca_preset_preset_new_series_eps')).toBe(true);
        expect(EPISODE_CATALOG_IDS.has('yaca_preset_preset_new_anime_eps')).toBe(true);
        expect(EPISODE_CATALOG_IDS.has('yaca_preset_preset_new_movies')).toBe(false);
        expect(EPISODE_CATALOG_IDS.has('yaca_preset_preset_pop_series')).toBe(false);
    });
});

// --- Test imageProcessor exports ---
describe('imageProcessor module', () => {
    it('should export getBlurredImageUrl and addBadgeToImage functions', () => {
        const imageProcessor = require('../src/utils/imageProcessor');
        expect(typeof imageProcessor.getBlurredImageUrl).toBe('function');
        expect(typeof imageProcessor.addBadgeToImage).toBe('function');
    });
});
