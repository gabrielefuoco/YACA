/**
 * Il refresh del poster di libreria (ticket 30, sessione 1).
 *
 * Il caso che conta è la TRAPPOLA: per un item convertito il poster memorizzato è già un
 * URL costruito da YACA (`/images/poster/<tipo>/<id>/<episodio>/<versione>?...`), quindi
 * ricopiarlo da Stremio non cambierebbe niente. Qui si verifica che venga RICALCOLATO:
 * versione corrente, sorgenti annidate risolte, `mtime` per i composti statici.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    refreshLibraryPoster,
    refreshComposedPoster,
    refreshStaticPoster,
    unwrapComposedSource
} = require('../src/utils/libraryPosterRefresh');
const { BADGE_IMG_VERSION } = require('../src/catalog/formatters/posterBadgeVersion');

const HOST = 'https://yaca.test';
const ERDB = 'https://easyratingsdb.com/Tk-x/poster/tmdb%3Amovie%3A12477.jpg';
const TMDB = 'https://image.tmdb.org/t/p/w500/kwXG1DSpciHsBvcBojqMqGkU7pe.jpg';
const enc = encodeURIComponent;

const composto = ({ tipo = 'movie', id = 'tt0095327', episodio = 'ITA', versione = BADGE_IMG_VERSION, original = ERDB, fallback = TMDB, extra = '' } = {}) =>
    `${HOST}/images/poster/${tipo}/${enc(id)}/${episodio}/${versione}?original=${enc(original)}&fallback=${enc(fallback)}${extra}`;

describe('refreshComposedPoster — la versione nel percorso', () => {
    test('un item fermo a /ITA/23 riprende la versione corrente (il caso dei 12 in produzione)', () => {
        const vecchio = composto({ versione: 23, extra: `&t=1783098497462` });

        const nuovo = refreshComposedPoster(vecchio);

        expect(nuovo).toContain(`/ITA/${BADGE_IMG_VERSION}?`);
        expect(nuovo).not.toContain('/ITA/23');
        // il resto dell'URL non si tocca: sorgente, fallback e cache-busting restano
        const params = new URL(nuovo).searchParams;
        expect(params.get('original')).toBe(ERDB);
        expect(params.get('fallback')).toBe(TMDB);
        expect(params.get('t')).toBe('1783098497462');
    });

    test('è idempotente: un URL già alla versione corrente non viene riscritto', () => {
        const corrente = composto({ versione: BADGE_IMG_VERSION });

        expect(refreshComposedPoster(corrente)).toBe(corrente);
        expect(refreshComposedPoster(refreshComposedPoster(corrente))).toBe(corrente);
    });

    test('la forma vecchia senza versione nel percorso la riceve', () => {
        const senzaVersione = `${HOST}/images/poster/movie/tt0095327/ITA?original=${enc(ERDB)}&fallback=${enc(TMDB)}`;

        const nuovo = refreshComposedPoster(senzaVersione);

        expect(new URL(nuovo).pathname).toBe(`/images/poster/movie/tt0095327/ITA/${BADGE_IMG_VERSION}`);
    });

    test('il badge episodio nel percorso resta com\'è: si cambia solo la versione', () => {
        const conBadge = composto({ episodio: enc('ITA - EP 12'), versione: 21 });

        const nuovo = refreshComposedPoster(conBadge);

        expect(new URL(nuovo).pathname).toBe(`/images/poster/movie/tt0095327/${enc('ITA - EP 12')}/${BADGE_IMG_VERSION}`);
    });

    test('un annidamento di giri precedenti viene risolto fino all\'immagine vera', () => {
        // In archivio esiste un `original` che è a sua volta un composto, con un host
        // interno (localhost:7000) che da Stremio non sarebbe mai raggiungibile.
        const sorgenteAnnidata = `http://localhost:7000/images/poster/anime/kitsu%3A42241/ITA/24?original=${enc(ERDB)}&fallback=${enc(TMDB)}`;
        const annidato = composto({ original: sorgenteAnnidata, fallback: sorgenteAnnidata, versione: 24 });

        const nuovo = refreshComposedPoster(annidato);

        const params = new URL(nuovo).searchParams;
        expect(params.get('original')).toBe(ERDB);
        expect(params.get('fallback')).toBe(ERDB);
        expect(nuovo).not.toContain('localhost');
    });

    test('un URL relativo resta relativo', () => {
        const relativo = `/images/poster/movie/tt1/ITA/23?original=${enc(TMDB)}&fallback=${enc(TMDB)}`;

        const nuovo = refreshComposedPoster(relativo);

        expect(nuovo.startsWith('/images/poster/')).toBe(true);
        expect(nuovo).toContain(`/ITA/${BADGE_IMG_VERSION}?`);
    });

    test('un poster che non è un composto di YACA resta identico', () => {
        const esterni = [
            TMDB,
            'https://media.kitsu.io/anime/cover/1.jpg',
            'https://images.easyratingsdb.com/movie/1.jpg',
            'https://example.com/custom-poster.png',
            ''
        ];
        for (const poster of esterni) {
            expect(refreshComposedPoster(poster)).toBe(poster);
        }
    });

    test('unwrapComposedSource non scende oltre il tetto e non lancia su valori rotti', () => {
        expect(unwrapComposedSource(ERDB)).toBe(ERDB);
        expect(unwrapComposedSource('non-un-url')).toBe('non-un-url');
        expect(unwrapComposedSource(null)).toBe(null);
    });
});

describe('refreshStaticPoster — il cache-busting dei composti statici', () => {
    let dir;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-poster-refresh-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('il parametro t diventa l\'mtime del file (e il giro dopo non cambia più)', () => {
        const file = path.join(dir, 'kitsu-142_ITA.jpg');
        fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
        const mtime = String(Math.floor(fs.statSync(file).mtimeMs));

        const vecchio = `${HOST}/erdb-poster/kitsu-142_ITA.jpg?t=1`;
        const nuovo = refreshStaticPoster(vecchio, { cacheDir: dir });

        expect(new URL(nuovo).searchParams.get('t')).toBe(mtime);
        expect(refreshStaticPoster(nuovo, { cacheDir: dir })).toBe(nuovo);
    });

    test('quando il drenatore riscrive il file, l\'URL cambia (i client lo riscaricano)', () => {
        const file = path.join(dir, 'tmdb-movie-12477_ITA.jpg');
        fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
        const primo = refreshStaticPoster(`${HOST}/erdb-poster/tmdb-movie-12477_ITA.jpg?t=1`, { cacheDir: dir });

        const dopo = new Date(Date.now() + 120000);
        fs.utimesSync(file, dopo, dopo);
        const secondo = refreshStaticPoster(primo, { cacheDir: dir });

        expect(secondo).not.toBe(primo);
        expect(new URL(secondo).searchParams.get('t')).toBe(String(Math.floor(fs.statSync(file).mtimeMs)));
    });

    test('un file assente (cartella non montata) lascia l\'URL intatto', () => {
        const poster = `${HOST}/erdb-poster/inesistente_ITA.jpg?t=1`;
        expect(refreshStaticPoster(poster, { cacheDir: dir })).toBe(poster);
        expect(refreshStaticPoster(poster, { cacheDir: path.join(dir, 'non-esiste') })).toBe(poster);
    });

    test('un nome che prova a uscire dalla cartella non viene toccato', () => {
        const poster = `${HOST}/erdb-poster/..%2Fsegreti.jpg?t=1`;
        expect(refreshStaticPoster(poster, { cacheDir: dir })).toBe(poster);
    });

    test('un file esterno non-composto resta identico', () => {
        expect(refreshStaticPoster(TMDB, { cacheDir: dir })).toBe(TMDB);
    });
});

describe('refreshLibraryPoster — il dispatcher del sync', () => {
    test('manda i composti al ricalcolo e lascia stare gli altri', () => {
        const vecchio = composto({ versione: 23 });
        expect(refreshLibraryPoster(vecchio)).toContain(`/ITA/${BADGE_IMG_VERSION}?`);
        expect(refreshLibraryPoster(TMDB)).toBe(TMDB);
        expect(refreshLibraryPoster(null)).toBe(null);
        expect(refreshLibraryPoster('   ')).toBe('   ');
    });
});
