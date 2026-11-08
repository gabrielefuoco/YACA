const { getShelfBadge, formatShelfSeeds, quantizeSliderValue } = require('../src/stremio/shelfPresentation');

describe('Presentazione Scaffali (Badge Anime & Info Semi)', () => {
    describe('Regola Badge Anime', () => {
        test('anime=true series -> «Anime» badge e switchLabel «ANIME»', () => {
            const shelf = {
                id: 'yaca_30669_series',
                nome: 'Anime shōnen',
                medium: 'series',
                anime: true
            };
            const result = getShelfBadge(shelf);
            expect(result.badge).toBe('Anime');
            expect(result.switchLabel).toBe('ANIME');
            expect(result.type).toBe('series');
        });

        test('anime=true movie -> «Film» (i film anime restano «Film»)', () => {
            const shelf = {
                id: 'yaca_preset_ghibli_movies',
                nome: 'Studio Ghibli',
                medium: 'movie',
                anime: true
            };
            const result = getShelfBadge(shelf);
            expect(result.badge).toBe('Film');
            expect(result.switchLabel).toBe('FILM');
            expect(result.type).toBe('movie');
        });

        test('anime=false series -> «Serie»', () => {
            const shelf = {
                id: 'yaca_280049_series',
                nome: 'Magia & Stregoneria',
                medium: 'series',
                anime: false
            };
            const result = getShelfBadge(shelf);
            expect(result.badge).toBe('Serie');
            expect(result.switchLabel).toBe('SERIE');
            expect(result.type).toBe('series');
        });

        test('anime=false movie -> «Film»', () => {
            const shelf = {
                id: 'yaca_83533_movie',
                nome: 'Fantascienza',
                medium: 'movie',
                anime: false
            };
            const result = getShelfBadge(shelf);
            expect(result.badge).toBe('Film');
            expect(result.switchLabel).toBe('FILM');
            expect(result.type).toBe('movie');
        });

        test('non inferisce MAI dal nome: serie intitolata "Anime" senza flag anime=true resta «Serie»', () => {
            const shelf = {
                id: 'yaca_fake_anime_series',
                nome: 'Anime Popolari Senza Flag',
                medium: 'series',
                anime: undefined
            };
            const result = getShelfBadge(shelf);
            expect(result.badge).toBe('Serie');
            expect(result.switchLabel).toBe('SERIE');
            expect(result.type).toBe('series');
        });
    });

    describe('Info Panel Semi (formatShelfSeeds)', () => {
        test('scaffale con 3 semi membri renderizza esattamente 3 righe con titolo e anno', () => {
            const shelf = {
                catalog_id: 'yaca_671_movie',
                nome: 'Perché hai visto Harry Potter, American History X e Léon',
                medium: 'movie',
                nome_fonte: 'perche_hai_visto',
                semi_membri: [
                    { titolo: 'Harry Potter e la pietra filosofale', anno: 2001, tmdbId: 671, medium: 'movie' },
                    { titolo: 'American History X', anno: 1998, tmdbId: 73, medium: 'movie' },
                    { titolo: 'Léon', anno: 1994, tmdbId: 101, medium: 'movie' }
                ],
                semi_rappresentativi: [
                    { titolo: 'Harry Potter e la pietra filosofale', anno: 2001, tmdbId: 671, plays: 3, eta_giorni: 12.4 }
                ]
            };

            const rows = formatShelfSeeds(shelf);
            expect(rows).toHaveLength(3);

            expect(rows[0]).toEqual({
                titolo: 'Harry Potter e la pietra filosofale',
                anno: 2001,
                tmdbId: 671,
                medium: 'movie',
                plays: 3,
                eta_giorni: 12
            });

            expect(rows[1]).toEqual({
                titolo: 'American History X',
                anno: 1998,
                tmdbId: 73,
                medium: 'movie',
                plays: null,
                eta_giorni: null
            });

            expect(rows[2]).toEqual({
                titolo: 'Léon',
                anno: 1994,
                tmdbId: 101,
                medium: 'movie',
                plays: null,
                eta_giorni: null
            });
        });

        test('mantiene l\'ordine esatto restituito dal grafo', () => {
            const shelf = {
                semi_membri: [
                    { titolo: 'Z-Movie', anno: 2020, tmdbId: 3 },
                    { titolo: 'A-Movie', anno: 2010, tmdbId: 1 },
                    { titolo: 'M-Movie', anno: 2015, tmdbId: 2 }
                ]
            };

            const rows = formatShelfSeeds(shelf);
            expect(rows.map(r => r.titolo)).toEqual(['Z-Movie', 'A-Movie', 'M-Movie']);
        });

        test('scaffale senza semi restituisce lista vuota senza eccezioni', () => {
            const rows = formatShelfSeeds({});
            expect(rows).toEqual([]);
        });
    });

    describe('Quantizzazione Valore Slider', () => {
        test('quantizza al passo 0.1', () => {
            expect(quantizeSliderValue(0.428)).toBe(0.4);
            expect(quantizeSliderValue(-0.73)).toBe(-0.7);
            expect(quantizeSliderValue(0.04)).toBe(0.0);
            expect(quantizeSliderValue(0.06)).toBe(0.1);
            expect(quantizeSliderValue(-0.04)).toBe(-0.0);
            expect(quantizeSliderValue(1.0)).toBe(1.0);
            expect(quantizeSliderValue(null)).toBe(0);
        });
    });
});
