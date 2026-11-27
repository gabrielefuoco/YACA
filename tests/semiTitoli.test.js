/**
 * Il seme di `simili` (`semiTitoli.js`): dal titolo scritto all'id.
 *
 * Contratti difesi qui, che sono i modi in cui le persone scrivono davvero un titolo:
 *   1. l'articolo omesso (`padrino` → *Il padrino*);
 *   2. il titolo interno, non solo il prefisso (`odissea` → *2001: Odissea nello spazio*);
 *   3. le parole attaccate (`spiderman` → *Spider-Man*);
 *   4. gli accenti (`amelie` → *Amélie*);
 *   5. il troncato che deve prendere il più visto (`hunger game` → *Hunger Games*), senza però
 *      rubare il posto al titolo giusto quando il seguito è più popolare (`cavaliere oscuro`
 *      resta *Il cavaliere oscuro*, non *Il ritorno*);
 *   6. il refuso (`batmn` → *Batman*), con misura: un carattere fino a sei lettere, due da sette.
 */

const { creaIndiceSemi, cercaSeme } = require('../src/ricerca/semiTitoli');

/** Le righe come le restituisce l'indice (film, titolo italiano + originale, voti). */
const CATALOGO = [
    { id: 155, titolo: 'Il cavaliere oscuro', titoloOriginale: 'The Dark Knight', voti: 33000 },
    { id: 49026, titolo: 'Il cavaliere oscuro - Il ritorno', titoloOriginale: 'The Dark Knight Rises', voti: 31000 },
    { id: 238, titolo: 'Il padrino', titoloOriginale: 'The Godfather', voti: 20000 },
    { id: 240, titolo: 'Il padrino - Parte II', titoloOriginale: 'The Godfather Part II', voti: 12000 },
    { id: 11, titolo: 'Guerre stellari', titoloOriginale: 'Star Wars', voti: 19000 },
    { id: 120, titolo: 'Il Signore degli Anelli - La Compagnia dell\u2019Anello', titoloOriginale: 'The Lord of the Rings: The Fellowship of the Ring', voti: 23000 },
    { id: 121, titolo: 'Il Signore degli Anelli - Le due torri', titoloOriginale: 'The Lord of the Rings: The Two Towers', voti: 21000 },
    { id: 62, titolo: '2001: Odissea nello spazio', titoloOriginale: '2001: A Space Odyssey', voti: 13000 },
    { id: 157336, titolo: 'Interstellar', titoloOriginale: 'Interstellar', voti: 41497 },
    { id: 1321663, titolo: 'Inter. Due Stelle sul Cuore', titoloOriginale: 'Inter. Due Stelle sul Cuore', voti: 3 },
    { id: 70160, titolo: 'Hunger Games', titoloOriginale: 'The Hunger Games', voti: 23851 },
    { id: 101299, titolo: 'Hunger Games: La ragazza di fuoco', titoloOriginale: 'The Hunger Games: Catching Fire', voti: 18895 },
    { id: 557, titolo: 'Spider-Man', titoloOriginale: 'Spider-Man', voti: 21538 },
    { id: 634649, titolo: 'Spider-Man: No Way Home', titoloOriginale: 'Spider-Man: No Way Home', voti: 24500 },
    { id: 194, titolo: 'Il favoloso mondo di Amélie', titoloOriginale: 'Le Fabuleux Destin d\u2019Amélie Poulain', voti: 12735 },
    { id: 999001, titolo: 'La piccola Amelie', titoloOriginale: 'La piccola Amelie', voti: 220 },
    { id: 268, titolo: 'Batman', titoloOriginale: 'Batman', voti: 11000 },
    { id: 40, titolo: 'Batman - Il film', titoloOriginale: 'Batman: The Movie', voti: 900 },
    { id: 1400, titolo: 'Batte il ferro', titoloOriginale: 'Batte il ferro', voti: 50 }
];

