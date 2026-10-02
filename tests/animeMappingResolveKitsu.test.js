/**
 * tests/animeMappingResolveKitsu.test.js
 *
 * `animeMappingStore.resolveKitsuDaTmdbId(tmdbId, tipo)`: dall'id TMDB di un evento
 * della coda (che NON ha stagione né episodio) all'id Kitsu, con il MOTIVO.
 *
 * Il motivo è la parte che conta: `resolveKitsuMovie`/`isAnimeTmdbId` rispondono
 * `null`/`false` anche quando lo store non è ancora pronto, quindi per il chiamante
 * "non è un anime" e "la mappa non è caricata" sarebbero la stessa risposta, e il
 * secondo caso si tradurrebbe in poster dimenticati senza nessun errore.
 *
 * Pattern di costruzione dell'indice: nessuna rete, payload Fribb iniettato con
 * `buildFribbIndex(...)` (come in tests/animeMappingMultiTmdbIds.test.js).
 */

const animeMappingStore = require('../src/data/animeMappingStore');
const M = animeMappingStore.motiviResolveKitsu;

/** Payload Fribb iniettato: film, film con più id TMDB, serie su due id TMDB. */
const PAYLOAD = [
    // Film con due varianti TMDB (rifacimento/compilation): entrambe devono tornare a 1376.
    { type: 'MOVIE', kitsu_id: 1376, mal_id: 100, themoviedb_id: { movie: [128, 1390599] } },
    // Film con un solo id.
    { type: 'Movie', kitsu_id: 501, anidb_id: 501, themoviedb_id: { movie: 67890 } },
    // Serie TV: un id TMDB (la forma `{tv: <numero>}` del file vero).
    { type: 'TV', kitsu_id: 265, mal_id: 290, themoviedb_id: { tv: 26209 } },
    // Stessa serie, altro cour/altro record Fribb: stesso Kitsu, id TMDB diverso.
    { type: 'TV', kitsu_id: 265, mal_id: 290, themoviedb_id: { tv: 139081 } },
    // Serie che su TMDB è spezzata in due schede: un record, due id.
    { type: 'TV', kitsu_id: 411, mal_id: 511, themoviedb_id: { tv: [606, 607] } }
];

const ID_NON_ANIME = 999999;

