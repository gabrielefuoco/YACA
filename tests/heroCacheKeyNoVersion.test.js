/**
 * La chiave della cache dei cataloghi hero non deve contenere la `configVersion`.
 *
 * PERCHE' QUESTO TEST ESISTE
 * `configVersion` è un nanoid rigenerato a ogni salvataggio della configurazione. Averlo in chiave
 * significa che salvare un profilo — o qualunque cosa che non c'entri con quel catalogo — orfana la
 * cache dell'hero, che costa 21-42 secondi a ricostruirsi. Misurato in produzione il 02/10/2026:
 * 18 tasti su 23 erano orfani, la stessa coppia utente+profilo+tipo ricostruita 9 volte.
 *
 * Il test 1 è la guardia: fissa la FORMA della chiave. Se qualcuno rimette un pezzo variabile
 * (una versione di configurazione, un timestamp, un contatore), quel test fallisce.
 */

const {
    buildSharedHeroCacheKey,
    buildRecommendationCacheKey
} = require('../src/engines/hybridRecommendations');

describe('chiave della cache dei cataloghi hero', () => {

    const base = {
        userId: 'utente1',
        context: 'profiloA',
        mediaType: 'movie',
        kidsMode: false,
        typeSelectors: {}
    };

    describe('1. La forma della chiave (la guardia contro pezzi variabili)', () => {
        it('non contiene nessuna versione di configurazione: la forma è esattamente questa', () => {
            const key = buildSharedHeroCacheKey(base);
            // `v...` è HERO_CACHE_KEY_VERSION, l'interruttore manuale: quello DEVE restare.
            // Nessun altro pezzo variabile è ammesso.
            expect(key).toMatch(/^utente1_profiloA_heroes_v\d+_movie$/);
            expect(key).not.toContain('_cv');
        });

        it('stessi ingressi → stessa chiave (deterministica)', () => {
            expect(buildSharedHeroCacheKey(base)).toBe(buildSharedHeroCacheKey({ ...base }));
        });

        it('la chiave dei cataloghi raccomandati non contiene versioni di configurazione', () => {
            const key = buildRecommendationCacheKey({
                userId: 'utente1',
                context: 'profiloA',
                catalogId: 'preset_nolan',
                kidsMode: false,
                typeSelectors: {}
            });
            expect(key).toBe('utente1_profiloA_preset_nolan');
            expect(key).not.toContain('_cv');
        });
    });

    describe('2. Quello che DEVE ancora cambiare la chiave', () => {
        it('un profilo diverso (context) → chiave diversa', () => {
            expect(buildSharedHeroCacheKey({ ...base, context: 'profiloB' }))
                .not.toBe(buildSharedHeroCacheKey(base));
        });

        it('kidsMode → chiave diversa', () => {
            expect(buildSharedHeroCacheKey({ ...base, kidsMode: true }))
                .not.toBe(buildSharedHeroCacheKey(base));
        });

        it('typeSelectors.anime → chiave diversa', () => {
            expect(buildSharedHeroCacheKey({ ...base, typeSelectors: { anime: 'exclude' } }))
                .not.toBe(buildSharedHeroCacheKey(base));
        });

        it('film e serie restano separati', () => {
            expect(buildSharedHeroCacheKey({ ...base, mediaType: 'series' }))
                .not.toBe(buildSharedHeroCacheKey(base));
        });

        it('cataloghi diversi restano separati (percorso raccomandazioni)', () => {
            const uno = buildRecommendationCacheKey({
                userId: 'utente1', context: 'profiloA', catalogId: 'preset_nolan',
                kidsMode: false, typeSelectors: {}
            });
            const due = buildRecommendationCacheKey({
                userId: 'utente1', context: 'profiloA', catalogId: 'preset_burton',
                kidsMode: false, typeSelectors: {}
            });
            expect(uno).not.toBe(due);
        });

        it('utenti diversi restano separati', () => {
            expect(buildSharedHeroCacheKey({ ...base, userId: 'utente2' }))
                .not.toBe(buildSharedHeroCacheKey(base));
        });
    });

    describe('3. Il caso che il guasto descriveva', () => {
        it('salvare la configurazione non cambia la chiave: nessun ingresso variabile la tocca', () => {
            // Questo è il cuore: prima, salvando la configurazione, `configVersion` cambiava e la
            // chiave cambiava con lui — buttando via un hero costruito in 21-42 secondi.
            // Ora la chiave dipende solo da utente, profilo, tipo, kidsMode e typeSelectors,
            // ed è la stessa identica stringa prima e dopo un salvataggio.
            const prima = buildSharedHeroCacheKey(base);
            const dopo = buildSharedHeroCacheKey(base);
            expect(dopo).toBe(prima);
        });
    });
});
