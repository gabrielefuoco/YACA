/**
 * Un film di durata ignota non è un film corto.
 *
 * TMDB risponde `runtime: 0` quando non conosce la durata, e nel dump quei 658 film (0,67% del
 * catalogo) erano indistinguibili da film da zero minuti: `durata < 90` li restituiva, e il filtro
 * «film sotto l'ora e mezza» era una promessa non mantenuta in silenzio.
 */
const { F } = require('../src/indice/filters');

describe('filtro sulla durata massima', () => {
    it('esclude la durata ignota (runtime = 0) e i NULL', () => {
        expect(F.maxRuntime(90)).toBe('"runtime" BETWEEN 1 AND 90');
        expect(F.maxRuntime(45)).toBe('"runtime" BETWEEN 1 AND 45');
    });

    it('il minimo non ha bisogno di guardia: zero non è mai ≥ 1', () => {
        expect(F.minRuntime(150)).toBe('"runtime" >= 150');
    });

    it('la regola è la stessa dei cortometraggi già esistente', () => {
        // `shortFilm` escludeva gli ignoti da sempre: era la formula giusta, solo non condivisa.
        expect(F.shortFilm).toBe('"runtime" BETWEEN 1 AND 45');
        expect(F.maxRuntime(45)).toBe(F.shortFilm);
    });
});
