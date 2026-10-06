/**
 * tests/itaFallbackTipoAnimeBadge.test.js
 *
 * TICKET 50 — il fallback in lettura a due tipi, e la guardia che lo rende sicuro.
 *
 * IL DIFETTO: il writer delle annotazioni non conosce il tipo dell'anime e lo ri-indovina
 * (`services/doppiaggi-source/src/anime.js`: `tv` per default). I 35 film anime doppiati annotati
 * come serie cercavano `movie:<id>` in uno snapshot che ha solo `tv:<id>`: nessun badge, nessun
 * poster `_ITA`. La cura completa è scrivere il tipo nel documento; questa è la riparazione
 * immediata per i 954 documenti già scritti.
 *
 * PERCHÉ IL FALLBACK NON PUÒ ESSERE CIECO: 5.933 id TMDB vivono in entrambe le tabelle, quindi
 * `tv:<id>` non vuol dire "quel film è doppiato", vuol dire "quella serie è doppiata". Misurato il
 * 04/10/2026 sull'istantanea di produzione: 4.539 card film avrebbero preso il badge e quasi tutte
 * non hanno niente a che fare con l'animazione (è il badge di *Jin-Roh* che finisce su
 * *WWF Superstars*). Servono **due** prove, e si trovano in
 * `animeAiringState.isDubbedFilmDocForCard`: il documento anime è un film doppiato, e l'id TMDB è
 * un film per la mappa certificata (che è il tipo che il writer butta via). Ne restano 30 su 4.539,
 * e sono tutte film anime veri.
 *
 * Qui i casi sono quelli della misura: Jin-Roh, Totoro, l'id che è anche una serie, la serie che
 * non può cedere il badge al film omonimo.
 */

const itaAnnotations = require('../src/data/itaAnnotations');
const animeAiringState = require('../src/data/animeAiringState');
const animeMappingStore = require('../src/data/animeMappingStore');
const { applyPostCacheBadges: applyPostCacheBadgesRaw } = require('../src/handlers/catalogHandler');

const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const HOST_URL = 'http://localhost:7860';

/** Snapshot delle annotazioni costruito a mano: `byKey` è tutto ciò che il lettore guarda. */
function itaSnapshot(rows) {
    const byKey = new Map();
    for (const [key, value] of rows) byKey.set(key, value);
    return { byKey, count: byKey.size, trueCount: byKey.size, nullCount: 0, error: null };
}

/** Documento anime grezzo, come arriva da Mongo: da qui passa `buildSnapshot`. */
function doc(tmdbId, { episodi = 1, doppiato = true, titolo = 'Film anime' } = {}) {
    const episodes = [];
    for (let i = 1; i <= episodi; i++) episodes.push({ season: 1, episode: i, dubIta: doppiato, subIta: true });
    return {
        _id: String(tmdbId),
        schemaVersion: 1,
        ids: { tmdb: tmdbId, kitsu: String(tmdbId + 500000) },
        title: titolo,
        italian: {
            sub: { latest: { season: 1, episode: episodi } },
            dub: doppiato ? { latest: { season: 1, episode: episodi } } : null
        },
        episodes
    };
}

/**
 * Documenti reali della misura:
 *  - 823 / 8392 / 129: film veri (Jin-Roh, Totoro, Spirited Away), 1 episodio doppiato → riparati;
 *  - 902: la serie *Yu-Gi-Oh! Duel Monsters*, 224 episodi, ma quel numero è anche l'id di un film
 *    TMDB: è il film estraneo che il fallback cieco avrebbe marchiato "doppiato in italiano".
 */
const DOCS = [
    doc(823, { titolo: 'Jin-Roh: The Wolf Brigade' }),
    doc(8392, { titolo: 'Tonari no Totoro' }),
    doc(129, { titolo: 'Sen to Chihiro no Kamikakushi' }),
    doc(902, { episodi: 224, titolo: 'Yu-Gi-Oh! Duel Monsters' }),
    doc(999005, { doppiato: false, titolo: 'Solo Sub' })
];

