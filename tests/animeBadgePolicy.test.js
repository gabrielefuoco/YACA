/**
 * tests/animeBadgePolicy.test.js
 *
 * Regola dei badge sulle copertine degli anime (fix 2026-09-23):
 *  - nel catalogo novità (`preset_anime_simulcast`) restano i badge `EP n` (card sub) e
 *    `ITA n` (card doppiata);
 *  - FUORI dal catalogo novità la copertina mostra SOLO il badge ITA, o nessun badge:
 *    mai il badge episodio, mai il badge di stagione.
 *
 * Il caso di regressione è il secondo: un anime non doppiato finiva per mostrare il
 * badge episodio (calcolato dagli episodi TMDB), cosa che l'utente non vuole.
 */


jest.mock('../src/db/models/StreamBadge', () => ({
    find: jest.fn()
}));

const { applyPostCacheBadges } = require('../src/handlers/catalogHandler');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();
const HOST_URL = 'http://localhost:7860';
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };

function buildSnapshot(docs) {
    const byTmdbId = new Map();
    const byKitsuId = new Map();
    for (const d of docs) {
        if (d.ids?.tmdb !== undefined) byTmdbId.set(String(d.ids.tmdb), d);
        if (d.ids?.kitsu !== undefined) byKitsuId.set(String(d.ids.kitsu), d);
    }
    return { docs, byTmdbId, byKitsuId, ignoredSchema: [], invalid: [], degraded: false };
}

function serieAnime({ kitsu, tmdb, dub }) {
    // La coda `episodes[]` è la verità per-episodio: se la serie è doppiata, l'episodio
    // doppiato deve stare qui (è da lì che il lettore ricava l'ultimo doppiato).
    const episodes = [
        { season: 1, episode: 5, airedAt: daysAgo(2), subIta: true, dubIta: false }
    ];
    if (dub) {
        episodes.push({ season: 1, episode: dub, airedAt: daysAgo(1), subIta: true, dubIta: true });
    }
    return {
        _id: String(tmdb),
        schemaVersion: 1,
        ids: { tmdb, kitsu },
        title: 'Serie di prova',
        italian: {
            sub: { latest: { season: 1, episode: Math.max(5, dub || 0) } },
            dub: dub ? { latest: { season: 1, episode: dub }, isSimuldub: true } : { latest: null }
        },
        episodes
    };
}

function itemAnime(kitsu, extra = {}) {
    return {
        id: `kitsu:${kitsu}`,
        type: 'series',
        name: 'Serie di prova',
        poster: 'https://image.tmdb.org/t/p/w500/prova.jpg',
        posterShape: 'poster',
        videos: [{ id: `kitsu:${kitsu}:1:5`, season: 1, episode: 5 }],
        _forceSeason: 1,
        _forceEpisode: 5,
        ...extra
    };
}

async function renderInCatalog(catalogId, kitsu, doc, extra = {}) {
    const snapshot = buildSnapshot([doc]);
    const cachedData = { metas: [itemAnime(kitsu, extra)] };
    const result = await applyPostCacheBadges(
        cachedData,
        USER_CONFIG,
        HOST_URL,
        { id: catalogId },
        'series',
        catalogId,
        { snapshot }
    );
    return result.metas[0];
}

describe('Badge sulle copertine degli anime (fuori dal catalogo novità)', () => {
    test('anime DOPPIATO: badge ITA, nessun badge episodio, nessun clone', async () => {
        const doc = serieAnime({ kitsu: '48269', tmdb: 240411, dub: 8 });
        const item = await renderInCatalog('preset_pop_anime', '48269', doc);

        expect(item.id).toBe('kitsu:48269');           // card singola, id invariato
        expect(item._forceBadgeText).toBe('ITA 8');    // badge ITA dallo stato esterno
        expect(item._itaOnlyBadge).toBe(true);         // niente badge episodio/stagione
        expect(String(item.poster)).toContain('/images/poster/'); // il badge c'è, sulla copertina
    });

    test('anime NON doppiato: nessun badge sulla copertina (mai il badge episodio)', async () => {
        const doc = serieAnime({ kitsu: '9', tmdb: 111, dub: null });
        const item = await renderInCatalog('preset_pop_anime', '9', doc);

        expect(item._forceBadgeText).toBeUndefined();
        expect(item._itaOnlyBadge).toBe(true);
        // La copertina NON viene riscritta: nessun badge disegnato sopra
        expect(String(item.poster)).not.toContain('/images/poster/');
    });

    test('nel catalogo novità la regola non si applica (il flag è solo dei cataloghi standard)', async () => {
        const doc = serieAnime({ kitsu: '48269', tmdb: 240411, dub: 8 });
        const snapshot = buildSnapshot([doc]);
        const cachedData = { metas: [itemAnime('48269')] };
        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_anime_simulcast', _provider: 'airing_state' },
            'series',
            'preset_anime_simulcast',
            { snapshot }
        );

        // Il flag che sopprime il badge episodio appartiene ai cataloghi standard: nel novità
        // i badge sono quelli decisi dai ticket 09/10 (già coperti dai test dedicati).
        expect(result.metas[0]._itaOnlyBadge).toBeUndefined();
    });
});
