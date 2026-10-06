/**
 * Concordanza del nome del poster fra l'app e il dump offline.
 *
 * PERCHÉ QUESTO TEST ESISTE
 * Il nome del file composto lo costruiscono due lati: l'app (che chiede
 * `{host}/erdb-poster/{nome}`) e il dump offline di `scripts/erdb-builder`, che
 * precompone i file sul Legion. Se i due lati non producono lo STESSO nome, il dump
 * scrive file che l'app non chiede mai: la precomposizione diventa lavoro sprecato e
 * nessuno se ne accorge, perché l'app semplicemente ricompone al volo.
 *
 * È successo davvero (ticket 30): la versione era stata messa nel nome dall'app e non
 * dal dump, e 21k poster con badge hanno perso la precomposizione. Questo test è la
 * guardia: se qualcuno cambia una delle due sponde, rosseggia qui.
 *
 * Il nome è una funzione pura di (erdbId, badge) + la versione del disegno: qui si
 * confronta il PERCORSO della URL, non la query (i parametri `fallback`/`badge`/`tlBadge`
 * sono argomenti di rendering e non fanno parte dell'identità del file).
 */
const {
    posterFileName: nomeDalDump
} = require('../scripts/erdb-builder/build');
const {
    urlPosterComposto
} = require('../src/catalog/formatters/StremioFormatter');
const {
    calcolaVersionePoster,
    BADGE_IMG_VERSION
} = require('../src/catalog/formatters/posterBadgeVersion');

const HOST = 'https://esempio.test';

/** Il nome file dentro la URL che l'app serve a Stremio. */
function nomeDallApp(entry) {
    const url = urlPosterComposto(HOST, { ...entry, source: 'https://image.tmdb.org/t/p/w500/x.jpg' });
    return url ? url.split('?')[0].split('/').pop() : null;
}

describe('nome del poster: l\'app e il dump offline devono concordare', () => {
    const casi = [
        { nome: 'film con badge ITA', entry: { erdbId: 'tmdb:movie:27205', badge: 'ITA' } },
        { nome: 'serie con badge episodio', entry: { erdbId: 'tmdb:tv:1668', badge: 'EP 12' } },
        { nome: 'badge con spazio e underscore', entry: { erdbId: 'tmdb:tv:1399', badge: 'ITA - EP 3' } },
        { nome: 'anime con badge ITA', entry: { erdbId: 'kitsu:265', badge: 'ITA' } },
        { nome: 'poster nudo (senza badge)', entry: { erdbId: 'kitsu:265', badge: null } },
        { nome: 'poster nudo senza campo badge', entry: { erdbId: 'tmdb:movie:550' } },
    ];

    test.each(casi)('$nome: i due lati producono lo stesso nome', ({ entry }) => {
        const dalDump = nomeDalDump(entry);
        const dallApp = nomeDallApp(entry);
        expect(dallApp).toBe(dalDump);
    });

    it('la versione sta nel nome, ed è derivata da id + badge + disegno', () => {
        const conBadge = nomeDalDump({ erdbId: 'tmdb:movie:27205', badge: 'ITA' });
        const senzaBadge = nomeDalDump({ erdbId: 'tmdb:movie:27205' });
        const altroTitolo = nomeDalDump({ erdbId: 'tmdb:movie:550', badge: 'ITA' });

        // Il badge e l'id cambiano il nome...
        expect(conBadge).not.toBe(senzaBadge);
        expect(conBadge).not.toBe(altroTitolo);
        // ...e il nome ha la forma `<id sanificato>-<versione>_<badge>.jpg`.
        // La versione è un hash di 8 caratteri: se qualcuno tornasse al numero scritto
        // a mano, questa asserzione cade.
        expect(conBadge).toMatch(/^tmdb-movie-27205-[0-9a-f]{8}_ITA\.jpg$/);
        expect(senzaBadge).toMatch(/^tmdb-movie-27205-[0-9a-f]{8}\.jpg$/);
    });

    it('la versione NON dipende dall\'immagine sorgente', () => {
        // È la condizione che rende possibile la concordanza: la sorgente la conosce
        // solo l'app, quindi non può entrare in un nome che deve saper calcolare anche
        // il dump. Il prezzo (accettato) è che un cambio di poster alla sorgente non
        // invalida il composto: è lo stesso comportamento dei poster nudi.
        const a = nomeDallApp({ erdbId: 'tmdb:movie:27205', badge: 'ITA' });
        const b = urlPosterComposto(HOST, {
            erdbId: 'tmdb:movie:27205',
            badge: 'ITA',
            source: 'https://image.tmdb.org/t/p/w500/COMPLETAMENTE_DIVERSO.jpg'
        }).split('?')[0].split('/').pop();
        expect(a).toBe(b);
    });

    it('il nome porta la versione del disegno, non un numero scritto a mano', () => {
        // Se il disegno cambia (font, asset), il nome cambia da sé: nessun bump manuale.
        expect(BADGE_IMG_VERSION).toMatch(/^[0-9a-f]{8}$/);
        expect(nomeDalDump({ erdbId: 'tmdb:movie:27205', badge: 'ITA' }))
            .toMatch(new RegExp(`^tmdb-movie-27205-.{8}_ITA\\.jpg$`));
        // E il modulo condiviso risponde sulla STESSA lunghezza: la versione è quella.
        expect(calcolaVersionePoster({ erdbId: 'tmdb-movie-27205', badge: 'ITA' })).toMatch(/^[0-9a-f]{8}$/);
    });
});