const card = (id, type, name, extra = {}) => ({
    id,
    type,
    name,
    poster: `https://image.tmdb.org/t/p/w500/${id.replace(/:/g, '-')}.jpg`,
    _rawPoster: `https://image.tmdb.org/t/p/w500/${id.replace(/:/g, '-')}.jpg`,
    ...extra
});

const apply = (cachedData, catalogMeta, type, options) =>
    applyPostCacheBadgesRaw(cachedData, USER_CONFIG, HOST_URL, catalogMeta, type, catalogMeta.id, options);

const ANIME = { genre_ids: [16], original_language: 'ja' };
const NON_ANIME = { genre_ids: [28], original_language: 'en' };

/**
 * Mappa certificata (Fribb): dice QUALI id TMDB sono film anime. È la seconda prova della guardia
 * ed è ciò che il writer delle annotazioni conosce e butta via.
 */
beforeAll(() => {
    animeMappingStore.isReady = true;
    animeMappingStore.buildFribbIndex([
        // Jin-Roh e Totoro: la fonte li dichiara film.
        { kitsu_id: '527', type: 'Movie', themoviedb_id: { movie: [823] } },
        { kitsu_id: '482', type: 'Movie', themoviedb_id: { movie: [8392] } },
        // Yu-Gi-Oh!: la fonte lo dichiara SERIE, quindi quell'id non è il film omonimo.
        { kitsu_id: '1361', type: 'TV', themoviedb_id: { tv: 902 } }
    ]);
});

afterAll(() => {
    animeMappingStore.isReady = false;
    animeMappingStore.buildFribbIndex([]);
    animeMappingStore.buildAnibridgeIndex({});
});

