const ProfileScorer = require('../src/profile/ProfileScorer');
const { finalizeHeroQualityCandidates } = require('../src/engines/hybrid/catalogStrategies');

describe('Hero Strand Diversity & Caps', () => {
    describe('ProfileScorer.getItemNarrativeStrand', () => {
        test('identifica true-crime doc (Documentario 99 + Crime 80) -> strand:true_crime_doc', () => {
            const item = {
                id: 'doc_crime_1',
                genre_ids: [99, 80],
                title: 'Night Stalker'
            };
            expect(ProfileScorer.getItemNarrativeStrand(item)).toBe('strand:true_crime_doc');
        });

        test('identifica medical drama (Dramma 18 + keywords mediche) -> strand:medical_drama', () => {
            const item = {
                id: 'med_1',
                genre_ids: [18],
                keywords: [{ name: 'doctor' }, { name: 'hospital' }],
                title: 'Dr. House'
            };
            expect(ProfileScorer.getItemNarrativeStrand(item)).toBe('strand:medical_drama');
        });

        test('identifica anime (Animazione 16 + original_language ja) -> strand:anime', () => {
            const item = {
                id: 'anime_1',
                genre_ids: [16],
                original_language: 'ja',
                title: 'Elfen Lied'
            };
            expect(ProfileScorer.getItemNarrativeStrand(item)).toBe('strand:anime');
        });

        test('fallback su genre: per generi specifici e ombrello', () => {
            const comedyItem = {
                id: 'com_1',
                genre_ids: [35],
                title: 'Comedy Movie'
            };
            expect(ProfileScorer.getItemNarrativeStrand(comedyItem)).toBe('genre:35');

            const dramaOnly = {
                id: 'drama_1',
                genre_ids: [18],
                title: 'Pure Drama'
            };
            expect(ProfileScorer.getItemNarrativeStrand(dramaOnly)).toBe('genre:18');
        });
    });

    describe('ProfileScorer.applyDiversityCaps con caps.strand', () => {
        test('nessun filone supera caps.strand', () => {
            const items = [
                { id: 'tc1', genre_ids: [99, 80], directors: [] },
                { id: 'tc2', genre_ids: [99, 80], directors: [] },
                { id: 'tc3', genre_ids: [99, 80], directors: [] },
                { id: 'tc4', genre_ids: [99, 80], directors: [] },
                { id: 'an1', genre_ids: [16], original_language: 'ja', directors: [] },
                { id: 'an2', genre_ids: [16], original_language: 'ja', directors: [] }
            ];

            const capped = ProfileScorer.applyDiversityCaps(items, { genre: 10, director: 3, strand: 2 });
            const trueCrimeItems = capped.filter(i => ProfileScorer.getItemNarrativeStrand(i) === 'strand:true_crime_doc');
            const animeItems = capped.filter(i => ProfileScorer.getItemNarrativeStrand(i) === 'strand:anime');

            expect(trueCrimeItems.length).toBe(2);
            expect(animeItems.length).toBe(2);
            expect(capped.length).toBe(4);
        });
    });

    describe('finalizeHeroQualityCandidates', () => {
        test('riempie fino a targetSize senza items consecutivi dello stesso filone', () => {
            const pool = [
                { id: 'a1', genre_ids: [16], original_language: 'ja', directors: [{ id: 1, job: 'Director' }] },
                { id: 'c1', genre_ids: [35], directors: [{ id: 2, job: 'Director' }] },
                { id: 'd1', genre_ids: [99, 80], directors: [{ id: 3, job: 'Director' }] },
                { id: 'a2', genre_ids: [16], original_language: 'ja', directors: [{ id: 4, job: 'Director' }] },
                { id: 'a3', genre_ids: [16], original_language: 'ja', directors: [{ id: 5, job: 'Director' }] },
                { id: 'c2', genre_ids: [35], directors: [{ id: 6, job: 'Director' }] },
                { id: 'd2', genre_ids: [99, 80], directors: [{ id: 7, job: 'Director' }] }
            ];

            const caps = { genre: 1, director: 1, strand: 1 };
            const result = finalizeHeroQualityCandidates(pool, caps, 6);

            expect(result.length).toBe(6);

            for (let i = 0; i < result.length - 1; i++) {
                const currentStrand = ProfileScorer.getItemNarrativeStrand(result[i]);
                const nextStrand = ProfileScorer.getItemNarrativeStrand(result[i + 1]);
                expect(currentStrand).not.toBe(nextStrand);
            }
        });
    });
});
