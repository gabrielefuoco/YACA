/**
 * Refresh del poster al sync, sempre — anche per gli item già `mapped: true` (ticket 30).
 *
 * Il convertitore visita solo `mapped: false`: per un item già convertito il sync è
 * l'unico giro che lo rilegge. Qui si verifica che le ops scritte in archivio portino il
 * poster RICALCOLATO (versione corrente), non la copia verbatim dell'URL che Stremio ha
 * in libreria — che per un composto è la stessa URL vecchia prodotta da YACA.
 */

// La risoluzione imdb→tmdb interroga questo modello per gli id `tt…`: senza il mock la
// query resta in buffering 10 s a ogni test (nessuna connessione Mongo nei test).
jest.mock('../src/db/models/ImdbToTmdbMapping', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
}));

const LibrarySyncService = require('../src/services/LibrarySyncService');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const { stremioClient } = require('../src/clients/stremio');
const { BADGE_IMG_VERSION } = require('../src/catalog/formatters/posterBadgeVersion');

const HOST = 'https://yaca.test';
const ERDB = 'https://easyratingsdb.com/Tk-x/poster/tmdb%3Amovie%3A12477.jpg';
const TMDB = 'https://image.tmdb.org/t/p/w500/kwXG1DSpciHsBvcBojqMqGkU7pe.jpg';
const enc = encodeURIComponent;

describe('sync: il poster composto viene riallineato, non ricopiato', () => {
    let previousHost;

    beforeEach(() => {
        previousHost = process.env.HOST_URL;
        process.env.HOST_URL = HOST;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (previousHost === undefined) delete process.env.HOST_URL;
        else process.env.HOST_URL = previousHost;
    });

    /**
     * Monta il sync con DB e Stremio finti. `storedDocs` è quello che c'è già in archivio
     * (l'item `mapped: true` che il convertitore non tocca più).
     */
    const mountSync = (stremioItems, storedDocs = []) => {
        jest.spyOn(UserAccount, 'findOne').mockResolvedValue({
            userId: 'u1',
            addonUuid: 'uuid-sync',
            apiKeys: { stremio: 'key' }
        });
        jest.spyOn(AddonConfig, 'findOne').mockResolvedValue({
            uuid: 'uuid-sync',
            save: jest.fn().mockResolvedValue(true),
            syncStatus: {}
        });
        stremioClient.post = jest.fn().mockResolvedValue({ data: { result: stremioItems } });

        const stored = storedDocs.map(d => ({ ...d }));
        jest.spyOn(UserLibraryItem, 'find').mockReturnValue({
            lean: jest.fn().mockResolvedValue(stored),
            sort: jest.fn().mockResolvedValue(stored)
        });
        jest.spyOn(UserLibraryItem.collection, 'find').mockReturnValue({
            toArray: jest.fn().mockResolvedValue(stored)
        });
        jest.spyOn(UserLibraryItem.collection, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
        jest.spyOn(UserLibraryItem.collection, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
        return jest.spyOn(UserLibraryItem, 'bulkWrite').mockResolvedValue({});
    };

    const posterScritto = (bulkWrite) => {
        const ops = bulkWrite.mock.calls[0][0];
        return ops[0].updateOne.update.$set.poster;
    };

    test('un item già mapped: true fermo a /ITA/23 viene riportato alla versione corrente', async () => {
        const vecchio = `${HOST}/images/poster/movie/tt0095327/ITA/23?original=${enc(ERDB)}&fallback=${enc(TMDB)}&t=1783098497462`;
        const bulkWrite = mountSync(
            [{ _id: 'tt0095327', name: 'La tomba delle lucciole', type: 'movie', poster: vecchio }],
            [{ itemId: 'tt0095327', mapped: true, poster: vecchio }]
        );

        await LibrarySyncService.syncLibraryForUser('u1');

        const poster = posterScritto(bulkWrite);
        expect(poster).toContain(`/ITA/${BADGE_IMG_VERSION}?`);
        expect(poster).not.toContain('/ITA/23');
        // la sorgente e il cache-busting non si perdono per strada
        const params = new URL(poster).searchParams;
        expect(params.get('original')).toBe(ERDB);
        expect(params.get('fallback')).toBe(TMDB);
        expect(params.get('t')).toBe('1783098497462');
    });

    test('la stessa URL già alla versione corrente non viene riscritta', async () => {
        const corrente = `${HOST}/images/poster/movie/tt0095327/ITA/${BADGE_IMG_VERSION}?original=${enc(ERDB)}&fallback=${enc(TMDB)}`;
        const bulkWrite = mountSync(
            [{ _id: 'tt0095327', name: 'La tomba delle lucciole', type: 'movie', poster: corrente }]
        );

        await LibrarySyncService.syncLibraryForUser('u1');

        expect(posterScritto(bulkWrite)).toBe(corrente);
    });

    test('un poster non composto cambiato su Stremio viene copiato così com\'è', async () => {
        const nuovoSuStremio = 'https://image.tmdb.org/t/p/w500/nuovo-poster.jpg';
        const bulkWrite = mountSync(
            [{ _id: 'tt0111161', name: 'Le ali della libertà', type: 'movie', poster: nuovoSuStremio }],
            [{ itemId: 'tt0111161', mapped: true, poster: 'https://image.tmdb.org/t/p/w500/vecchio.jpg' }]
        );

        await LibrarySyncService.syncLibraryForUser('u1');

        expect(posterScritto(bulkWrite)).toBe(nuovoSuStremio);
    });

    test('anche un item non convertito con poster composto riceve la versione corrente', async () => {
        const vecchio = `${HOST}/images/poster/anime/kitsu%3A142/ITA/21?original=${enc(ERDB)}&fallback=${enc(TMDB)}`;
        const bulkWrite = mountSync(
            [{ _id: 'kitsu:142', name: 'Anime', type: 'anime', poster: vecchio }]
        );

        await LibrarySyncService.syncLibraryForUser('u1');

        expect(posterScritto(bulkWrite)).toContain(`/ITA/${BADGE_IMG_VERSION}?`);
    });

    test('anche il poster RIPRISTINATO dall\'archivio (Stremio non ne manda uno) viene riallineato', async () => {
        // Stremio manda un item con la copertina spenta e `resolvePoster` non trova nulla
        // (nessun dump locale nei test). Il vecchio poster composto viene ripristinato
        // dall'archivio: deve passare per il refresh come tutti gli altri, o resterebbe
        // fermo alla versione vecchia per sempre.
        const vecchio = `${HOST}/images/poster/movie/tt0095327/ITA/23?original=${enc(ERDB)}&fallback=${enc(TMDB)}`;
        const bulkWrite = mountSync(
            [{ _id: 'tt0095327', name: 'La tomba delle lucciole', type: 'movie', poster: null }],
            [{ itemId: 'tt0095327', mapped: true, poster: vecchio }]
        );

        await LibrarySyncService.syncLibraryForUser('u1');

        const poster = posterScritto(bulkWrite);
        expect(poster).toContain(`/ITA/${BADGE_IMG_VERSION}?`);
        expect(poster).not.toContain('/ITA/23');
        expect(new URL(poster).searchParams.get('original')).toBe(ERDB);
    });
});