describe('Ticket 50 — il fallback in lettura a due tipi ripara i film anime', () => {
    let snapshotIta;

    beforeEach(() => {
        snapshotIta = itaSnapshot([
            ['tv:823', true],      // Jin-Roh: annotato come serie dal writer
            ['tv:8392', true],     // Totoro
            ['tv:129', true],      // Spirited Away
            ['tv:902', true],      // Yu-Gi-Oh! serie: `movie:902` è un altro film
            ['tv:1399', true],     // Game of Thrones: doppiato dalla fonte principale, non è un anime
            ['tv:999005', null],   // solo sub: indecisione, nessun badge
            ['movie:27205', true], // Inception: annotato giusto, non si tocca
            ['movie:20043', true]  // Honneamise: annotato giusto
        ]);
    });

    test('1. il film anime annotato `tv` prende il badge (prima non lo prendeva)', () => {
        const snap = itaSnapshot([['tv:823', true]]);
        // Senza la guardia: nessun badge (è il difetto).
        expect(itaAnnotations.isDubbed(snap, 'movie', 823)).toBe(false);
        // Con la guardia concessa (il chiamante ha provato che è un film anime doppiato):
        expect(itaAnnotations.isDubbed(snap, 'movie', 823, { allowTypeFallback: true })).toBe(true);
    });

    test('2. la griglia: card film anime → badge ITA e poster `_ITA`', async () => {
        const airing = animeAiringState.buildSnapshot(DOCS);
        const result = await apply(
            { metas: [
                card('tmdb:823', 'movie', 'Jin-Roh: The Wolf Brigade', ANIME),
                card('tmdb:8392', 'movie', 'Tonari no Totoro', ANIME)
            ] },
            { id: 'preset_top_movies' },
            'movie',
            { snapshot: airing, itaSnapshot: snapshotIta }
        );

        expect(result.metas).toHaveLength(2);
        for (const meta of result.metas) {
            expect(meta._itaBadge).toBe(true);
            expect(meta.poster).toContain('/erdb-poster/');
            expect(meta.poster).toContain('_ITA.jpg');
        }
    });

    test('2b. la prova è sull\'id, non sulla card: senza genere e lingua il badge arriva lo stesso', async () => {
        // La classificazione anime (`isAnimeContent`) è fragile: una card può arrivare da un
        // provider che non porta né genere né lingua. Sulla guardia non può appoggiarsi.
        const airing = animeAiringState.buildSnapshot(DOCS);
        const result = await apply(
            { metas: [card('tmdb:823', 'movie', 'Jin-Roh senza metadati')] },
            { id: 'preset_hero' },
            'movie',
            { snapshot: airing, itaSnapshot: snapshotIta }
        );

        expect(result.metas[0]._itaBadge).toBe(true);
        expect(result.metas[0].poster).toContain('/erdb-poster/');
        expect(result.metas[0].poster).toContain('_ITA.jpg');
    });

    test('3. GUARDIA: un film che non è un film anime NON prende il badge', async () => {
        const airing = animeAiringState.buildSnapshot(DOCS);
        const result = await apply(
            { metas: [
                // `tv:1399` è GoT: doppiata, ma nessun documento anime → nessuna prova.
                card('tmdb:1399', 'movie', 'FilmEstraneo', NON_ANIME),
                // `tv:902` è una serie anime: il film con lo stesso numero resta pulito.
                card('tmdb:902', 'movie', 'Film con id di una serie anime', NON_ANIME)
            ] },
            { id: 'preset_top_movies' },
            'movie',
            { snapshot: airing, itaSnapshot: snapshotIta }
        );

        expect(result.metas[0]._itaBadge).toBe(false);
        expect(result.metas[0].poster).not.toContain('ITA');
        expect(result.metas[1]._itaBadge).toBe(false);
        expect(result.metas[1].poster).not.toContain('ITA');
    });

    test('3b. GUARDIA: id anime ma stato non caricato → nessun badge (degrado, non congettura)', async () => {
        const result = await apply(
            { metas: [card('tmdb:823', 'movie', 'Jin-Roh senza stato', ANIME)] },
            { id: 'preset_top_movies' },
            'movie',
            { snapshot: animeAiringState.buildSnapshot([]), itaSnapshot: snapshotIta }
        );

        expect(result.metas[0]._itaBadge).toBe(false);
        expect(result.metas[0].poster).not.toContain('ITA');
    });

    test('4. GUARDIA: la serie anime non "cede" il badge al film che porta lo stesso numero', async () => {
        const airing = animeAiringState.buildSnapshot(DOCS);
        const result = await apply(
            { metas: [card('tmdb:902', 'movie', 'Film con id di una serie', ANIME)] },
            { id: 'preset_pop_anime_movies' },
            'movie',
            { snapshot: airing, itaSnapshot: snapshotIta }
        );

        expect(result.metas[0]._itaBadge).toBe(false); // il doc ha 224 episodi: è una serie
        expect(result.metas[0].poster).not.toContain('ITA');
    });

    test('5. il caso opposto (serie annotata `movie`) non sposta il badge', async () => {
        const airing = animeAiringState.buildSnapshot(DOCS);
        const snap = itaSnapshot([['movie:20043', true]]);
        // Card serie: la chiave primaria manca e il fallback non guarda mai `movie` (direzione sola).
        expect(itaAnnotations.isDubbed(snap, 'tv', 20043, { allowTypeFallback: true })).toBe(false);

        const result = await apply(
            { metas: [card('tmdb:20043', 'series', 'Serie con id di un film', ANIME)] },
            { id: 'preset_pop_anime' },
            'series',
            { snapshot: airing, itaSnapshot: snap }
        );
        expect(result.metas[0]._itaBadge).toBe(false);
    });

    test('6. la chiave primaria ha sempre prevalenza: nessuna regressione sui film giusti', async () => {
        const airing = animeAiringState.buildSnapshot(DOCS);
        const result = await apply(
            { metas: [card('tmdb:27205', 'movie', 'Inception', NON_ANIME)] },
            { id: 'preset_top_movies' },
            'movie',
            { snapshot: airing, itaSnapshot: snapshotIta }
        );
        expect(result.metas[0]._itaBadge).toBe(true); // `movie:27205` c'è: il fallback non si guarda

        // `null` sulla chiave primaria resta `null`: il fallback non riscrive un'omonimia irrisolta.
        const incerto = itaSnapshot([['movie:27206', null], ['tv:27206', true]]);
        expect(itaAnnotations.getStatus(incerto, 'movie', 27206, { allowTypeFallback: true })).toBe(null);
        expect(itaAnnotations.isDubbed(incerto, 'movie', 27206, { allowTypeFallback: true })).toBe(false);
    });

    test('7. `null` sull\'altro tipo non produce badge, e id assente resta `false`', () => {
        const incerto = itaSnapshot([['tv:999005', null]]);
        expect(itaAnnotations.isDubbed(incerto, 'movie', 999005, { allowTypeFallback: true })).toBe(false);
        expect(itaAnnotations.isDubbed(incerto, 'movie', 999006, { allowTypeFallback: true })).toBe(false);
    });

    test('8. degrado: snapshot assente o vuoto → nessun badge, nessuna eccezione', () => {
        const vuoto = itaSnapshot([]);
        expect(itaAnnotations.isDubbed(vuoto, 'movie', 823, { allowTypeFallback: true })).toBe(false);
        expect(itaAnnotations.isDubbed(null, 'movie', 823, { allowTypeFallback: true })).toBe(false);
        expect(itaAnnotations.isDubbed(undefined, 'movie', 'non-un-id', { allowTypeFallback: true })).toBe(false);
    });
});