describe('AnimeMappingStore: resolveKitsuDaTmdbId', () => {
    beforeEach(() => {
        animeMappingStore.buildFribbIndex(PAYLOAD);
        // Ripuliamo Anibridge: i test qui parlano solo del payload Fribb.
        animeMappingStore.buildAnibridgeIndex({});
        animeMappingStore.isReady = true;
    });

    afterEach(() => {
        animeMappingStore.isReady = false;
    });

    test('film mappato: id Kitsu come stringa e motivo "mappato"', () => {
        const res = animeMappingStore.resolveKitsuDaTmdbId(128, 'movie');
        expect(res).toEqual({ kitsuId: '1376', motivo: M.MAPPATO, tmdbId: '128' });
        expect(res.motivo).toBe('mappato');
    });

    test('film mappato anche dalla seconda variante TMDB (rifacimento/compilation)', () => {
        expect(animeMappingStore.resolveKitsuDaTmdbId(1390599, 'movie')).toEqual({
            kitsuId: '1376', motivo: M.MAPPATO, tmdbId: '1390599'
        });
    });

    test('id che non è un anime: kitsuId null e motivo che lo dice', () => {
        const res = animeMappingStore.resolveKitsuDaTmdbId(ID_NON_ANIME, 'movie');
        expect(res.kitsuId).toBeNull();
        expect(res.motivo).toBe('non_e_un_anime');
        expect(res.motivo).not.toBe(M.STORE_NON_PRONTO);
    });

    test('STORE NON PRONTO: motivo diverso sia da "mappato" sia da "non è un anime"', () => {
        animeMappingStore.isReady = false;

        // Film già mappato nel payload: se il motivo fosse "non è un anime" il chiamante
        // butterebbe via un doppiato che arriverà a mappa caricata.
        const film = animeMappingStore.resolveKitsuDaTmdbId(128, 'movie');
        expect(film.kitsuId).toBeNull();
        expect(film.motivo).toBe('store_non_pronto');

        // Serie già mappata: stessa cosa.
        const serie = animeMappingStore.resolveKitsuDaTmdbId(26209, 'tv');
        expect(serie.kitsuId).toBeNull();
        expect(serie.motivo).toBe('store_non_pronto');

        // E il titolo davvero non-anime non deve confondersi col store scarico.
        const altro = animeMappingStore.resolveKitsuDaTmdbId(ID_NON_ANIME, 'tv');
        expect(altro.motivo).toBe('store_non_pronto');
    });

    test('serie con più stagioni: tutti gli id TMDB del gruppo tornano allo stesso Kitsu', () => {
        // 26209 e 139081 sono due record Fribb distinti della stessa serie Kitsu 265.
        expect(animeMappingStore.resolveKitsuDaTmdbId(26209, 'tv')).toEqual({
            kitsuId: '265', motivo: M.MAPPATO, tmdbId: '26209'
        });
        expect(animeMappingStore.resolveKitsuDaTmdbId(139081, 'tv')).toEqual({
            kitsuId: '265', motivo: M.MAPPATO, tmdbId: '139081'
        });

        // Serie spezzata su due schede TMDB dentro un solo record: id 607 incluso.
        expect(animeMappingStore.resolveKitsuDaTmdbId(606, 'tv').kitsuId).toBe('411');
        expect(animeMappingStore.resolveKitsuDaTmdbId(607, 'tv').kitsuId).toBe('411');
    });

    test('tipo non gestito: kitsuId null e motivo dedicato (anche se l\'id è mappato)', () => {
        for (const tipo of [undefined, null, '', 'anime', 'MOVIE SHOW', 42]) {
            const res = animeMappingStore.resolveKitsuDaTmdbId(128, tipo);
            expect(res.kitsuId).toBeNull();
            expect(res.motivo).toBe(M.TIPO_NON_GESTITO);
        }
    });

    test('id TMDB con prefisso o stagione ("tmdb:tv:26209", "26209:2") è ripulito', () => {
        expect(animeMappingStore.resolveKitsuDaTmdbId('tmdb:tv:26209', 'tv').kitsuId).toBe('265');
        expect(animeMappingStore.resolveKitsuDaTmdbId('26209:2', 'tv').kitsuId).toBe('265');
        expect(animeMappingStore.resolveKitsuDaTmdbId('tmdb:movie:1390599', 'movie').kitsuId).toBe('1376');
    });

    test('id vuoto: motivo "id_mancante", non "non è un anime"', () => {
        for (const id of [null, undefined, '', 'tmdb:tv:']) {
            const res = animeMappingStore.resolveKitsuDaTmdbId(id, 'tv');
            expect(res.kitsuId).toBeNull();
            expect(res.motivo).toBe(M.ID_MANCANTE);
        }
    });

    test('anime noto solo ad Anibridge: "anime_senza_kitsu", NON "non è un anime"', () => {
        // Solo Anibridge: l'id TMDB è anime (badge/doppiato) ma nessun Kitsu in mappa.
        animeMappingStore.buildAnibridgeIndex({
            'anilist:9999': { 'tmdb_show:55555:s1': { '1-12': '1-12' } }
        });
        const res = animeMappingStore.resolveKitsuDaTmdbId(55555, 'tv');
        expect(res.kitsuId).toBeNull();
        expect(res.motivo).toBe(M.ANIME_SENZA_KITSU);
        expect(animeMappingStore.isAnimeTmdbId(55555)).toBe(true);
    });

    test('nessuna chiave spazzatura nell\'indice piatto', () => {
        animeMappingStore.buildFribbIndex([
            { kitsu_id: 9001, themoviedb_id: { movie: [] } },
            { kitsu_id: 9003, themoviedb_id: { tv: [null, 4242] } }
        ]);
        expect([...animeMappingStore.tmdbToKitsu.keys()]).toEqual(['4242']);
        expect(animeMappingStore.resolveKitsuDaTmdbId(4242, 'tv').kitsuId).toBe('9003');
        expect(animeMappingStore.resolveKitsuDaTmdbId(9001, 'movie').motivo).toBe(M.NON_E_UN_ANIME);
    });

    test('comportamento delle funzioni esistenti invariato', () => {
        // resolveKitsuMovie continua a restituire il kitsu_id grezzo.
        expect(animeMappingStore.resolveKitsuMovie(128)).toBe(1376);
        // La mappa inversa dei film NON contiene le serie (invariata).
        expect(animeMappingStore.tmdbToKitsuMovie.has('26209')).toBe(false);
        expect(animeMappingStore.resolveKitsuMovie(26209)).toBeNull();
        // isAnimeTmdbId invariato, e ora include anche le varianti dell'indice piatto.
        expect(animeMappingStore.isAnimeTmdbId(ID_NON_ANIME)).toBe(false);
        expect(animeMappingStore.isAnimeTmdbId(139081)).toBe(true);
        // resolveKitsu continua a volere un episodio e a rispondere con `error`.
        expect(animeMappingStore.resolveKitsu(26209, 1, 1)).toEqual({
            error: 'TMDB ID 26209:1 non presente in Anibridge'
        });
        animeMappingStore.isReady = false;
        expect(animeMappingStore.resolveKitsu(26209, 1, 1)).toEqual({ error: 'AnimeMappingStore non ancora pronto' });
    });
});