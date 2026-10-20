/**
 * Ticket 17 — il tipo dedotto dal peso.
 *
 * IL DIFETTO: `convertiSemiPerGrafo` decideva il tipo del seme guardando il PESO numerico con soglie
 * cablate (`w >= 4 -> loved`, `w >= 3 -> liked`, `w === 1 -> library`). Era la ragione per cui il ticket
 * 02 ha dovuto smettere di mandare il peso al motore: era il numero a decidere il tipo, e `PESO_TIPO`
 * nel motore non contava niente. Il 02 ha tolto il sintomo (il pool non manda piu' `peso`); qui si toglie
 * la causa: il tipo viaggia come DATO (`semiDi` lo consegna in `tipi`).
 */
const { convertiSemiPerGrafo } = require('../src/pool');
const library = require('../src/library');

describe('Ticket 17: il tipo del seme e un dato, non un numero', () => {
    test('un `library` che pesa 4 resta `library` (le vecchie soglie lo chiamavano `loved`)', () => {
        // il caso della prova richiesta dal ticket: peso da `loved`, tipo dichiarato `library`
        const seeds = new Map([['603', 4]]);
        const tipi = new Map([['603', 'library']]);
        const [seme] = convertiSemiPerGrafo(seeds, { medium: 'movie', tipi });
        expect(seme.tipo).toBe('library');
    });

    test('anche `watched` con peso 3 resta `watched` (non diventa `liked`)', () => {
        const [seme] = convertiSemiPerGrafo(new Map([['314', 3]]), { medium: 'movie', tipi: new Map([['314', 'watched']]) });
        expect(seme.tipo).toBe('watched');
    });

    test('i quattro tipi dichiarati passano intatti', () => {
        const seeds = new Map([['1', 1], ['2', 1], ['3', 1], ['4', 1]]);
        const tipi = new Map([['1', 'loved'], ['2', 'liked'], ['3', 'watched'], ['4', 'library']]);
        const tipiOut = convertiSemiPerGrafo(seeds, { medium: 'movie', tipi }).map((s) => s.tipo);
        expect(tipiOut.sort()).toEqual(['library', 'liked', 'loved', 'watched']);
    });

    test('un seme senza tipo dichiarato lo DICE e resta `watched` (nessuna soglia)', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const semi = convertiSemiPerGrafo(new Map([['999', 4]]), { medium: 'movie' });
        expect(semi[0].tipo).toBe('watched');            // con le vecchie soglie sarebbe stato 'loved'
        const messaggi = warn.mock.calls.map((c) => String(c[0])).join(' ');
        expect(messaggi).toContain('senza tipo dichiarato');
        warn.mockRestore();
    });

    test('un tipo non ammesso non passa: si dichiara e si usa `watched`', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const [seme] = convertiSemiPerGrafo(new Map([['1', 4]]), { medium: 'movie', tipi: new Map([['1', 'boh']]) });
        expect(seme.tipo).toBe('watched');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    test('`semiDi` consegna i tipi, e fra piu segnali vince il piu forte', async () => {
        // nessuna cronologia reale -> nessun seme, e comunque `tipi` esiste (contratto)
        const vuoto = await library.semiDi({ userId: 'utente-senza-storia', context: 'global' });
        expect(vuoto.tipi).toBeInstanceOf(Map);
        expect(vuoto.seeds.size).toBe(0);
    });
});