describe('Ticket 50 — la prova: il documento anime deve essere un film doppiato', () => {
    test('un film (1 episodio, doppiato) passa', () => {
        const [film] = animeAiringState.buildSnapshot([doc(823)]).docs;
        expect(animeAiringState.isDubbedFilmDoc(film)).toBe(true);
    });

    test('una serie (224 episodi) non passa, anche se doppiata', () => {
        const [serie] = animeAiringState.buildSnapshot([doc(902, { episodi: 224 })]).docs;
        expect(animeAiringState.isDubbedFilmDoc(serie)).toBe(false);
    });

    test('un film solo sub non passa (nessuna traccia di doppiaggio)', () => {
        const [film] = animeAiringState.buildSnapshot([doc(999005, { doppiato: false })]).docs;
        expect(animeAiringState.isDubbedFilmDoc(film)).toBe(false);
    });

    test('nessun documento, nessun badge', () => {
        expect(animeAiringState.isDubbedFilmDoc(null)).toBe(false);
        expect(animeAiringState.isDubbedFilmDoc(undefined)).toBe(false);
        expect(animeAiringState.isDubbedFilmDoc({})).toBe(false);
    });
});

describe('Ticket 50 — la seconda prova: quell\'id TMDB è davvero un film', () => {
    const filmDoc = animeAiringState.buildSnapshot([doc(823)]).docs[0];
    const serieDoc = animeAiringState.buildSnapshot([doc(902, { episodi: 224 })]).docs[0];

    test('documento film + id che la fonte certificata dice film → le due prove passano', () => {
        expect(animeAiringState.isDubbedFilmDocForCard(filmDoc, 823, animeMappingStore)).toBe(true);
    });

    test('documento film + id che la fonte NON conosce → nessuna prova, nessun badge', () => {
        // L'id di un film anime che le fonti non certificano è indistinguibile da un id qualsiasi
        // che per caso è anche un film: meglio nessun badge che un badge su un film estraneo.
        expect(animeAiringState.isDubbedFilmDocForCard(filmDoc, 129, animeMappingStore)).toBe(false);
    });

    test('serie nota: la prova 1 già la boccia, la prova 2 non la salva', () => {
        expect(animeAiringState.isDubbedFilmDocForCard(serieDoc, 902, animeMappingStore)).toBe(false);
    });

    test('mappa non pronta o assente → nessun fallback (degrado, mai un’eccezione)', () => {
        expect(animeAiringState.isDubbedFilmDocForCard(filmDoc, 823, null)).toBe(false);
        expect(animeAiringState.isDubbedFilmDocForCard(filmDoc, 823, {})).toBe(false);
        expect(animeAiringState.isDubbedFilmDocForCard(null, 823, animeMappingStore)).toBe(false);
    });
});