const indice = creaIndiceSemi(CATALOGO);
const idDi = (scritto) => {
    const scelto = cercaSeme(indice, scritto);
    return scelto ? scelto.id : null;
};

describe('il seme di simili: i modi in cui si scrive un titolo', () => {
    test('il titolo esatto vince sui suoi seguiti', () => {
        expect(idDi('batman')).toBe(268);
        expect(idDi('interstellar')).toBe(157336);
        expect(idDi('il padrino')).toBe(238);
    });

    test('l\'articolo omesso non impedisce il match', () => {
        expect(idDi('padrino')).toBe(238);
        expect(idDi('signore degli anelli')).toBe(120);
        expect(idDi('cavaliere oscuro')).toBe(155);
        expect(idDi('guerre stellari')).toBe(11);
    });

    test('il titolo originale trova il film anche se il titolo italiano è diverso', () => {
        expect(idDi('the dark knight')).toBe(155);
        expect(idDi('godfather')).toBe(238);       // non un omonimo sconosciuto
        expect(idDi('lord of the rings')).toBe(120);
    });

    test('un titolo interno non deve stare per forza all\'inizio', () => {
        expect(idDi('odissea')).toBe(62);
    });

    test('le parole attaccate funzionano', () => {
        expect(idDi('spiderman')).toBe(557);
        expect(idDi('spiderman no way home')).toBe(634649);
    });

    test('gli accenti si ignorano', () => {
        expect(idDi('amelie')).toBe(194);          // Il favoloso mondo di Amélie, non «La piccola Amelie»
        expect(idDi('Amélie')).toBe(194);
    });

    test('il troncato prende il più visto, ma non il seguito più popolare del titolo giusto', () => {
        expect(idDi('hunger game')).toBe(70160);   // Hunger Games, non «La ragazza di fuoco»
        expect(idDi('cavaliere oscuro')).toBe(155);
        expect(idDi('inter')).toBe(157336);        // non «Inter. Due Stelle sul Cuore»
    });

    test('il confine di parola conta: «man» non pesca «Batman»', () => {
        expect(idDi('man')).not.toBe(268);
        expect(idDi('ferro')).toBe(1400);
    });

    test('sotto i tre caratteri non si risponde', () => {
        expect(idDi('il')).toBeNull();
        expect(idDi('')).toBeNull();
        expect(idDi('   ')).toBeNull();
    });

    test('il refuso si accetta, ma con misura', () => {
        expect(idDi('batmn')).toBe(268);           // un carattere, parola corta
        expect(idDi('padrimo')).toBe(238);
        expect(idDi('interstelar')).toBe(157336);  // due caratteri, parola lunga
        expect(idDi('guere stellari')).toBe(11);   // una lettera in meno
    });

    test('tre errori sono un\'altra parola, e sotto le cinque lettere non si tenta', () => {
        expect(idDi('intrstlr')).toBeNull();
        expect(idDi('btmn')).toBeNull();           // quattro lettere: troppo poche per indovinare
        expect(idDi('zzzzzz')).toBeNull();         // niente di somigliante nell'indice
    });

    test('le serie non pescano nei film: l\'indice è per medium', () => {
        const serie = creaIndiceSemi([
            { id: 1399, titolo: 'Il Trono di Spade', titoloOriginale: 'Game of Thrones', voti: 24000 },
            { id: 71446, titolo: 'La casa di carta', titoloOriginale: 'La casa de papel', voti: 18000 }
        ]);
        expect(cercaSeme(serie, 'trono di spade').id).toBe(1399);
        expect(cercaSeme(serie, 'game of thrones').id).toBe(1399);
        expect(cercaSeme(serie, 'padrino')).toBeNull();
    });

    test('id non validi e righe storte non entrano nell\'indice', () => {
        const sporco = creaIndiceSemi([
            { id: 'non-un-id', titolo: 'Rotto' },
            { id: 0, titolo: 'Zero' },
            null,
            { id: 5, titolo: '', titoloOriginale: null }
        ]);
        expect(sporco.norme).toEqual([]);
    });
});
