/**
 * Il ciclo che formatta gli episodi di una stagione NON fa rete: prende episodi già
 * scaricati (`season/N` dentro la risposta `append_to_response`) e costruisce oggetti.
 * Eppure passava `delayMs: 40` a `rateLimitedMap`, che dorme `delayMs` **per worker**
 * dopo ogni elemento.
 *
 * La conseguenza è stata misurata in produzione il 04/10/2026: la scheda FREDDA di
 * I Simpson (tmdb:456, 39 stagioni, 888 episodi) costava ~6.240 ms contro i ~56 ms a
 * caldo. Quel sonno non protegge nessuna API: toglie ~7 secondi di attesa a chi apre
 * una serie lunga per la prima volta.
 *
 * Qui si prova la cosa vera: `fetchTmdbEpisodes` con un client TMDB finto che risponde
 * subito (zero I/O di rete, zero latenza) e tutti gli overview già presenti (quindi il
 * ciclo delle stagioni non parte nemmeno con le richieste di fallback). Il tempo di parete
 * che resta è tempo speso a formattare oggetti, non a fare rete. Con il `delayMs: 40` di
 * prima il test va rosso di parecchi secondi; con `delayMs: 0` resta nell'ordine dei
 * millisecondi.
 */

jest.mock('../src/cache/CacheManager', () => {
    class FakeCacheManager {
        constructor(namespace) {
            this.namespace = namespace;
        }
        _store() {
            if (!mockStore.has(this.namespace)) mockStore.set(this.namespace, new Map());
            return mockStore.get(this.namespace);
        }
        async getWithStatus(key) {
            return this._store().has(key)
                ? { value: this._store().get(key), status: 'fresh' }
                : { value: undefined, status: 'miss' };
        }
        async set(key, value) {
            this._store().set(key, value);
        }
    }
    return FakeCacheManager;
});

// Il contratto della prova è solo "il sonno è sparito": se il modulo sotto test non
// arrivasse al formattamento la durata sarebbe bassa anche col vecchio codice, quindi si
// verifica anche che tutti gli episodi siano usciti bene.
const mockStore = new Map();

// Cliente TMDB finto: risponde a `/tv/{id}?append_to_response=season/N` e, se arrivasse
// qualcosa di inatteso (le richieste di fallback per gli overview mancanti), lo segna.
function makeFakeClient(seasons) {
    const client = {
        unexpectedCalls: [],
        async get(url, config) {
            if (url === '/tv/456') {
                const append = String(config?.params?.append_to_response || '');
                const data = { id: 456 };
                for (const token of append.split(',')) {
                    const m = /^season\/(\d+)$/.exec(token.trim());
                    if (m) data[token.trim()] = seasons[Number(m[1])];
                }
                return { data };
            }
            client.unexpectedCalls.push(url);
            return { data: { episodes: [] } };
        }
    };
    return client;
}

/** Una stagione con `count` episodi, tutti con l'overview già in italiano. */
function makeSeason(seasonNumber, count) {
    const episodes = [];
    for (let e = 1; e <= count; e++) {
        episodes.push({
            episode_number: e,
            season_number: seasonNumber,
            name: `Episodio ${e}`,
            overview: `Trama dell'episodio ${e}`,
            air_date: '1990-01-01',
            still_path: `/still-${seasonNumber}-${e}.jpg`
        });
    }
    return { season_number: seasonNumber, episodes };
}

const { fetchTmdbEpisodes } = require('../src/clients/tmdb');

describe('fetchTmdbEpisodes: formattare gli episodi non costa un sonno', () => {
    beforeEach(() => {
        mockStore.clear();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('888 episodi (I Simpson: 39 stagioni) si formattano in millisecondi, non in secondi', async () => {
        const seasons = {};
        let total = 0;
        // I Simpson hanno 888 episodi: 13 speciali (stagione 0) più 39 stagioni da 22-23.
        for (let s = 0; s <= 39; s++) {
            const count = s === 0 ? 13 : (s <= 17 ? 23 : 22);
            seasons[s] = makeSeason(s, count);
            total += seasons[s].episodes.length;
        }
        expect(total).toBe(888); // la misura vera, episodi per episodi

        const client = makeFakeClient(seasons);

        const t0 = Date.now();
        const videos = await fetchTmdbEpisodes(client, 456, 39, 'tt0096637', 'en');
        const elapsed = Date.now() - t0;

        // Il contenuto è quello giusto: la corsa non si "vince" saltando episodi.
        expect(videos).toHaveLength(total);
        expect(client.unexpectedCalls).toEqual([]); // nessuna rete: overview già pronti
        expect(videos[0]).toMatchObject({
            id: 'tt0096637:0:1',
            title: 'Episodio 1',
            season: 0,
            episode: 1,
            thumbnail: 'https://image.tmdb.org/t/p/w500/still-0-1.jpg'
        });

        // Il sonno del vecchio codice, da solo, valeva ~888/5 * 40 ms ≈ 7.1 s: qui si chiede
        // che restino solo i millisecondi della formattazione vera.
        expect(elapsed).toBeLessThan(1000);
        console.log(`[prova] ${total} episodi formattati in ${elapsed} ms`);
    }, 60000);
});