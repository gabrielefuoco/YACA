const {
    applyHeroQualityCaps,
    finalizeHeroQualityCandidates,
    isHiddenGemPopularityAllowed,
    isHiddenGemAlignedWithProfile
} = require('../src/engines/hybrid/catalogStrategies');
const { HIDDEN_GEMS_MAX_POPULARITY, HIDDEN_GEMS_MAX_VOTES } = require('../src/engines/hybrid/dataFetchers');

function scored(id, genres, directorId, collectionId = null) {
    return {
        data: {
            id,
            genre_ids: genres,
            collection_id: collectionId,
            credits: { crew: [{ id: directorId, job: 'Director' }] }
        },
        score: 100 - Number(id)
    };
}

describe('Ticket 23: hero quality policies', () => {
    it('non riaggiunge il ramo remaining dopo i cap genere/regista', () => {
        const repeatedGenre = Array.from({ length: 12 }, (_, index) => (
            scored(index + 1, [35], 100 + index)
        ));

        const selected = applyHeroQualityCaps(repeatedGenre, { genre: 3, director: 1 });

        expect(selected.map(item => item.data.id)).toEqual([1, 2, 3]);
    });

    it('conserva una pagina ampia quando il pool contiene variazione reale', () => {
        const genres = [35, 53, 27, 9648];
        const variedPool = Array.from({ length: 20 }, (_, index) => (
            scored(index + 1, [genres[index % genres.length]], 100 + index)
        ));

        const selected = applyHeroQualityCaps(variedPool, { genre: 3, director: 1 });

        expect(selected).toHaveLength(12);
        for (const genre of genres) {
            expect(selected.filter(item => item.data.genre_ids.includes(genre))).toHaveLength(3);
        }
    });

    it('valuta il resto del pool prima del refill e conserva la prima pagina', () => {
        const preferred = Array.from({ length: 20 }, (_, index) => (
            scored(index + 1, [1000 + index], 100 + index)
        ));
        const repetitiveTail = Array.from({ length: 100 }, (_, index) => (
            scored(index + 100, [35], 500 + index)
        ));

        const selected = finalizeHeroQualityCandidates(
            [...preferred, ...repetitiveTail],
            { genre: 3, director: 1 },
            20
        );

        expect(selected.map(item => item.data.id)).toEqual(preferred.map(item => item.data.id));
    });

    it('rilegge i registi dai metadati grezzi DuckDB durante il prefiltro', () => {
        const items = [1, 2].map(id => ({
            data: {
                id,
                genre_ids: [id],
                rawTMDB: { credits: { crew: [{ id: 700, job: 'Director' }] } }
            },
            score: 10 - id
        }));

        const selected = applyHeroQualityCaps(items, { genre: 3, director: 1 });

        expect(selected.map(item => item.data.id)).toEqual([1]);
    });

    it('applica il cap a ogni collezione/franchise', () => {
        const franchises = [
            scored(1, [53], 101, 900),
            scored(2, [27], 102, 900),
            scored(3, [35], 103, 902),
            scored(4, [9648], 104, 901)
        ];
        franchises[1].data.belongs_to_collection = { id: 900 };
        delete franchises[1].data.collection_id;

        const selected = applyHeroQualityCaps(franchises, { genre: 3, director: 1 });

        expect(selected.map(item => item.data.id)).toEqual([1, 3, 4]);
    });

    it('rifiuta cluster kids/anime e concerti quando il DNA non li supporta', () => {
        const cinefilo = { compiledVectors: { V_final: { 'g:53': 8, 'g:35': 7, 'g:18': 2 } } };
        const famiglia = { compiledVectors: { V_final: { 'g:16': 12, 'g:10751': 10 } } };
        const kidsMovie = { id: 1, genre_ids: [16, 35, 10751], keywords: [{ id: 1, name: 'based on manga' }] };
        const concert = { id: 2, genre_ids: [10402, 18], keywords: [] };

        expect(isHiddenGemAlignedWithProfile(kidsMovie, cinefilo)).toBe(false);
        expect(isHiddenGemAlignedWithProfile(kidsMovie, famiglia)).toBe(true);
        expect(isHiddenGemAlignedWithProfile(concert, cinefilo)).toBe(false);
    });

    it('usa un tetto inclusivo per la popolarità delle hidden gems', () => {
        expect(HIDDEN_GEMS_MAX_POPULARITY).toBe(20);
        expect(HIDDEN_GEMS_MAX_VOTES).toBe(1000);
        expect(isHiddenGemPopularityAllowed(HIDDEN_GEMS_MAX_POPULARITY)).toBe(true);
        expect(isHiddenGemPopularityAllowed(20.01)).toBe(false);
        expect(isHiddenGemPopularityAllowed(41.4)).toBe(false);
        expect(isHiddenGemPopularityAllowed(undefined)).toBe(false);
    });
});
