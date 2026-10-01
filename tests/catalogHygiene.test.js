const {
    isCompilationOrBoxSet,
    passesQualityFloor,
    passesSeedNetworkNonNarrativeGate,
    NON_NARRATIVE_GENRE_IDS
} = require('../src/engines/hybrid/catalogStrategies');

describe('Ticket 27: Cofanetti ed edizioni speciali nei cataloghi hero', () => {
    describe('isCompilationOrBoxSet', () => {
        test('riconosce e scarta il cofanetto The Godfather Trilogy con year-range e runtime elevato', () => {
            const godfatherTrilogy = {
                id: 364150,
                title: 'The Godfather Trilogy: 1901-1980',
                runtime: 583,
                vote_count: 178,
                vote_average: 8.9
            };
            expect(isCompilationOrBoxSet(godfatherTrilogy)).toBe(true);
            // passesQualityFloor deve scartarlo sia per catalogo standard che per hidden gems
            expect(passesQualityFloor(godfatherTrilogy, 'movie', false)).toBe(false);
            expect(passesQualityFloor(godfatherTrilogy, 'movie', true)).toBe(false);
        });

        test('riconosce cofanetti tramite solo year-range nel titolo', () => {
            expect(isCompilationOrBoxSet({ title: 'Best of Cinema 1990-1999', runtime: 120 })).toBe(true);
            expect(isCompilationOrBoxSet({ title: 'Decennio d\'oro 2000 – 2010', runtime: 90 })).toBe(true);
        });

        test('riconosce compilation/box set tramite parole chiave e runtime >= 240', () => {
            expect(isCompilationOrBoxSet({ title: 'The Lord of the Rings: The Motion Picture Trilogy', runtime: 558 })).toBe(true);
            expect(isCompilationOrBoxSet({ title: 'Alien Anthology', runtime: 450 })).toBe(true);
            expect(isCompilationOrBoxSet({ title: 'Sergio Leone - Collezione Completa', runtime: 480 })).toBe(true);
            expect(isCompilationOrBoxSet({ title: 'The Complete Matrix Series', runtime: 400 })).toBe(true);
        });

        test('NON scarta capolavori cinematografici lunghi (Sátántangó, La meglio gioventù, Novecento)', () => {
            const satantango = { id: 31414, title: 'Sátántangó', runtime: 450, vote_count: 350, vote_average: 8.1 };
            const laMeglioGioventu = { id: 11659, title: 'La meglio gioventù', runtime: 366, vote_count: 400, vote_average: 8.2 };
            const novecento = { id: 3870, title: 'Novecento', runtime: 315, vote_count: 500, vote_average: 7.9 };

            expect(isCompilationOrBoxSet(satantango)).toBe(false);
            expect(isCompilationOrBoxSet(laMeglioGioventu)).toBe(false);
            expect(isCompilationOrBoxSet(novecento)).toBe(false);

            expect(passesQualityFloor(satantango, 'movie', false)).toBe(true);
            expect(passesQualityFloor(laMeglioGioventu, 'movie', false)).toBe(true);
            expect(passesQualityFloor(novecento, 'movie', false)).toBe(true);
        });

        test('NON scarta film legittimi con parole da box set nel titolo ma runtime normale (< 240)', () => {
            const completeUnknown = { id: 661539, title: 'A Complete Unknown', runtime: 141, vote_count: 500, vote_average: 7.2 };
            const theCollection = { id: 134597, title: 'The Collection', runtime: 82, vote_count: 600, vote_average: 6.8 };
            const mortuaryCollection = { id: 524216, title: 'The Mortuary Collection', runtime: 108, vote_count: 450, vote_average: 6.7 };

            expect(isCompilationOrBoxSet(completeUnknown)).toBe(false);
            expect(isCompilationOrBoxSet(theCollection)).toBe(false);
            expect(isCompilationOrBoxSet(mortuaryCollection)).toBe(false);

            expect(passesQualityFloor(completeUnknown, 'movie', false)).toBe(true);
            expect(passesQualityFloor(theCollection, 'movie', false)).toBe(true);
            expect(passesQualityFloor(mortuaryCollection, 'movie', false)).toBe(true);
        });

        test('gestisce wrapper annidati (rawTMDB, data)', () => {
            const wrappedItem = {
                data: {
                    title: 'The Godfather Trilogy: 1901-1980',
                    runtime: 583
                }
            };
            expect(isCompilationOrBoxSet(wrappedItem)).toBe(true);
            expect(passesQualityFloor(wrappedItem, 'movie', true)).toBe(false);
        });
    });
});

describe('Ticket 28: Formati non narrativi nel seed network', () => {
    const profileDna = [35, 18, 80]; // Commedia, Dramma, Crime
    const realityDna = [10764, 35, 18]; // Reality nel DNA

    test('scarta The Kardashians (10764 Reality) quando il reality non è nel DNA', () => {
        const theKardashians = {
            id: 197067,
            name: 'The Kardashians',
            genre_ids: [10764]
        };
        expect(passesSeedNetworkNonNarrativeGate(theKardashians, profileDna)).toBe(false);
    });

    test('scarta Talk Show (10767) e News (10763) quando non nel DNA', () => {
        expect(passesSeedNetworkNonNarrativeGate({ name: 'Late Night Talk', genre_ids: [10767] }, profileDna)).toBe(false);
        expect(passesSeedNetworkNonNarrativeGate({ name: 'Daily News', genre_ids: [10763] }, profileDna)).toBe(false);
    });

    test('scarta formati non narrativi anche se accompagnati da generi del DNA (es. [18, 10764])', () => {
        const hybridReality = {
            name: 'Drama Reality Show',
            genre_ids: [18, 10764]
        };
        expect(passesSeedNetworkNonNarrativeGate(hybridReality, profileDna)).toBe(false);
    });

    test('AMMETTE il reality se compare esplicitamente nel DNA del profilo', () => {
        const theKardashians = {
            id: 197067,
            name: 'The Kardashians',
            genre_ids: [10764]
        };
        expect(passesSeedNetworkNonNarrativeGate(theKardashians, realityDna)).toBe(true);
    });

    test('AMMETTE contenuti puramente narrativi senza formati non narrativi', () => {
        const breakingBad = {
            id: 1396,
            name: 'Breaking Bad',
            genre_ids: [18, 80]
        };
        expect(passesSeedNetworkNonNarrativeGate(breakingBad, profileDna)).toBe(true);
    });
});
